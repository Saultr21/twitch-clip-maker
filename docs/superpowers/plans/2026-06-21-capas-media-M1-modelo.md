# Capas "media" — M1: Modelo mixto + migración v4 + store + export (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Pasar de capas TIPADAS (VideoLayer/ImageLayer/TextLayer, v3) a capas **"media" genéricas**: un carril (`MediaLayer`) contiene una lista de elementos MIXTOS (vídeo/imagen/texto) en secuencia, sin solape en el tiempo dentro del carril. El orden de carriles = z. Audio y subtítulos siguen aparte. Migración v3→v4. Mantener el comportamiento de composición (export) equivalente.

**Architecture:** `MediaElement` = unión discriminada por `kind` ("video"|"image"|"text") con los campos del clip/imagen/texto respectivos. `MediaLayer = { id, name, items: MediaElement[] }`. `tracks = { layers: MediaLayer[], audio }`, `version: 4`. Selectores que extraen por tipo (para preview/export/timeline que aún razonan por tipo). El store opera sobre `items` de las capas (añadir/mover/borrar elementos de cualquier tipo, no-solape por carril entre TODOS los items). El export itera capas (z) y, dentro de cada capa, sus items (cada uno como overlay temporizado, igual que ahora).

**Tech Stack:** TypeScript, Zod (discriminatedUnion), Zustand+Immer, Vitest, Fastify, FFmpeg.

**Contexto:** v3 tiene `layerSchema = discriminatedUnion("kind", [videoLayerSchema, imageLayerSchema, textLayerSchema])`, cada capa con `clips`/`items` de un solo tipo. Selectores `videoLayers/imageLayers/textLayers/allVideoClips/imageItems/textItems`. Store con helpers `findClipCtx/findImage/findText/baseVideoLayer/imageLayerFor/textLayerFor` + ops genéricas `addImageLayer/addTextLayer/reorderLayer/removeLayer/moveElementToLayer`. Export (`filterGraph`) itera `videoLayers`→`imageItems`→`textItems`... NO: itera `project.tracks.layers` en orden y compone cada capa según su `kind`.

---

## Modelo objetivo (shared/src/project.ts)

```ts
// Cada elemento lleva su kind (discriminante). Reutiliza los campos existentes.
export const videoElementSchema = videoClipSchema_fields.extend({ kind: z.literal("video") });
export const imageElementSchema = imageOverlaySchema.extend({ kind: z.literal("image") });
export const textElementSchema = textOverlaySchema.extend({ kind: z.literal("text") });
export const mediaElementSchema = z.discriminatedUnion("kind", [
  videoElementSchema, imageElementSchema, textElementSchema,
]);
export type MediaElement = z.infer<typeof mediaElementSchema>;

export const mediaLayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  items: z.array(mediaElementSchema),
});
export type MediaLayer = z.infer<typeof mediaLayerSchema>;

// tracks: { layers: z.array(mediaLayerSchema), audio: z.array(audioTrackSchema) }, version: 4
```

> `videoClipSchema` tiene un `.refine` (trimOut>trimIn). Para añadir `kind` sin perder el
> refine, define los campos del clip como un `z.object` base (`videoClipFields`),
> y crea `videoClipSchema = videoClipFields.refine(...)` (compat actual) y
> `videoElementSchema = videoClipFields.extend({ kind: z.literal("video") }).refine(...)`.
> Imagen/texto no tienen refine: `imageElementSchema = imageOverlaySchema.extend({kind})`.

**Selectores (compat para lectores que razonan por tipo):**
```ts
export function mediaLayers(p): MediaLayer[] { return p.tracks.layers; }
export function allVideoClips(p): VideoClip[]   // items kind==="video" de todas las capas
export function imageItems(p): ImageOverlay[]    // items kind==="image"
export function textItems(p): TextOverlay[]      // items kind==="text"
export function layerItems(layer): MediaElement[]
```
(Los tipos `VideoClip`/`ImageOverlay`/`TextOverlay` siguen existiendo como los campos sin `kind`; un `MediaElement` de kind video ES un VideoClip + {kind}. Para los lectores, `allVideoClips` devuelve los elementos video — que son asignables a VideoClip.)

---

## Migración v3→v4 (`migrateMedia`, pura)

- Si `version === 3`: por cada capa tipada, crear una `MediaLayer` con `items` = sus
  `clips`/`items` etiquetados con el `kind` correspondiente. Conservar el ORDEN de capas
  (z). `version` = 4. Idempotente para v4.
- Encadenar: `migrateMedia(migrateLayers(migrateProject(raw)))` en `projectsRepo.tryRead`
  (v1→v2→v3→v4) y en cualquier carga cliente que lo necesite.
- `createEmptyProject`: una `MediaLayer` vacía (`{ id, name:"", items: [] }`), version 4.

---

## Tasks

### Task 1: Esquema media + selectores + createEmptyProject + migración

**Files:** `shared/src/project.ts`, `shared/src/project.test.ts`, `server/src/services/projectsRepo.ts` (+ test)

- [ ] Definir `videoClipFields` (z.object con los campos del clip), reescribir
  `videoClipSchema = videoClipFields.refine(...)` (sin cambiar su forma pública), y los
  `*ElementSchema` + `mediaElementSchema` + `mediaLayerSchema`. Cambiar `tracks.layers` a
  `mediaLayerSchema[]` y `version` a 4.
- [ ] Selectores `mediaLayers/allVideoClips/imageItems/textItems/layerItems` (reescritos
  sobre `items` por kind). Mantén las firmas que ya consumen los lectores.
- [ ] `createEmptyProject` → `{ layers: [createMediaLayer()], audio: [] }`, v4.
  `createMediaLayer(name?)` factory.
- [ ] `migrateMedia(raw)` v3→v4 + tests (orden conservado; idempotente).
- [ ] `projectsRepo.tryRead`: encadenar `migrateMedia(migrateLayers(migrateProject(...)))`
  antes de `safeParse`; test de carga de un proyecto v3 → v4.
- [ ] Tests verde (shared + server projectsRepo). Commits por sub-bloque.

### Task 2: Store sobre capas media

**Files:** `client/src/stores/projectStore.ts` (+ test)

- [ ] Helpers: `findElement(d, id)` → `{ layer, item, index }` buscando en `items` de todas
  las capas (cualquier kind). `mediaLayerFor(d)` (primera capa, crea si no hay).
- [ ] Reescribir ops para operar sobre `items`:
  - Vídeo: `addVideoClip*`, `moveVideoClip`, `trimVideoClip`, `updateVideoClip`,
    `splitVideoAt`, `setVideoCrop`, `removeSilencesFromClip`, `applyReframe`,
    `removeVideoClipsBySource` → localizar el item (kind video) y mutarlo; el no-solape
    se comprueba contra TODOS los items de la capa (cualquier kind).
  - Imagen/texto: `addImage`/`addText`/`updateImage`/`updateText`/`setImageCrop`/
    `moveOverlay`/`trimOverlay` → sobre items de la capa, no-solape contra todos los items.
  - Capas: `addMediaLayer()`, `removeLayer(id)`, `reorderLayer(from,to)`,
    `moveElementToLayer(elementId, destLayerId, start)` (CUALQUIER kind ahora puede ir a
    cualquier capa; no-solape en destino contra todos los items). Sustituye
    `addVideoTrack/addImageLayer/addTextLayer/moveClipToTrack/addVideoClipToTrack` por las
    versiones media (un solo tipo de capa). `addVideoClipToTrack(clip, layerId, start)`
    sigue existiendo pero añade un item kind video a esa capa.
  - `applyPreset`: reconstruir capas media desde el preset (preset sigue con text[]/image[]
    → meterlos en capas media, ids nuevos).
  - `pruneSelection`: buscar el id entre todos los items.
- [ ] Tests del store (no-solope mixto por carril; mover cualquier tipo entre capas; etc.).

### Task 3: Lectores + export adaptados al modelo media

**Files:** `filterGraph.ts` (+ test), `lib/timeline.ts`, lectores UI (que sigan compilando), preset.

- [ ] `filterGraph`: iterar `project.tracks.layers`; por cada capa, recorrer sus `items` en
  orden temporal y componer cada uno como overlay según su `kind` (vídeo/imagen/texto) —
  reutiliza la lógica de overlay temporizado de la Fase 2. Audio: todos los items kind
  video (`allVideoClips`) con adelay+amix. Equivalente a hoy para proyectos migrados.
- [ ] `lib/timeline.ts` (`projectDuration`/`findSnapPoints`): usar `allVideoClips`+
  `imageItems`+`textItems` o `layers.flatMap(items)`.
- [ ] Lectores UI (`PreviewCanvas`/`OverlayLayer`/`Timeline`/`PropertiesPanel`/`CropOverlay`/
  `MediaPanel`/`ExportDialog`/`SubtitlesPanel`/`ToolRail`/`shortcuts`): adaptar a los
  selectores (que mantienen firmas). El typecheck guía. Comportamiento preservado: el
  preview AÚN compone imagen/texto encima (eso se rehace en M3). El timeline unificado se
  rehace en M2; en M1 puede seguir mostrando por-tipo derivando de los selectores (mínimo
  para compilar), o dejarse para M2.
- [ ] e2e ffmpeg: proyecto con una capa media mixta `[video, image, text]` en secuencia →
  render válido.

### Task 4: Verificación

- [ ] Suite + typecheck globales verdes (3 paquetes). Actualizar TODO.md + push.

---

## Riesgos / notas

- **Migración encadenada** v1→v2→v3→v4: cada `migrateX` actúa solo en su versión; componer
  en orden. Proyectos guardados del usuario (v2/v3) deben cargar a v4 y verse igual.
- **No-solape por carril ahora es entre TODOS los items** (vídeo+imagen+texto). Para tener
  un texto SOBRE un vídeo a la vez → en carriles distintos.
- **Equivalencia de export**: un proyecto migrado (una capa media por cada capa tipada
  previa) debe renderizar igual; verificar con test de orden + e2e.
- M2 (timeline media unificado + inserción entre cualquier par de carriles + indicador) y
  M3 (preview compositado por orden, ya sobre media) van en planes aparte.
- `videoClipSchema`/`createVideoClip` siguen para construir items video (ahora con `kind`).
