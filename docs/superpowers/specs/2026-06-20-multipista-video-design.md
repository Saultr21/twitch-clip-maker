# Diseño — Multipista de vídeo (PiP / NLE)

> Fecha: 2026-06-20
> Estado: aprobado, pendiente de plan de implementación
> Tarea: `TASK-012` (TODO.md)

## Objetivo

Permitir varias pistas de vídeo que se compositan a la vez (picture-in-picture y, en
general, edición multipista): un vídeo encima de otro (p. ej. facecam sobre gameplay),
con audio de todas las capas, arrastre de clips entre pistas y opacidad por capa.

Las imágenes **ya** se apilan entre sí (`tracks.image` es un array con z-order por
orden, en preview y export). Este diseño cubre lo que falta: **vídeo sobre vídeo**.

## Imprescindibles de la v1 (acordados con el usuario)

1. Audio de **todas** las capas (no solo la base).
2. **N pistas** (no limitado a 2).
3. **Arrastrar clips entre pistas** en el timeline.
4. **Opacidad por capa** (por clip superpuesto).

Fuera de v1 (el modelo los admite sin migrar de nuevo): mute/hide/bloqueo de pista,
fundidos por clip, reordenar pistas arrastrando la pista entera.

## Decisiones de arquitectura

- `DEC-010`: **Modelo en array de pistas** (`tracks.video: VideoTrack[]`), no campo
  `track` plano. Cada pista es un objeto con identidad propia → sitio natural para
  futuras features por pista (mute/hide/reordenar). El orden del array **es** el
  z-order. Coste asumido: migración de esquema y tocar todo lo que lee `tracks.video`.
- `DEC-011`: **Sin solapes dentro de una pista** (siguen siendo secuenciales); los
  solapes solo ocurren entre pistas distintas. Es lo que produce el PiP.
- `DEC-012`: La **pista base** (índice 0) conserva el comportamiento actual: contain
  sobre el lienzo y fuente del fondo blur. Las pistas superiores solo compositan.
- `DEC-013`: El **audio multipista** reutiliza el patrón de las pistas de música
  (delay a `timelineStart` + volumen + `amix`); la base sigue por `concat`. Evita
  reescribir la ruta de audio existente.

## 1. Modelo de datos (`shared/src/project.ts`)

```ts
// Nuevo
export const videoTrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  clips: z.array(videoClipSchema),
});
export type VideoTrack = z.infer<typeof videoTrackSchema>;

// VideoClip gana:
//   opacity: norm  (def. 1)  — opacidad de la capa

// tracks.video pasa de z.array(videoClipSchema) a z.array(videoTrackSchema)
```

- `version` del proyecto sube de `1` a `2`.
- `createEmptyProject` arranca con una pista base vacía: `video: [{ id, name: "", clips: [] }]`.

## 2. Migración (v1 → v2)

- `migrateProject(raw): unknown` — pura. Si `raw.version === 1`, envuelve el
  `tracks.video` plano (`VideoClip[]`) en `[{ id: uuid, name: "", clips }]` y sube
  `version` a `2`. Idempotente para v2.
- Se aplica **antes** de `projectSchema.parse` en los dos puntos de carga:
  - Cliente: `loadProject` (y restauración de sesión desde localStorage).
  - Servidor: al leer el `.json` del proyecto para exportar.
- Test: un proyecto v1 con N clips planos → v2 con una sola pista que los contiene.

## 3. Store (`client/src/stores/projectStore.ts`)

Las operaciones de vídeo pasan a operar sobre pistas. Helpers internos para localizar
clip/pista por id. Cambios:

- `addVideoClip` / `addVideoClipAt`: añaden a la **pista base** (índice 0) por defecto.
- Nuevas ops:
  - `addVideoTrack()` → crea una pista vacía (encima).
  - `removeVideoTrack(trackId)` → elimina pista y sus clips (no permitir quedarse sin
    ninguna; si se borra la base, la siguiente pasa a base).
  - `moveClipToTrack(clipId, destTrackId, newStart)` → reasigna pista. Si en la
    posición destino solaparía con otro clip de esa pista, **se rechaza el movimiento**
    (el clip se queda donde estaba), igual que `moveVideoClip` hoy rechaza el solape.
- `moveVideoClip`, `trimVideoClip`, `updateVideoClip`, `splitVideoAt`, `setVideoCrop`,
  `removeElement(video)`, `removeVideoClipsBySource`, `applyReframe`,
  `removeSilencesFromClip`: se actualizan para buscar el clip en cualquier pista y
  aplicar el no-solape **dentro de su pista**.
- `updateVideoClip` admite `opacity`.
- Selección: `Selection` sigue siendo `{ kind, id }` con `id` = id de clip (uuid
  único entre pistas), así que no cambia; `pruneSelection` busca en todas las pistas.

## 4. Preview (`client/src/features/preview/`)

- **PreviewCanvas**: tras el fondo, renderiza un `<video>` por pista (de abajo a
  arriba), cada uno con el clip activo de esa pista en el playhead, posición/tamaño
  con la geometría visible ya existente (`renderRect` equivalente del cliente),
  `opacity` del clip y z-order por orden de pista. La base conserva el rol de fuente
  del fondo blur.
- **Motor (`usePlaybackEngine`)**: hoy sincroniza un único `videoRef`. Se generaliza:
  - Registro `Map<trackId, HTMLVideoElement>`; cada `<video>` de pista se registra al
    montar y se da de baja al desmontar.
  - `sync(seeking)` itera el registro: para cada pista busca su clip activo en el
    playhead y ajusta `src`/`currentTime`/`play`/`pause`/`volume`/`playbackRate`. Si
    una pista no tiene clip activo, su `<video>` se pausa y oculta.
  - La **pista base** sigue siendo el reloj del rAF (avance del playhead). En huecos
    de la base, el playhead avanza por reloj de pared (como ahora).
- **OverlayLayer / VideoFrameNode**: se renderiza un recuadro de selección por clip
  de vídeo seleccionable (el activo de cada pista), en z-order. `computeBounds` y la
  geometría buscan el clip en cualquier pista. La manipulación (mover/zoom/crop) ya
  existente se reutiliza.

## 5. Timeline (`client/src/features/timeline/`)

- Un carril por pista de vídeo. Convención: **carril superior = capa superior**
  (z-order arriba); la base queda en el carril de vídeo más bajo.
- Botón **añadir pista** y acción de **quitar pista**.
- **Arrastre entre pistas**: arrastrar un clip en vertical lo reasigna a otra pista
  (`moveClipToTrack`), en horizontal cambia `timelineStart`. Si la posición destino
  solaparía con otro clip de esa pista, el movimiento se rechaza (el clip vuelve a su
  sitio), igual que el arrastre horizontal actual al pisar otro clip.
- El resto de carriles (texto, imagen, audio, subtítulos) no cambian.

## 6. Export (`server/src/services/ffmpeg/filterGraph.ts`)

- **Base (pista 0)**: `concat` como ahora → `[vcat]` (incluye su fondo, huecos, etc.).
- **Pistas superiores**: para cada clip (en z-order, de la pista 1 hacia arriba):
  - input de vídeo; `trim` + (`crop` si tiene) + `setpts`.
  - `scale` a `renderRect(...)` + filtros de color.
  - opacidad: `format=rgba,colorchannelmixer=aa=opacity` (como las imágenes).
  - `overlay=x=rect.left:y=rect.top:enable='between(t,start,end)'` sobre el vídeo
    acumulado.
- **Audio de todas las capas**: el audio de cada clip de pista superior se procesa
  como una pista de música: `atrim` + `asetpts` + `atempo` (velocidad) + `volume` +
  `aresample` + `adelay=timelineStart` y se incorpora al `amix` final junto a `[acat]`
  y la música. El ducking, si está activo, sigue afectando a la música (no a las capas
  de vídeo) en v1.
- Las imágenes/textos/subtítulos siguen aplicándose **después** de las capas de vídeo.

## 7. Testing

- `migrateProject`: v1 plano → v2 una pista.
- `projectStore`: añadir/quitar pista; añadir clip a pista; mover clip entre pistas;
  no-solape intra-pista; opacidad.
- `filterGraph`: proyecto con 2+ pistas → cadena de `overlay` de vídeo en z-order con
  `enable` por ventana + mezcla de audio de las capas. Geometría ya cubierta por
  `geometry.test.ts`.
- Verificación e2e manual (usuario): facecam pequeño en esquina sobre gameplay, con su
  audio, exportado y reproducido.

## 8. Fases de implementación (cada una verificable por separado)

1. **Modelo + migración** — esquema `VideoTrack`, `opacity`, `version` 2,
   `migrateProject`, ops del store, tests. (Sin cambios visibles de UI todavía.)
2. **Export multipista** — `filterGraph` con overlays de vídeo + audio; tests.
   Verificable montando un proyecto multipista a mano y exportando.
3. **Preview compositado** — N `<video>`, registro y motor multipista.
4. **Timeline multipista** — carriles por pista, añadir/quitar, arrastre entre pistas.
5. **Opacidad por capa** — control en propiedades + cableado a preview/export.

## Riesgos / notas

- El motor de reproducción multi-`<video>` es la parte más delicada (sincronía de
  varios elementos a un reloj común; coste de decodificar N vídeos a la vez — aceptable
  para 2–3 pistas).
- La migración toca muchos lectores de `tracks.video`; los 217 tests existentes son la
  red de seguridad. Conviene hacer la fase 1 con el typecheck guiando los puntos a
  tocar.
- Se trabaja directo en `master` (preferencia del usuario), sin ramas.
