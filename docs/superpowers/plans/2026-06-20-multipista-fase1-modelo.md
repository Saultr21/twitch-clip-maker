# Multipista de vídeo — Fase 1: Modelo + migración (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar el modelo de `tracks.video: VideoClip[]` a `tracks.video: VideoTrack[]` (array de pistas con z-order), con migración de proyectos v1→v2, **preservando el comportamiento actual** (todo opera sobre la pista base, índice 0). Build verde y los 217 tests pasando.

**Architecture:** Refactor estructural sin cambio de comportamiento. Una sola pista base contiene todos los clips, igual que hoy. Se añade el envoltorio `VideoTrack`, el campo `opacity` al clip (aún sin efecto), helpers de acceso en `@clipforge/shared`, y una función `migrateProject` pura aplicada al cargar. Las fases siguientes (export, preview, timeline, opacidad) construyen sobre esta base.

**Tech Stack:** TypeScript, Zod (esquemas), Zustand + Immer (store cliente), Vitest (tests), Node/Fastify (server).

**Spec:** `docs/superpowers/specs/2026-06-20-multipista-video-design.md` (Fase 1 = secciones 1, 2, 3 + lectores).

---

## Estructura de archivos

**Modifica:**
- `shared/src/project.ts` — `videoTrackSchema`, `opacity` en `videoClipSchema`, `version` 2, `createVideoTrack`, `allVideoClips`, `migrateProject`, `createEmptyProject`.
- `shared/src/project.test.ts` — tests de esquema/migración + ajuste de los existentes.
- `server/src/services/projectsRepo.ts` — aplicar `migrateProject` antes de `safeParse`.
- `server/src/services/projectsRepo.test.ts` — test de carga de un .json v1.
- `server/src/services/ffmpeg/filterGraph.ts` — leer clips de la pista base.
- `server/src/services/ffmpeg/filterGraph.test.ts` — usar la nueva forma al montar proyectos.
- `client/src/stores/projectStore.ts` — ops de vídeo sobre pistas (helpers internos).
- `client/src/stores/projectStore.test.ts` — ajustar accesos a `tracks.video`.
- `client/src/lib/timeline.ts` — `projectDuration` y `findSnapPoints` usan `allVideoClips`.
- `client/src/lib/timeline.test.ts`, `client/src/lib/shortcuts.test.ts` — ajustar accesos.
- Lectores de UI: `Timeline.tsx`, `SubtitlesPanel.tsx`, `usePlaybackEngine.ts`,
  `PropertiesPanel.tsx`, `PreviewCanvas.tsx`, `OverlayLayer.tsx`, `CropOverlay.tsx`,
  `MediaPanel.tsx`, `ExportDialog.tsx`.

**Principio de migración:** los helpers `clipEnd`, `videoClipAt`, `hasOverlap`,
`splitVideoClip`, `sourceTimeFor` de `lib/timeline.ts` **no cambian** (operan sobre
`VideoClip` / `VideoClip[]`); los llamantes les pasan `track.clips` o `allVideoClips(p)`.

---

## Task 1: Esquema `VideoTrack` + `opacity` + versión 2

**Files:**
- Modify: `shared/src/project.ts`
- Test: `shared/src/project.test.ts`

- [ ] **Step 1: Añadir `opacity` al clip de vídeo**

En `shared/src/project.ts`, dentro de `videoClipSchema` (tras `crop`), añade el campo:

```ts
    crop: cropRectSchema.default(null),
    // opacidad de la capa (1 = opaca). Sin efecto hasta la fase de compositación
    opacity: norm.default(1),
```

- [ ] **Step 2: Definir `videoTrackSchema` y su tipo**

Justo después de `videoClipSchema` (tras su `.refine(...)`), añade:

```ts
export const videoTrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  clips: z.array(videoClipSchema),
});

export type VideoTrack = z.infer<typeof videoTrackSchema>;
```

- [ ] **Step 3: Cambiar `tracks.video` y subir la versión**

En `projectSchema`, cambia el tipo de `video` y la versión:

```ts
  version: z.literal(2),
  // ...
  tracks: z.object({
    video: z.array(videoTrackSchema),
    text: z.array(textOverlaySchema),
    image: z.array(imageOverlaySchema),
    audio: z.array(audioTrackSchema),
  }),
```

Añade el export del tipo junto a los demás:

```ts
export type Project = z.infer<typeof projectSchema>;
```
(ya existe; no dupliques — solo verifica que `VideoTrack` quedó exportado en Step 2).

- [ ] **Step 4: Verificar typecheck del paquete shared (fallará en otros sitios, OK)**

Run: `cd shared && npx tsc --noEmit`
Expected: PASA en `project.ts` (puede haber errores en `project.test.ts`, se arreglan en Task 2).

---

## Task 2: `createVideoTrack`, `createEmptyProject`, `allVideoClips`

**Files:**
- Modify: `shared/src/project.ts`
- Test: `shared/src/project.test.ts`

- [ ] **Step 1: Test de `createEmptyProject` con pista base**

En `shared/src/project.test.ts`, sustituye el `expect` de `tracks` del primer test:

```ts
    expect(p.tracks.video).toHaveLength(1);
    expect(p.tracks.video[0].clips).toEqual([]);
    expect(p.tracks.text).toEqual([]);
    expect(p.tracks.image).toEqual([]);
    expect(p.tracks.audio).toEqual([]);
    expect(projectSchema.safeParse(p).success).toBe(true);
```

- [ ] **Step 2: Test de `allVideoClips`**

Añade al final de `shared/src/project.test.ts` (y amplía el import de la cabecera con `createVideoTrack, allVideoClips`):

```ts
describe("allVideoClips", () => {
  it("aplana los clips de todas las pistas en orden", () => {
    const p = createEmptyProject("x");
    p.tracks.video[0].clips.push({
      id: "v1", clipId: "c1", timelineStart: 0, trimIn: 0, trimOut: 4, speed: 1,
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
      crop: null, opacity: 1,
    });
    p.tracks.video.push({ id: "t2", name: "", clips: [{
      id: "v2", clipId: "c2", timelineStart: 1, trimIn: 0, trimOut: 4, speed: 1,
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
      crop: null, opacity: 1,
    }] });
    expect(allVideoClips(p).map((c) => c.id)).toEqual(["v1", "v2"]);
  });
});
```

- [ ] **Step 3: Run para ver fallar**

Run: `cd shared && npx vitest run`
Expected: FAIL (`createVideoTrack`/`allVideoClips` no existen; `createEmptyProject` aún devuelve `video: []`).

- [ ] **Step 4: Implementar helpers y la pista base en `createEmptyProject`**

En `shared/src/project.ts`:

```ts
export function createVideoTrack(name = ""): VideoTrack {
  return { id: globalThis.crypto.randomUUID(), name, clips: [] };
}

/** Todos los clips de vídeo de todas las pistas, en orden de pista (z-order). */
export function allVideoClips(project: Project): VideoClip[] {
  return project.tracks.video.flatMap((t) => t.clips);
}
```

En `createEmptyProject`, cambia `version` y la pista de vídeo:

```ts
    version: 2,
    // ...
    tracks: { video: [createVideoTrack()], text: [], image: [], audio: [] },
```

- [ ] **Step 5: Run hasta verde**

Run: `cd shared && npx vitest run`
Expected: PASS (todos los tests de shared).

- [ ] **Step 6: Commit**

```bash
git add shared/src/project.ts shared/src/project.test.ts
git commit -m "feat(multipista): modelo VideoTrack[] con opacidad y helpers (v2)"
```

---

## Task 3: `migrateProject` (v1 → v2)

**Files:**
- Modify: `shared/src/project.ts`
- Test: `shared/src/project.test.ts`

- [ ] **Step 1: Test de migración**

Añade a `shared/src/project.test.ts`:

```ts
// Construye un proyecto v1 válido a partir de uno v2 (degradándolo): así el resto
// de subesquemas (settings/subtitles) son por definición válidos y el test solo
// prueba la migración de tracks.video.
function makeV1WithClip() {
  const v2 = createEmptyProject("viejo") as unknown as Record<string, any>;
  const clip = {
    id: "v1", clipId: "c1", timelineStart: 0, trimIn: 0, trimOut: 4, speed: 1,
    zoom: { x: 0.5, y: 0.5, scale: 1 },
    filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
    crop: null,
  };
  return { ...v2, version: 1, tracks: { ...v2.tracks, video: [clip] } };
}

describe("migrateProject", () => {
  it("envuelve el tracks.video plano de v1 en una sola pista (v2)", () => {
    const migrated = projectSchema.parse(migrateProject(makeV1WithClip()));
    expect(migrated.version).toBe(2);
    expect(migrated.tracks.video).toHaveLength(1);
    expect(migrated.tracks.video[0].clips.map((c) => c.id)).toEqual(["v1"]);
    expect(migrated.tracks.video[0].clips[0].opacity).toBe(1); // default aplicado
  });

  it("deja intacto un proyecto que ya es v2", () => {
    const p = createEmptyProject("x");
    expect(migrateProject(p)).toBe(p);
  });
});
```

Amplía el import con `migrateProject`.

- [ ] **Step 2: Run para ver fallar**

Run: `cd shared && npx vitest run -t migrateProject`
Expected: FAIL (`migrateProject` no existe).

- [ ] **Step 3: Implementar `migrateProject`**

En `shared/src/project.ts` (al final del archivo):

```ts
/**
 * Migra un proyecto crudo (leído de disco/API) al esquema actual. v1 tenía
 * `tracks.video` como array plano de clips; v2 lo envuelve en una sola pista.
 * Pura e idempotente: un proyecto ya v2 se devuelve tal cual.
 */
export function migrateProject(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const p = raw as { version?: number; tracks?: { video?: unknown } };
  if (p.version !== 1) return raw;
  const flat = Array.isArray(p.tracks?.video) ? p.tracks.video : [];
  return {
    ...p,
    version: 2,
    tracks: {
      ...(p.tracks ?? {}),
      video: [{ id: globalThis.crypto.randomUUID(), name: "", clips: flat }],
    },
  };
}
```

- [ ] **Step 4: Run hasta verde**

Run: `cd shared && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/project.ts shared/src/project.test.ts
git commit -m "feat(multipista): migrateProject v1->v2 (envuelve clips en pista base)"
```

---

## Task 4: Aplicar la migración al cargar en el servidor

**Files:**
- Modify: `server/src/services/projectsRepo.ts:48-55`
- Test: `server/src/services/projectsRepo.test.ts`

- [ ] **Step 1: Test de carga de un .json v1**

En `server/src/services/projectsRepo.test.ts`, añade (revisa los imports: `saveProject`, `loadProject`, un `dir` temporal — sigue el patrón de los tests existentes del archivo):

```ts
it("migra un proyecto v1 en disco al cargarlo (v2 con una pista)", () => {
  const dir = mkTempDir(); // usa el mismo mecanismo de dir temporal del archivo
  // v1 = proyecto v2 válido degradado (tracks.video plano, version 1)
  const v2 = createEmptyProject("demo") as unknown as Record<string, any>;
  const clip = { id: "v1", clipId: "c1", timelineStart: 0, trimIn: 0, trimOut: 4, speed: 1,
    zoom: { x: 0.5, y: 0.5, scale: 1 },
    filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 }, crop: null };
  const v1 = { ...v2, version: 1, tracks: { ...v2.tracks, video: [clip] } };
  fs.writeFileSync(path.join(dir, "demo.json"), JSON.stringify(v1));
  const loaded = loadProject("demo", dir);
  expect(loaded?.version).toBe(2);
  expect(loaded?.tracks.video[0].clips[0].id).toBe("v1");
});
```

> Nota: importa `createEmptyProject` desde `@clipforge/shared` en el test. Reutiliza el
> mecanismo de `dir` temporal del propio archivo (p. ej. `fs.mkdtempSync(path.join(os.tmpdir(), ...))`);
> asegúrate de importar `fs`, `path`, `os` según ya haga el archivo.

- [ ] **Step 2: Run para ver fallar**

Run: `cd server && npx vitest run projectsRepo`
Expected: FAIL (carga como null porque el v1 no valida contra el esquema v2).

- [ ] **Step 3: Aplicar `migrateProject` en `tryRead`**

En `server/src/services/projectsRepo.ts`, importa y úsalo:

```ts
import { migrateProject, projectSchema } from "@clipforge/shared";
```

```ts
function tryRead(file: string): Project | null {
  try {
    const raw = migrateProject(JSON.parse(fs.readFileSync(file, "utf8")));
    const parsed = projectSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run hasta verde**

Run: `cd server && npx vitest run projectsRepo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/projectsRepo.ts server/src/services/projectsRepo.test.ts
git commit -m "feat(multipista): migrar proyectos v1 al cargarlos en el servidor"
```

---

## Task 5: Store cliente — ops de vídeo sobre pistas (preserva comportamiento)

**Files:**
- Modify: `client/src/stores/projectStore.ts`
- Test: `client/src/stores/projectStore.test.ts` (Task 6)

Objetivo: todas las ops siguen funcionando igual, pero leyendo/escribiendo en la pista
base y localizando clips por id en cualquier pista (preparado para multipista).

- [ ] **Step 1: Añadir helpers internos**

En `client/src/stores/projectStore.ts`, tras los imports y antes de `pruneSelection`,
añade (importa `VideoClip`, `VideoTrack`, `createVideoTrack`, `allVideoClips` desde
`@clipforge/shared`):

```ts
/** Localiza un clip de vídeo por id en cualquier pista. */
function findClipCtx(d: Project, id: string): { track: VideoTrack; clip: VideoClip; index: number } | null {
  for (const track of d.tracks.video) {
    const index = track.clips.findIndex((c) => c.id === id);
    if (index !== -1) return { track, clip: track.clips[index], index };
  }
  return null;
}

/** Pista base (índice 0). Garantizada por createEmptyProject/migrateProject. */
function baseTrack(d: Project): VideoTrack {
  if (d.tracks.video.length === 0) d.tracks.video.push(createVideoTrack());
  return d.tracks.video[0];
}
```

- [ ] **Step 2: Reescribir las ops que tocan `tracks.video`**

Sustituye cada ocurrencia con su equivalente sobre pistas. Cambios exactos:

`addVideoClip`:
```ts
    addVideoClip: (clip) =>
      mutate((d) => {
        const track = baseTrack(d);
        const lastEnd = track.clips.length ? Math.max(...track.clips.map(clipEnd)) : 0;
        track.clips.push(createVideoClip(clip.id, lastEnd, clip.duration));
      }),
```

`addVideoClipAt`:
```ts
    addVideoClipAt: (clip, start) =>
      mutate((d) => {
        const track = baseTrack(d);
        const dur = clip.duration;
        const desired = Math.max(0, start);
        const overlaps = track.clips.some(
          (v) => desired < clipEnd(v) && desired + dur > v.timelineStart,
        );
        const lastEnd = track.clips.length ? Math.max(...track.clips.map(clipEnd)) : 0;
        track.clips.push(createVideoClip(clip.id, overlaps ? lastEnd : desired, dur));
      }),
```

`removeVideoClipsBySource`:
```ts
    removeVideoClipsBySource: (clipId) =>
      mutate((d) => {
        for (const track of d.tracks.video) {
          track.clips = track.clips.filter((v) => v.clipId !== clipId);
        }
      }),
```

`removeSilencesFromClip` (línea ~194 y ~218): cambia la búsqueda y la reescritura para
operar sobre la pista que contiene el clip:
```ts
    removeSilencesFromClip: (id, silences) => {
      let firstPieceId: string | null = null;
      mutate((d) => {
        const ctx = findClipCtx(d, id);
        if (!ctx) return;
        const c = ctx.clip;
        const segs = nonSilentSegments(c.trimIn, c.trimOut, silences);
        if (segs.length === 0 || (segs.length === 1 && segs[0][0] === c.trimIn && segs[0][1] === c.trimOut)) {
          return;
        }
        const oldEnd = clipEnd(c);
        let start = c.timelineStart;
        const pieces = segs.map(([a, b]) => {
          const piece = {
            ...c, id: globalThis.crypto.randomUUID(), trimIn: a, trimOut: b,
            timelineStart: start, zoom: { ...c.zoom }, filters: { ...c.filters },
          };
          start += (b - a) / c.speed;
          return piece;
        });
        firstPieceId = pieces[0].id;
        const removed = (c.trimOut - c.trimIn) / c.speed - (start - c.timelineStart);
        ctx.track.clips = ctx.track.clips
          .flatMap((v) => {
            if (v.id === id) return pieces;
            if (v.timelineStart >= oldEnd && removed > 0) {
              return [{ ...v, timelineStart: Math.max(0, v.timelineStart - removed) }];
            }
            return [v];
          })
          .sort((a, b) => a.timelineStart - b.timelineStart);
      });
      if (firstPieceId && useUiStore.getState().selection?.id === id) {
        useUiStore.getState().select({ kind: "video", id: firstPieceId });
      }
    },
```

`applyReframe`:
```ts
    applyReframe: (id, segments) => {
      let firstPieceId: string | null = null;
      mutate((d) => {
        const ctx = findClipCtx(d, id);
        if (!ctx || segments.length === 0) return;
        const c = ctx.clip;
        let start = c.timelineStart;
        const pieces = segments.map((s) => {
          const piece = {
            ...c, id: globalThis.crypto.randomUUID(), trimIn: s.start, trimOut: s.end,
            timelineStart: start, zoom: { x: s.zoom.x, y: s.zoom.y, scale: s.zoom.scale },
            filters: { ...c.filters },
          };
          start += (s.end - s.start) / c.speed;
          return piece;
        });
        firstPieceId = pieces[0].id;
        ctx.track.clips = ctx.track.clips
          .flatMap((v) => (v.id === id ? pieces : [v]))
          .sort((a, b) => a.timelineStart - b.timelineStart);
      });
      if (firstPieceId && useUiStore.getState().selection?.id === id) {
        useUiStore.getState().select({ kind: "video", id: firstPieceId });
      }
    },
```

`moveVideoClip` (el no-solape se comprueba dentro de la pista del clip):
```ts
    moveVideoClip: (id, newStart, opts) =>
      mutate((d) => {
        const ctx = findClipCtx(d, id);
        if (!ctx) return;
        const start = Math.max(0, newStart);
        if (hasOverlap(ctx.track.clips, start, clipDuration(ctx.clip), id)) return;
        ctx.clip.timelineStart = start;
      }, opts),
```

`trimVideoClip`:
```ts
    trimVideoClip: (id, edge, t, opts) =>
      mutate((d) => {
        const ctx = findClipCtx(d, id);
        if (!ctx) return;
        const c = ctx.clip;
        if (edge === "start") {
          const maxStart = clipEnd(c) - MIN_CLIP_DURATION;
          const newTimelineStart = Math.min(Math.max(0, t), maxStart);
          const delta = (newTimelineStart - c.timelineStart) * c.speed;
          const newTrimIn = Math.max(0, c.trimIn + delta);
          c.timelineStart = newTimelineStart;
          c.trimIn = Math.min(newTrimIn, c.trimOut - MIN_CLIP_DURATION);
        } else {
          const cutSource = c.trimIn + Math.max(MIN_CLIP_DURATION, t - c.timelineStart) * c.speed;
          c.trimOut = Math.max(c.trimIn + MIN_CLIP_DURATION, cutSource);
        }
      }, opts),
```

`updateVideoClip`:
```ts
    updateVideoClip: (id, patch, opts) =>
      mutate((d) => {
        const ctx = findClipCtx(d, id);
        if (ctx) Object.assign(ctx.clip, patch);
      }, opts),
```

`splitVideoAt` (parte el clip dentro de su pista; usa la base para localizar por
playhead, igual que hoy — el clip activo está en la base):
```ts
    splitVideoAt: (t) =>
      mutate((d) => {
        const track = baseTrack(d);
        const c = videoClipAt(track.clips, t);
        if (!c || t <= c.timelineStart || t >= clipEnd(c)) return;
        const [left, right] = splitVideoClip(c, t);
        const idx = track.clips.findIndex((v) => v.id === c.id);
        track.clips.splice(idx, 1, left, right);
      }),
```

`setVideoCrop`:
```ts
    setVideoCrop: (id, crop) =>
      mutate((d) => {
        const ctx = findClipCtx(d, id);
        if (ctx) ctx.clip.crop = crop;
      }),
```

- [ ] **Step 3: `removeElement` para vídeo (busca en cualquier pista)**

`removeElement` usa hoy `d.tracks[kind]` genérico. El vídeo ahora es `VideoTrack[]`, así
que el caso `video` se separa. Cambia la función:

```ts
    removeElement: (kind, id) =>
      mutate((d) => {
        if (kind === "subtitle") {
          d.subtitles.cues = d.subtitles.cues.filter((c) => c.id !== id);
          return;
        }
        if (kind === "video") {
          const ctx = findClipCtx(d, id);
          if (ctx) ctx.track.clips.splice(ctx.index, 1);
          return;
        }
        const track = d.tracks[kind as "text" | "image" | "audio"] as Array<{ id: string }>;
        const idx = track.findIndex((x) => x.id === id);
        if (idx !== -1) track.splice(idx, 1);
      }),
```

- [ ] **Step 4: `pruneSelection` para vídeo**

En `pruneSelection` (arriba del archivo), el caso vídeo debe buscar en todas las pistas.
Cambia el cuerpo:

```ts
function pruneSelection(project: Project): void {
  const sel = useUiStore.getState().selection;
  if (!sel) return;
  if (sel.kind === "subtitle") {
    if (!project.subtitles.cues.some((c) => c.id === sel.id)) useUiStore.getState().select(null);
    return;
  }
  if (sel.kind === "video") {
    if (!allVideoClips(project).some((c) => c.id === sel.id)) useUiStore.getState().select(null);
    return;
  }
  const track = project.tracks[sel.kind as "text" | "image" | "audio"] as Array<{ id: string }>;
  if (!track.some((x) => x.id === sel.id)) useUiStore.getState().select(null);
}
```

- [ ] **Step 5: Typecheck del cliente (fallará en lectores de UI, se arreglan en Task 7)**

Run: `cd client && npx tsc --noEmit`
Expected: errores SOLO en los lectores de UI/tests listados en Task 7; `projectStore.ts` sin errores.

- [ ] **Step 6: Commit parcial**

```bash
git add client/src/stores/projectStore.ts
git commit -m "refactor(multipista): store de vídeo opera sobre pistas (base por defecto)"
```

---

## Task 6: Ajustar tests del store

**Files:**
- Modify: `client/src/stores/projectStore.test.ts`

- [ ] **Step 1: Actualizar accesos a `tracks.video`**

Los tests acceden a `project.tracks.video` esperando un array de clips. Ahora los clips
están en `tracks.video[0].clips`. Cambios por línea (según grep):

- L27: `const [a, b] = ...project.tracks.video;` → `const [a, b] = ...project.tracks.video[0].clips;`
- L36, L45, L79: `const v = ...project.tracks.video;` → `const v = ...project.tracks.video[0].clips;`
- L77, L89, L133, L144, L154: `...project.tracks.video[0].id` → `...project.tracks.video[0].clips[0].id`
- L91: `expect(...project.tracks.video).toHaveLength(1)` → `expect(...project.tracks.video[0].clips).toHaveLength(1)`
- L120: `const [a, b] = ...project.tracks.video;` → `...project.tracks.video[0].clips;`
- L122, L124: `...project.tracks.video[1].timelineStart` → `...project.tracks.video[0].clips[1].timelineStart`
- L135, L146: `const c = ...project.tracks.video[0];` → `const c = ...project.tracks.video[0].clips[0];`
- L156: `...project.tracks.video[0].trimOut` → `...project.tracks.video[0].clips[0].trimOut`
- L165: `const track = ...project.tracks.video;` → `const track = ...project.tracks.video[0].clips;`
- L321: `expect(p.tracks.video).toHaveLength(1)` → mantener (sigue habiendo 1 pista); si el
  comentario dice "el vídeo no se toca", verificar que se refiere a la pista; ajusta a
  `expect(p.tracks.video[0].clips)` si el assert miraba clips.

> Regla general: donde el test trataba `tracks.video` como lista de clips, usa
> `tracks.video[0].clips`. Lee cada assert en contexto antes de cambiarlo.

- [ ] **Step 2: Run hasta verde**

Run: `cd client && npx vitest run projectStore`
Expected: PASS (29 tests).

- [ ] **Step 3: Commit**

```bash
git add client/src/stores/projectStore.test.ts
git commit -m "test(multipista): ajustar tests del store a tracks.video[0].clips"
```

---

## Task 7: Actualizar lectores de `tracks.video` (cliente y server)

**Files:** (cada uno con su cambio exacto)

- [ ] **Step 1: `client/src/lib/timeline.ts` — usar `allVideoClips`**

Importa `allVideoClips` desde `@clipforge/shared`. Cambios:

`projectDuration` (L11-19):
```ts
export function projectDuration(p: Project): number {
  const ends = [
    ...allVideoClips(p).map(clipEnd),
    ...p.tracks.text.map((t) => t.end),
    ...p.tracks.image.map((i) => i.end),
    ...p.tracks.audio.map((a) => a.end),
  ];
  return ends.length ? Math.max(...ends) : 0;
}
```

`findSnapPoints` (L46): `for (const c of p.tracks.video)` → `for (const c of allVideoClips(p))`.

- [ ] **Step 2: `usePlaybackEngine.ts` — clip activo en la pista base**

Las 3 ocurrencias (L22, L76, L124) `videoClipAt(project.tracks.video, ...)` →
`videoClipAt(project.tracks.video[0]?.clips ?? [], ...)`.

- [ ] **Step 3: `PreviewCanvas.tsx` y `OverlayLayer.tsx` — suscribirse a la pista base**

`PreviewCanvas.tsx` L30:
```ts
  const videoTrack = useProjectStore((s) => s.project.tracks.video[0]?.clips ?? []);
```
`OverlayLayer.tsx` L238:
```ts
  const videoTrack = useProjectStore((s) => s.project.tracks.video[0]?.clips ?? []);
```
`OverlayLayer.tsx` L266 (`clipNow` busca por id): cambia a buscar en la base:
```ts
    useProjectStore.getState().project.tracks.video[0]?.clips.find((c) => c.id === activeClip.id);
```

- [ ] **Step 4: `CropOverlay.tsx` — buscar el clip por id en la base**

L76 y L107: `useProjectStore.getState().project.tracks.video.find(...)` →
`useProjectStore.getState().project.tracks.video[0]?.clips.find(...)`.

- [ ] **Step 5: `Timeline.tsx` — clips de la pista base**

- L48: `const videoCount = project.tracks.video[0]?.clips.length ?? 0;`
- L52-53: `project.tracks.video.length > 0` → `(project.tracks.video[0]?.clips.length ?? 0) > 0`;
  `const last = project.tracks.video[0].clips[project.tracks.video[0].clips.length - 1];`
- L58: dependencia del efecto → `project.tracks.video[0]?.clips`
- L59: `const canSplit = (project.tracks.video[0]?.clips.length ?? 0) > 0;`
- L66: `project.tracks.video.map(...)` → `(project.tracks.video[0]?.clips ?? []).map(...)`
- L80: dependencia del `useMemo` → `project.tracks.video[0]?.clips`

- [ ] **Step 6: `SubtitlesPanel.tsx`, `PropertiesPanel.tsx`, `MediaPanel.tsx`, `ExportDialog.tsx`**

- `SubtitlesPanel.tsx` L45: `videoClipAt(project.tracks.video[0]?.clips ?? [], playhead) ?? project.tracks.video[0]?.clips[0]`;
  L50: `s.project.tracks.video[0]?.clips.length ?? 0 > 0` → usar `(s.project.tracks.video[0]?.clips.length ?? 0) > 0`.
- `PropertiesPanel.tsx` L202: `s.project.tracks.video[0]?.clips.find((c) => c.id === clipId)`.
- `MediaPanel.tsx` L43: `const tracks = s...project.tracks.video[0]?.clips ?? []`;
  L51: `...project.tracks.video.some(...)` → `allVideoClips(...project).some((v) => v.clipId === clip.id)` (importa `allVideoClips`).
- `ExportDialog.tsx` L22: `(s.project.tracks.video[0]?.clips.length ?? 0) > 0`.

- [ ] **Step 7: `server/src/services/ffmpeg/filterGraph.ts` — clips de la base**

L63:
```ts
  const clips = [...(project.tracks.video[0]?.clips ?? [])].sort((a, b) => a.timelineStart - b.timelineStart);
```

- [ ] **Step 8: Typecheck cliente y server**

Run: `cd client && npx tsc --noEmit` → Expected: sin errores.
Run: `cd server && npx tsc --noEmit` → Expected: sin errores (salvo tests, Task 8).

- [ ] **Step 9: Commit**

```bash
git add client/src server/src/services/ffmpeg/filterGraph.ts
git commit -m "refactor(multipista): lectores de tracks.video usan la pista base"
```

---

## Task 8: Ajustar tests restantes que construyen proyectos

**Files:**
- Modify: `client/src/lib/timeline.test.ts`, `client/src/lib/shortcuts.test.ts`,
  `server/src/services/ffmpeg/filterGraph.test.ts`, `shared/src/project.test.ts` (el de
  rechazo de trimOut).

- [ ] **Step 1: `shared/src/project.test.ts` — push a la pista base**

El test "rechaza trimOut anterior a trimIn" (L46) hace `p.tracks.video.push({...clip...})`.
Cámbialo a `p.tracks.video[0].clips.push({ ...clip..., opacity: 1 });`.

- [ ] **Step 2: `client/src/lib/timeline.test.ts`**

L30: `p.tracks.video.push(clip(0, 0, 10));` → `p.tracks.video[0].clips.push(clip(0, 0, 10));`
L72: `p.tracks.video.push(a);` → `p.tracks.video[0].clips.push(a);`
(Verifica que el helper `clip(...)`/`a` del test incluye `opacity`; si construye el objeto
a mano, añade `opacity: 1`. Si usa `createVideoClip`, ya trae el default.)

- [ ] **Step 3: `client/src/lib/shortcuts.test.ts`**

L41: `...project.tracks.video[0].id` → `...project.tracks.video[0].clips[0].id`
L49: `expect(...project.tracks.video).toHaveLength(0)` → `expect(...project.tracks.video[0].clips).toHaveLength(0)`
L56: `expect(...project.tracks.video).toHaveLength(1)` → `expect(...project.tracks.video[0].clips).toHaveLength(1)`

- [ ] **Step 4: `server/src/services/ffmpeg/filterGraph.test.ts`**

Todas las líneas `p.tracks.video.push(...)` (L24, L46, L65, L123, L133, L145, L286) →
`p.tracks.video[0].clips.push(...)`. Los objetos creados con `createVideoClip` ya traen
`opacity`; los construidos a mano (L133, L145) deben añadir `opacity: 1`.

- [ ] **Step 5: Run TODO verde**

Run (desde la raíz): `npm test` (o por paquete: `cd shared && npx vitest run` &&
`cd ../client && npx vitest run` && `cd ../server && npx vitest run`).
Expected: PASS en los tres paquetes (≈ 217+ tests, +nuevos de migración/allVideoClips).

- [ ] **Step 6: Typecheck global**

Run: `cd shared && npx tsc --noEmit && cd ../client && npx tsc --noEmit && cd ../server && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add shared/src/project.test.ts client/src/lib/timeline.test.ts client/src/lib/shortcuts.test.ts server/src/services/ffmpeg/filterGraph.test.ts
git commit -m "test(multipista): construir proyectos con la pista base"
```

---

## Task 9: Verificación final y cierre de fase

- [ ] **Step 1: Smoke manual del usuario**

Arrancar la app, abrir un proyecto guardado **anterior** (v1) → debe cargar sin errores
(migrado a v2, una pista base) y comportarse exactamente igual que antes (preview, recorte,
timeline, export). Crear/guardar uno nuevo y reabrirlo.

- [ ] **Step 2: Actualizar TODO.md**

Mover en `TODO.md` la Fase 1 de `TASK-012` a hecho con resumen; dejar Fases 2–5 pendientes.

- [ ] **Step 3: Push**

```bash
git push origin master
```

---

## Notas para fases siguientes (no implementar aún)

- **Fase 2 (export):** `filterGraph` itera pistas; base por `concat`, pistas superiores
  como `overlay` de vídeo con `enable='between(start,end)'` y opacidad; audio de cada
  clip superpuesto vía `adelay`+`amix` (patrón de música).
- **Fase 3 (preview):** registro `trackId → <video>`, motor multipista, compositar N capas.
- **Fase 4 (timeline):** carriles por pista, añadir/quitar, arrastre entre pistas
  (`addVideoTrack`, `removeVideoTrack`, `moveClipToTrack`).
- **Fase 5 (opacidad):** control en `PropertiesPanel` cableado a `updateVideoClip({opacity})`.
