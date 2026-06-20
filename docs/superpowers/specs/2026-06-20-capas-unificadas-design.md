# Diseño — Capas unificadas (vídeo + imagen + texto en un único z-stack)

> Fecha: 2026-06-20
> Estado: aprobado, pendiente de plan de implementación
> Tarea: `TASK-015` (capas unificadas)

## Objetivo

Un único sistema de **capas** donde el orden de los carriles del timeline determina el
z-order visual, válido para **vídeo, imagen y texto** mezclados. El carril de arriba es
el que va más al frente. El audio y los subtítulos quedan aparte (no afectan al z).

Casos de uso del usuario:
- Poner un texto **detrás** de un vídeo, o una imagen **entre** dos vídeos.
- Dos textos a la vez en sitios distintos → dos carriles de texto.
- Gameplay a pantalla completa + facecam en una esquina al mismo tiempo → dos carriles
  de vídeo, el de arriba al frente.

## Decisiones de arquitectura

- `DEC-020`: **Modelo de capas tipadas.** `project.tracks.layers: Layer[]`, donde cada
  `Layer` es de un tipo (vídeo/imagen/texto) y contiene **varios elementos en secuencia**.
  Generaliza el multipista de vídeo a imagen y texto.
- `DEC-021`: **Sin solape temporal dentro de un carril** (como los clips de vídeo hoy).
  Para simultaneidad → otro carril. Esto define la semántica de "capas".
- `DEC-022`: **El orden de `layers` ES el z-order** (índice mayor = más al frente). El
  timeline muestra los carriles en ese orden (arriba = frente).
- `DEC-023`: **Audio y subtítulos fuera del stack.** `audio` sigue como pista(s) de
  sonido; los subtítulos siguen quemándose siempre encima de todo.
- `DEC-024`: **Preview por apilado HTML (opción A).** Cada capa visual se renderiza como
  un elemento HTML posicionado (`<video>`/`<img>`/`<div>` de texto) con `z-index` = orden
  de capa → z unificado real conservando el vídeo nativo fluido. Una capa **Konva única
  por encima** dibuja solo las asas de selección/transform/recorte del elemento activo
  (genérica para cualquier tipo). Se descarta el compositor todo-en-canvas (peor
  rendimiento con varios vídeos, más coste, ganancia mínima).
- `DEC-025`: **Versión de proyecto 2→3** con migración pura.

## 1. Modelo de datos (`shared/src/project.ts`)

```ts
export const videoLayerSchema = z.object({
  id: z.string().min(1), kind: z.literal("video"), name: z.string().default(""),
  clips: z.array(videoClipSchema),
});
export const imageLayerSchema = z.object({
  id: z.string().min(1), kind: z.literal("image"), name: z.string().default(""),
  items: z.array(imageOverlaySchema),
});
export const textLayerSchema = z.object({
  id: z.string().min(1), kind: z.literal("text"), name: z.string().default(""),
  items: z.array(textOverlaySchema),
});
export const layerSchema = z.discriminatedUnion("kind", [
  videoLayerSchema, imageLayerSchema, textLayerSchema,
]);
export type Layer = z.infer<typeof layerSchema>;

// tracks pasa a:
tracks: z.object({
  layers: z.array(layerSchema),
  audio: z.array(audioTrackSchema),
})
// version: 3
```

- `imageOverlaySchema` / `textOverlaySchema` ya existen (mantienen x/y/start/end/opacity/
  rotation/crop). No cambian sus campos.
- Helpers: `createVideoLayer/createImageLayer/createTextLayer`, y selectores
  `videoLayers(p)`, `allVideoClips(p)` (recorre capas vídeo), etc.

## 2. Migración v2→v3 (`migrateLayers`, pura)

De un proyecto v2 (`tracks.video: VideoTrack[]`, `tracks.image: ImageOverlay[]`,
`tracks.text: TextOverlay[]`) a v3:
- Cada `VideoTrack` → `{ kind:"video", clips }` (conserva orden).
- La lista `image` → una o varias `image` layers: se reparten respetando "sin solape
  temporal por carril" (greedy por inicio, como `assignLanes`), creando capas extra solo
  para los que se solapan en el tiempo.
- La lista `text` → ídem con `text` layers.
- **Orden final (de atrás a frente)** para conservar el aspecto actual: `[...capas de
  vídeo, ...capas de imagen, ...capas de texto]` (texto delante, luego imagen, luego
  vídeo). Subtítulos y audio aparte, sin cambios.
- Sube `version` a 3. Idempotente para v3. Se aplica antes de `projectSchema.parse` en la
  carga del servidor (`projectsRepo.tryRead`) y encadenada tras `migrateProject` (v1→v2→v3).

## 3. Compositación — Export (`server/.../filterGraph.ts`)

- Recorrer `tracks.layers` **de índice 0 (atrás) a último (frente)** y componer cada capa
  sobre el acumulado:
  - **video**: como hoy las capas superiores (concat/secuencia de la capa, escala/recorte/
    color/opacidad, overlay con ventana de tiempo por clip). La capa de vídeo más al fondo
    (primera capa de vídeo) define el fondo/base como hoy.
  - **image**: cada item con su `crop/scale/opacity/rotation` y `enable=between(start,end)`
    (ya existe la lógica de overlay de imagen; se reutiliza por item).
  - **text**: `drawtext`/capa rotada por item con `enable=between` (lógica actual reutilizada).
- Audio: igual que hoy (audio de clips de vídeo + pistas de música + ducking). Subtítulos
  ASS al final, encima.
- El orden de aplicación pasa a seguir `layers` en vez del orden fijo vídeo→imagen→texto.

## 4. Compositación — Preview (opción A; fase dedicada con su propio diseño)

- **Render**: por cada capa visible en el playhead, un elemento HTML posicionado con
  `z-index` = índice de capa:
  - video → `<video>` (uno por capa de vídeo; sincronizados al playhead por el motor; la
    capa de vídeo más al fondo es el "reloj" y la fuente del blur).
  - image → `<img>`.
  - text → `<div>` estilado.
- **Interacción**: una sola capa **Konva** por ENCIMA de todo (z máximo) que dibuja, solo
  para el elemento **seleccionado**, su rectángulo + `Transformer` (mover/escala) y, en
  modo recorte, el `CropOverlay`. Es genérica: funciona igual para vídeo/imagen/texto
  (todos posicionados por x/y/tamaño normalizados). Reutiliza la geometría `visibleRect` y
  la lógica de asas/recorte ya existente.
- **Migración del render actual**: hoy imagen/texto se dibujan EN Konva (`ImageNode`,
  `TextNode`) y el vídeo es `<video>` con un rect transparente Konva para asas
  (`VideoFrameNode`). En la opción A: imagen/texto pasan a HTML; Konva queda solo como capa
  de asas/recorte del seleccionado. Esta es la fase más grande (ver Fase 4).

## 5. Timeline (`client/src/features/timeline/`)

- Un carril por capa, en orden de `layers` (arriba = frente). La cabecera muestra el tipo
  y permite **reordenar arrastrando** (cambia el z, ya sea vídeo/imagen/texto) y **borrar**.
- **Añadir carril**: un control para crear un carril nuevo de cada tipo (vídeo/imagen/
  texto). Soltar un medio de la pista de "Medios" crea/usa un carril de vídeo; añadir texto/
  imagen desde sus herramientas crea el elemento en un carril de ese tipo (o uno nuevo).
- **Sin solape por carril**: mover/soltar respeta que los elementos de un carril no se
  solapen en el tiempo (cae a hueco libre o se rechaza, como el vídeo hoy).
- Carriles de **audio** y **subtítulos** se mantienen como ahora, abajo, fuera del z-stack.

## 6. Store (`client/src/stores/projectStore.ts`)

- Ops generalizadas sobre `layers`: añadir/borrar/reordenar capa (de cualquier tipo),
  añadir/mover/recortar/actualizar elementos dentro de su capa (buscando el elemento por id
  en cualquier capa), mover elemento entre capas del MISMO tipo (no se permite, p. ej.,
  meter un texto en una capa de vídeo).
- `findElement(id)` localiza el elemento y su capa. Selección sigue siendo `{kind, id}`.

## 7. Testing

- `migrateLayers`: v2 (vídeo/imagen/texto) → v3 con orden correcto y reparto por no-solape.
- store: añadir/borrar/reordenar capas; no-solape por carril; mover entre capas del mismo
  tipo; selección/poda.
- `filterGraph`: proyecto con capas intercaladas (texto detrás de vídeo, imagen entre
  vídeos) → cadena de overlays en el orden correcto. Verificación e2e con ffmpeg.
- Preview (Fase 4): mayormente verificación visual del usuario + helpers puros testeables.

## 8. Fases (épico; cada fase su plan, ejecución por subagentes + revisión)

1. **Modelo + migración v3** (esquema `Layer`, `migrateLayers`, ops del store, lectores a
   `layers`; comportamiento preservado: misma composición que hoy). Verde + typecheck.
2. **Export** unificado por orden de capas (+ tests + e2e ffmpeg).
3. **Timeline** unificado (carriles por capa de cualquier tipo, añadir/reordenar/borrar,
   no-solape por carril, drop/move).
4. **Preview rearquitecturado (opción A)** — la fase más grande y arriesgada; tendrá su
   **propio diseño detallado** antes de implementarse (apilado HTML + capa Konva de asas).
5. **Pulido**: props por capa, nombres de carril, edge cases.

> Nota de orden: Fases 1-3 dejan el modelo y el export correctos y el timeline usable, pero
> el **preview** seguirá mostrando el z antiguo (imagen/texto siempre delante) hasta la Fase
> 4. Es un estado intermedio consciente: el export ya respeta el z real; el preview se
> alinea en la Fase 4. (Alternativa: adelantar un apaño parcial de z en el preview actual de
> Konva para imagen/texto entre vídeos, pero no resuelve "texto detrás de vídeo" sin la
> rearquitectura, así que se hace bien en la Fase 4.)

## Riesgos / notas

- **Preview (Fase 4)** es el grueso del riesgo: mezclar `<video>` nativo, `<img>`, texto
  HTML y una capa Konva de asas, todo con z unificado, selección y recorte. Tendrá diseño
  propio.
- **Migración**: muchos lectores de `tracks.video/image/text` pasan a `tracks.layers`; red
  de seguridad = los ~257 tests. El typecheck guía la Fase 1.
- **Compatibilidad**: proyectos v1 → v2 → v3 encadenando migraciones; conservar el aspecto
  visual tras migrar.
- Se trabaja directo en `master`, sin ramas (preferencia del usuario).
