# Capas unificadas — Fase 1: Modelo + migración v3 (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Migrar el modelo de `tracks.{video,image,text}` separados a un único `tracks.layers: Layer[]` (capas tipadas vídeo/imagen/texto), con migración v2→v3, **preservando el comportamiento actual** (misma composición y misma UI). Build verde y todos los tests pasando.

**Architecture:** Refactor estructural sin cambio de comportamiento. `tracks.layers` es un array de capas tipadas; la migración crea capas de vídeo (desde las pistas de vídeo), UNA capa de imagen (todas las imágenes) y UNA capa de texto (todos los textos), en orden `[vídeo…, imagen, texto]` (conserva el z visual actual). Selectores en `@clipforge/shared` reconstruyen las vistas antiguas para que los lectores sigan funcionando. El no-solape por carril de imagen/texto se difiere a la fase de timeline.

**Tech Stack:** TypeScript, Zod, Zustand+Immer, Vitest, Fastify.

**Spec:** `docs/superpowers/specs/2026-06-20-capas-unificadas-design.md` (Fase 1 = §1, §2, §6 + lectores).

---

## Estructura de archivos

**Modifica:**
- `shared/src/project.ts` — `videoLayerSchema/imageLayerSchema/textLayerSchema/layerSchema`, `tracks.layers`, `version` 3, `createVideoLayer/createImageLayer/createTextLayer`, selectores (`videoLayers/imageLayers/textLayers/allVideoClips/imageItems/textItems`), `migrateLayers`, `createEmptyProject`.
- `shared/src/preset.ts` — `projectToPreset` usa selectores.
- `shared/src/project.test.ts`, `shared/src/preset.test.ts` — tests.
- `server/src/services/projectsRepo.ts` — encadenar `migrateLayers` tras `migrateProject` antes de `safeParse`.
- `server/src/services/ffmpeg/filterGraph.ts` (+ test) — leer vía selectores.
- `client/src/stores/projectStore.ts` (+ test) — ops sobre `layers`.
- `client/src/lib/timeline.ts` (+ test) — `projectDuration/findSnapPoints` vía selectores.
- Lectores UI: `OverlayLayer.tsx`, `PreviewCanvas.tsx`, `Timeline.tsx`, `PropertiesPanel.tsx`, `CropOverlay.tsx`, `MediaPanel.tsx`, `ExportDialog.tsx`, `SubtitlesPanel.tsx`, `ToolRail.tsx`, `lib/shortcuts.ts` (+ test).

**Principio:** los helpers que operan sobre `VideoClip`/`ImageOverlay`/`TextOverlay` no cambian; los llamantes les pasan los items vía selectores.

---

## Contexto actual (para el implementador)

- v2: `tracks: { video: VideoTrack[], text: TextOverlay[], image: ImageOverlay[], audio: AudioTrack[] }`. `VideoTrack = { id, name, clips: VideoClip[] }`. `version: 2`.
- Ya existen: `videoClipSchema` (con `opacity`), `imageOverlaySchema`, `textOverlaySchema`, `audioTrackSchema`, `videoTrackSchema`, `createVideoTrack`, `allVideoClips(p)` (recorre `tracks.video`), `migrateProject` (v1→v2, en shared) aplicado en `projectsRepo.tryRead`.
- El store tiene helpers internos `findClipCtx`/`baseTrack` y ops de vídeo/imagen/texto. Multitrack añadió `addVideoTrack/removeVideoTrack/moveClipToTrack/reorderVideoTrack/addVideoClipToTrack`.

---

## Task 1: Esquema de capas + versión 3

**Files:** `shared/src/project.ts`, `shared/src/project.test.ts`

- [ ] **Step 1: Definir los esquemas de capa**

En `shared/src/project.ts`, tras `videoTrackSchema` (que se mantiene para la migración), añade:

```ts
export const videoLayerSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("video"),
  name: z.string().default(""),
  clips: z.array(videoClipSchema),
});
export const imageLayerSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("image"),
  name: z.string().default(""),
  items: z.array(imageOverlaySchema),
});
export const textLayerSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("text"),
  name: z.string().default(""),
  items: z.array(textOverlaySchema),
});
export const layerSchema = z.discriminatedUnion("kind", [
  videoLayerSchema, imageLayerSchema, textLayerSchema,
]);
export type VideoLayer = z.infer<typeof videoLayerSchema>;
export type ImageLayer = z.infer<typeof imageLayerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type Layer = z.infer<typeof layerSchema>;
```

- [ ] **Step 2: Cambiar `tracks` y la versión en `projectSchema`**

```ts
  version: z.literal(3),
  // ...
  tracks: z.object({
    layers: z.array(layerSchema),
    audio: z.array(audioTrackSchema),
  }),
```

- [ ] **Step 3: Typecheck parcial**

Run: `cd shared && npx tsc --noEmit`
Expected: PASA en `project.ts` (errores en tests/otros se arreglan luego).

---

## Task 2: Factories + selectores + `createEmptyProject`

**Files:** `shared/src/project.ts`, `shared/src/project.test.ts`

- [ ] **Step 1: Test**

En `shared/src/project.test.ts` (amplía import con `createVideoLayer, allVideoClips, imageItems, textItems, videoLayers`):

```ts
describe("capas — selectores", () => {
  it("createEmptyProject arranca con una capa de vídeo vacía", () => {
    const p = createEmptyProject("x");
    expect(p.tracks.layers).toHaveLength(1);
    expect(p.tracks.layers[0]).toMatchObject({ kind: "video", clips: [] });
    expect(p.tracks.audio).toEqual([]);
    expect(projectSchema.safeParse(p).success).toBe(true);
  });
  it("selectores reconstruyen vistas por tipo en orden", () => {
    const p = createEmptyProject("x");
    p.tracks.layers.push({ id: "i1", kind: "image", name: "", items: [
      createImageOverlay("a", "a.png", 0, 0.2, 0.2),
    ] });
    p.tracks.layers.push({ id: "t1", kind: "text", name: "", items: [createTextOverlay(0)] });
    expect(videoLayers(p)).toHaveLength(1);
    expect(imageItems(p)).toHaveLength(1);
    expect(textItems(p)).toHaveLength(1);
    expect(allVideoClips(p)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run para ver fallar** → `cd shared && npx vitest run` → FAIL.

- [ ] **Step 3: Implementar factories + selectores + createEmptyProject**

```ts
export function createVideoLayer(name = ""): VideoLayer {
  return { id: globalThis.crypto.randomUUID(), kind: "video", name, clips: [] };
}
export function createImageLayer(name = ""): ImageLayer {
  return { id: globalThis.crypto.randomUUID(), kind: "image", name, items: [] };
}
export function createTextLayer(name = ""): TextLayer {
  return { id: globalThis.crypto.randomUUID(), kind: "text", name, items: [] };
}

export function videoLayers(p: Project): VideoLayer[] {
  return p.tracks.layers.filter((l): l is VideoLayer => l.kind === "video");
}
export function imageLayers(p: Project): ImageLayer[] {
  return p.tracks.layers.filter((l): l is ImageLayer => l.kind === "image");
}
export function textLayers(p: Project): TextLayer[] {
  return p.tracks.layers.filter((l): l is TextLayer => l.kind === "text");
}
/** Todos los clips de vídeo (todas las capas vídeo), en orden de capa. */
export function allVideoClips(p: Project): VideoClip[] {
  return videoLayers(p).flatMap((l) => l.clips);
}
export function imageItems(p: Project): ImageOverlay[] {
  return imageLayers(p).flatMap((l) => l.items);
}
export function textItems(p: Project): TextOverlay[] {
  return textLayers(p).flatMap((l) => l.items);
}
```

> Si ya existe `allVideoClips` (de la fase multipista, recorría `tracks.video`),
> SUSTITÚYELO por esta versión.

En `createEmptyProject`, cambia `version` y `tracks`:
```ts
    version: 3,
    // ...
    tracks: { layers: [createVideoLayer()], audio: [] },
```

- [ ] **Step 4: Run hasta verde** → `cd shared && npx vitest run` → PASS (ajustando el primer test de createEmptyProject que esperaba `tracks.video`).

- [ ] **Step 5: Commit**

```bash
git add shared/src/project.ts shared/src/project.test.ts
git commit -m "feat(capas): modelo de capas tipadas (layers) + selectores (v3)"
```

---

## Task 3: `migrateLayers` (v2 → v3) + carga en servidor

**Files:** `shared/src/project.ts`, `shared/src/project.test.ts`, `server/src/services/projectsRepo.ts`, `server/src/services/projectsRepo.test.ts`

- [ ] **Step 1: Test de migración**

```ts
describe("migrateLayers", () => {
  it("convierte v2 (video/image/text) en v3 con capas en orden vídeo→imagen→texto", () => {
    // v2 = createEmptyProject degradado al esquema antiguo
    const v3 = createEmptyProject("x") as unknown as Record<string, any>;
    const v2 = {
      ...v3, version: 2,
      tracks: {
        video: [{ id: "tk", name: "", clips: [] }],
        image: [createImageOverlay("a", "a.png", 0, 0.2, 0.2)],
        text: [createTextOverlay(0)],
        audio: [],
      },
    };
    const migrated = projectSchema.parse(migrateLayers(v2));
    expect(migrated.version).toBe(3);
    const kinds = migrated.tracks.layers.map((l) => l.kind);
    expect(kinds).toEqual(["video", "image", "text"]); // vídeo atrás, texto al frente
  });
  it("idempotente: un proyecto v3 se devuelve igual", () => {
    const p = createEmptyProject("x");
    expect(migrateLayers(p)).toBe(p);
  });
});
```

- [ ] **Step 2: Run para ver fallar** → FAIL.

- [ ] **Step 3: Implementar `migrateLayers`**

```ts
/**
 * v2 (tracks.video/image/text separados) → v3 (tracks.layers). Pura e idempotente.
 * Orden de capas: vídeo (atrás) → imagen → texto (frente), conservando el z visual de v2.
 * Fase 1: una sola capa de imagen y una de texto (sin trocear por solape; eso se hará
 * en la fase de timeline). El no-solape por carril de imagen/texto se relaja aquí.
 */
export function migrateLayers(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const p = raw as { version?: number; tracks?: any };
  if (p.version !== 2) return raw;
  const t = p.tracks ?? {};
  const videoLayersArr = (Array.isArray(t.video) ? t.video : []).map((trk: any) => ({
    id: trk.id ?? globalThis.crypto.randomUUID(),
    kind: "video", name: trk.name ?? "", clips: trk.clips ?? [],
  }));
  const layers: any[] = [...videoLayersArr];
  if (Array.isArray(t.image) && t.image.length) {
    layers.push({ id: globalThis.crypto.randomUUID(), kind: "image", name: "", items: t.image });
  }
  if (Array.isArray(t.text) && t.text.length) {
    layers.push({ id: globalThis.crypto.randomUUID(), kind: "text", name: "", items: t.text });
  }
  if (layers.length === 0) layers.push({ id: globalThis.crypto.randomUUID(), kind: "video", name: "", clips: [] });
  return { ...p, version: 3, tracks: { layers, audio: t.audio ?? [] } };
}
```

- [ ] **Step 4: Run hasta verde** → `cd shared && npx vitest run` → PASS.

- [ ] **Step 5: Encadenar en el servidor**

En `server/src/services/projectsRepo.ts`, importa `migrateLayers` y aplícalo tras `migrateProject`:
```ts
import { migrateLayers, migrateProject, projectSchema } from "@clipforge/shared";
// ...
function tryRead(file: string): Project | null {
  try {
    const raw = migrateLayers(migrateProject(JSON.parse(fs.readFileSync(file, "utf8"))));
    const parsed = projectSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
```
Añade un test en `projectsRepo.test.ts` que escriba un proyecto **v2** (degradado de `createEmptyProject` con tracks.video/image/text) y compruebe que `loadProject` devuelve `version 3` con `tracks.layers`.

- [ ] **Step 6: Commit**

```bash
git add shared/src/project.ts shared/src/project.test.ts server/src/services/projectsRepo.ts server/src/services/projectsRepo.test.ts
git commit -m "feat(capas): migrateLayers v2->v3 aplicado al cargar en el servidor"
```

---

## Task 4: Store sobre `layers` (preserva comportamiento)

**Files:** `client/src/stores/projectStore.ts`

Objetivo: todas las ops siguen funcionando igual, leyendo/escribiendo en `layers`.

- [ ] **Step 1: Helpers internos**

Importa de `@clipforge/shared`: `Layer, VideoLayer, ImageLayer, TextLayer, createVideoLayer, createImageLayer, createTextLayer, allVideoClips, videoLayers`. Sustituye `findClipCtx`/`baseTrack` por versiones sobre layers:

```ts
function videoLayerList(d: Project): VideoLayer[] {
  return d.tracks.layers.filter((l): l is VideoLayer => l.kind === "video");
}
/** Primera capa de vídeo (base). La crea si no hay ninguna. */
function baseVideoLayer(d: Project): VideoLayer {
  let base = d.tracks.layers.find((l): l is VideoLayer => l.kind === "video");
  if (!base) { base = createVideoLayer(); d.tracks.layers.unshift(base); }
  return base;
}
function findClipCtx(d: Project, id: string): { layer: VideoLayer; clip: VideoClip; index: number } | null {
  for (const l of d.tracks.layers) {
    if (l.kind !== "video") continue;
    const index = l.clips.findIndex((c) => c.id === id);
    if (index !== -1) return { layer: l, clip: l.clips[index], index };
  }
  return null;
}
/** Capa de imagen donde añadir (la primera; crea una si no hay). */
function imageLayerFor(d: Project): ImageLayer {
  let l = d.tracks.layers.find((x): x is ImageLayer => x.kind === "image");
  if (!l) { l = createImageLayer(); d.tracks.layers.push(l); }
  return l;
}
function textLayerFor(d: Project): TextLayer {
  let l = d.tracks.layers.find((x): x is TextLayer => x.kind === "text");
  if (!l) { l = createTextLayer(); d.tracks.layers.push(l); }
  return l;
}
function findImage(d: Project, id: string): { layer: ImageLayer; item: ImageOverlay; index: number } | null {
  for (const l of d.tracks.layers) {
    if (l.kind !== "image") continue;
    const index = l.items.findIndex((i) => i.id === id);
    if (index !== -1) return { layer: l, item: l.items[index], index };
  }
  return null;
}
function findText(d: Project, id: string): { layer: TextLayer; item: TextOverlay; index: number } | null {
  for (const l of d.tracks.layers) {
    if (l.kind !== "text") continue;
    const index = l.items.findIndex((i) => i.id === id);
    if (index !== -1) return { layer: l, item: l.items[index], index };
  }
  return null;
}
```

- [ ] **Step 2: Reescribir ops (guíate por el typecheck)**

Transforma cada op manteniendo su semántica. Resumen de cambios (usa el typecheck `cd client && npx tsc --noEmit` como worklist):
- **Vídeo**: donde antes `d.tracks.video[0].clips` o `baseTrack(d).clips` → `baseVideoLayer(d).clips`; donde iteraba pistas (`d.tracks.video`) → `videoLayerList(d)`; `findClipCtx` ya devuelve `{layer,...}` (renombra `ctx.track`→`ctx.layer`). `addVideoTrack(pos)` crea `createVideoLayer()` e inserta en `d.tracks.layers` (unshift/ push según pos) y devuelve id; `removeVideoTrack`/`reorderVideoTrack` operan sobre `d.tracks.layers` localizando por id de capa; `moveClipToTrack`/`addVideoClipToTrack` usan `findClipCtx`/buscar capa de vídeo por id.
- **Imagen**: `addImage` → `imageLayerFor(d).items.push(overlay)`; `updateImage`/`setImageCrop`/`removeElement("image")` → `findImage`.
- **Texto**: `addText` → `textLayerFor(d).items.push(overlay)`; `updateText`/`removeElement("text")` → `findText`.
- **`moveOverlay`/`trimOverlay`** (kind "text"|"image"): localizar el item vía `findText`/`findImage` y mutarlo (en vez de `d.tracks[kind]`).
- **`removeElement`**: caso `video`→`findClipCtx`, `image`→`findImage`, `text`→`findText`, `audio`→`d.tracks.audio`, `subtitle`→subtitles.
- **`pruneSelection`**: `video`→`allVideoClips`, `image`→`imageItems`, `text`→`textItems`, `audio`→`d.tracks.audio`.
- **`applyPreset`**: en vez de fijar `d.tracks.text/image`, construir capas: reemplaza las capas image/text actuales por una capa image (preset.image con ids nuevos) y una capa text (preset.text con ids nuevos), conservando las capas de vídeo. (Mantiene el comportamiento de "aplicar plantilla de textos+imágenes".)

> Mantén la semántica exacta (no-solape de vídeo por capa, ripple de silencios sobre la
> capa del clip, etc.). El comportamiento observable no cambia (una capa de imagen y una de
> texto como hoy).

- [ ] **Step 3: Typecheck** → `cd client && npx tsc --noEmit` (quedarán errores en lectores UI → Task 5). `projectStore.ts` sin errores.

- [ ] **Step 4: Commit**

```bash
git add client/src/stores/projectStore.ts
git commit -m "refactor(capas): store opera sobre layers (preserva comportamiento)"
```

---

## Task 5: Lectores (cliente + server) vía selectores

**Files:** los lectores listados. Usa el typecheck de cada paquete como worklist.

- [ ] **Step 1: `shared/src/preset.ts`** — `projectToPreset` usa selectores:
```ts
import { imageItems, textItems } from "./project.js"; // (añadir)
// ...
    text: textItems(project).map((t) => ({ ...t })),
    image: imageItems(project).map((i) => ({ ...i })),
```

- [ ] **Step 2: `client/src/lib/timeline.ts`** — `projectDuration` y `findSnapPoints` ya usan `allVideoClips`; añade imagen/texto vía `imageItems(p)`/`textItems(p)` en vez de `p.tracks.image`/`p.tracks.text`.

- [ ] **Step 3: `server/src/services/ffmpeg/filterGraph.ts`** — donde lee `project.tracks.video` → `videoLayers(project)`; `project.tracks.image` → `imageItems(project)`; `project.tracks.text` → `textItems(project)`. (El orden de composición se mantiene vídeo→imagen→texto en esta fase; la composición por orden de capas llega en la Fase 2.)

- [ ] **Step 4: Lectores UI** — sustituye accesos:
  - `tracks.video[0]?.clips` → `videoLayers(project)[0]?.clips`
  - iterar `tracks.video` → `videoLayers(project)`
  - `tracks.image` → `imageItems(project)`; `tracks.text` → `textItems(project)`
  - buscar por id en `tracks.image/text` → `imageItems/textItems(...).find(...)`
  Archivos: `OverlayLayer.tsx`, `PreviewCanvas.tsx`, `Timeline.tsx`, `PropertiesPanel.tsx`, `CropOverlay.tsx`, `MediaPanel.tsx`, `ExportDialog.tsx`, `SubtitlesPanel.tsx`, `ToolRail.tsx`, `lib/shortcuts.ts`. Importa los selectores de `@clipforge/shared`.

- [ ] **Step 5: Typecheck cliente y server** → ambos limpios.

- [ ] **Step 6: Commit**
```bash
git add client/src server/src/services/ffmpeg/filterGraph.ts shared/src/preset.ts
git commit -m "refactor(capas): lectores usan selectores de capas (vídeo/imagen/texto)"
```

---

## Task 6: Tests que construyen proyectos

**Files:** `shared/src/project.test.ts`, `shared/src/preset.test.ts`, `client/src/stores/projectStore.test.ts`, `client/src/lib/timeline.test.ts`, `client/src/lib/shortcuts.test.ts`, `server/src/services/ffmpeg/filterGraph.test.ts`

- [ ] **Step 1:** Ajusta todos los tests que construyen proyectos a la nueva forma:
  - `p.tracks.video[0].clips.push(...)` → `(p.tracks.layers[0] as VideoLayer).clips.push(...)` o usa `createEmptyProject` (que ya da una capa vídeo) y empuja a `p.tracks.layers[0].clips`.
  - `p.tracks.image.push(...)` → empujar a una capa imagen: `p.tracks.layers.push({ id, kind:"image", name:"", items:[...] })`.
  - `p.tracks.text.push(...)` → ídem con capa texto.
  - Accesos de aserción `tracks.video/image/text` → selectores o `tracks.layers[...]`.
  - `filterGraph.test.ts`: construir proyectos con capas; las aserciones de string del grafo deben seguir pasando (orden vídeo→imagen→texto conservado en Fase 1).

- [ ] **Step 2: Suite completa** → `cd shared && npx vitest run` && `cd ../client && npx vitest run` && `cd ../server && npx vitest run` → PASS.

- [ ] **Step 3: Typecheck global** → los tres paquetes limpios.

- [ ] **Step 4: Commit**
```bash
git add shared/src client/src server/src
git commit -m "test(capas): construir proyectos con el modelo de capas"
```

---

## Task 7: Cierre de fase

- [ ] **Step 1:** Suite + typecheck globales verdes.
- [ ] **Step 2: Smoke del usuario** (al final del épico, no por fase): abrir un proyecto v2 antiguo → migra a v3 y se comporta igual.
- [ ] **Step 3:** Actualizar `TODO.md` (Fase 1 capas hecha) y `git push origin master`.

---

## Notas / riesgos

- **Comportamiento idéntico** en Fase 1: una capa de imagen + una de texto (como hoy); el
  z de composición sigue vídeo→imagen→texto. El cambio a "orden de capas = z" llega en
  Fase 2 (export) y Fase 4 (preview).
- **No-solape por carril de imagen/texto**: relajado en Fase 1 (una capa con todos los
  items, posiblemente solapados en tiempo). Se enforce en la Fase 3 (timeline).
- Red de seguridad: ~257 tests. El typecheck guía los lectores (patrón probado en el
  multipista).
- `videoTrackSchema`/`createVideoTrack` se mantienen solo para `migrateLayers` (input v2);
  pueden quedar como internos.
