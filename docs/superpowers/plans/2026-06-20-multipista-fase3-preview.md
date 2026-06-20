# Multipista de vídeo — Fase 3: Preview compositado (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el preview muestre varias pistas de vídeo a la vez (PiP): un `<video>` por pista, posicionado/escalado con la geometría visible, con opacidad y z-order, todos sincronizados al playhead. Además, ops del store para crear/borrar pistas y mover clips entre pistas (modelo; la UI del timeline es la Fase 4), y recuadros de selección por clip de cualquier pista.

**Architecture (incremental, bajo riesgo):** La **pista base** (`tracks.video[0]`) sigue exactamente igual que hoy: usa `videoRef`, es el **reloj** de reproducción, la fuente del fondo blur y la que controla el volumen. Las **pistas superiores** (`tracks.video[1..]`) se renderizan como `<video>` adicionales registrados en un `Map<trackId, HTMLVideoElement>` y el motor las sincroniza como **esclavas** del playhead (src/currentTime/play-pausa/volumen), corrigiendo deriva. Para un proyecto de una sola pista, no hay esclavos → comportamiento idéntico al actual.

**Tech Stack:** React (refs, context, efectos), Zustand+Immer (store), Konva/react-konva (recuadros), `<video>` HTML, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-20-multipista-video-design.md` (sección 3 + DEC-012). Fases 1 y 2 hechas.

---

## Estructura de archivos

**Modifica:**
- `client/src/stores/projectStore.ts` — `addVideoTrack`, `removeVideoTrack`, `moveClipToTrack` (+ tipos en la interfaz).
- `client/src/stores/projectStore.test.ts` — tests de las ops nuevas.
- `client/src/features/preview/PreviewArea.tsx` — registro de vídeos esclavos en el contexto de reproducción.
- `client/src/features/preview/PreviewCanvas.tsx` — render de un `<video>` por pista (factorizar `TrackVideo`).
- `client/src/features/preview/usePlaybackEngine.ts` — sincronizar los vídeos esclavos.
- `client/src/features/preview/OverlayLayer.tsx` — un recuadro de selección (`VideoFrameNode`) por clip activo de cada pista.

**Posible archivo nuevo:**
- `client/src/features/preview/trackVideo.ts` — helper PURO `activeClipOnTrack(track, playhead)` y la geometría visible, para poder testearlos.

---

## Contexto del código actual (para el implementador)

- `PreviewArea.tsx`: `PlaybackProvider` crea `videoRef` (uno), llama `usePlaybackEngine(videoRef)` y expone `{ seek, togglePlay, inGap, videoRef }` por contexto. `PreviewArea` renderiza `<PreviewCanvas videoRef>` con `children=(canvas)=><OverlayLayer .../>` y `<TransportBar videoRef>`.
- `PreviewCanvas.tsx`: lee `tracks.video[0]?.clips` (base), calcula `activeClip` por playhead y `videoStyle` (tamaño/posición del frame completo). Renderiza fondo + un único `<div wrapper><video ref={videoRef}></div>` con la geometría visible (incluye lógica de crop-mode “mostrar frame completo”). El fondo blur (`bgVideoRef`) espeja `videoRef`.
- `usePlaybackEngine.ts`: `sync(seeking)` localiza el clip activo en `tracks.video[0].clips`, fija src/currentTime/playbackRate/volume y play/pausa de `videoRef`. Un rAF avanza el playhead leyendo `videoRef.current.currentTime`. Se resincroniza al cambiar el proyecto. `inGap` derivado.
- `OverlayLayer.tsx`: `VideoFrameNode` (sin props de clip) usa el clip activo de la base para su recuadro/asas (mover = `zoom.x/y`, escalar = `zoom.scale`, rueda = zoom). Lee `tracks.video[0]?.clips`.
- Helpers: `videoClipAt(clips, t)`, `clipEnd`, `sourceTimeFor`, `clamp01`, `renderRect` (server) — en cliente la geometría se calcula inline.

---

## Task 1: Ops del store para pistas (modelo)

**Files:**
- Modify: `client/src/stores/projectStore.ts`
- Test: `client/src/stores/projectStore.test.ts`

- [ ] **Step 1: Tests de las ops nuevas**

Añade a `projectStore.test.ts` (sigue el estilo del archivo: `loadProject(createEmptyProject(...))` en un `beforeEach`, helpers existentes):

```ts
describe("pistas de vídeo (multipista)", () => {
  it("addVideoTrack añade una pista vacía encima", () => {
    const s = useProjectStore.getState();
    expect(s.project.tracks.video).toHaveLength(1);
    s.addVideoTrack();
    expect(useProjectStore.getState().project.tracks.video).toHaveLength(2);
    expect(useProjectStore.getState().project.tracks.video[1].clips).toEqual([]);
  });

  it("removeVideoTrack elimina la pista y sus clips, pero nunca deja 0 pistas", () => {
    const s = useProjectStore.getState();
    s.addVideoTrack();
    const id = useProjectStore.getState().project.tracks.video[1].id;
    s.removeVideoTrack(id);
    expect(useProjectStore.getState().project.tracks.video).toHaveLength(1);
    // intentar borrar la última no la borra
    const baseId = useProjectStore.getState().project.tracks.video[0].id;
    s.removeVideoTrack(baseId);
    expect(useProjectStore.getState().project.tracks.video.length).toBeGreaterThanOrEqual(1);
  });

  it("moveClipToTrack mueve un clip a otra pista si no solapa", () => {
    const s = useProjectStore.getState();
    s.addVideoClip({ id: "c1", url: "", title: "", fileName: "c1.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" });
    s.addVideoTrack();
    const baseTrack = useProjectStore.getState().project.tracks.video[0];
    const destId = useProjectStore.getState().project.tracks.video[1].id;
    const clipId = baseTrack.clips[0].id;
    s.moveClipToTrack(clipId, destId, 0);
    const st = useProjectStore.getState().project.tracks.video;
    expect(st[0].clips).toHaveLength(0);
    expect(st[1].clips.map((c) => c.id)).toContain(clipId);
  });

  it("moveClipToTrack rechaza el movimiento si solaparía en destino", () => {
    const s = useProjectStore.getState();
    s.addVideoClip({ id: "c1", url: "", title: "", fileName: "c1.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" });
    s.addVideoTrack();
    // pone un clip ocupando [0,5) en la pista destino
    const destId = useProjectStore.getState().project.tracks.video[1].id;
    const movingId = useProjectStore.getState().project.tracks.video[0].clips[0].id;
    s.moveClipToTrack(movingId, destId, 0); // primero mueve uno
    s.addVideoClip({ id: "c2", url: "", title: "", fileName: "c2.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" });
    const secondId = useProjectStore.getState().project.tracks.video[0].clips[0].id;
    // intenta mover el segundo a destino en t=0 → solapa con el primero
    s.moveClipToTrack(secondId, destId, 0);
    const st = useProjectStore.getState().project.tracks.video;
    expect(st[0].clips.map((c) => c.id)).toContain(secondId); // sigue en base
  });
});
```

- [ ] **Step 2: Run para ver fallar**

Run: `cd client && npx vitest run projectStore -t multipista`
Expected: FAIL (las ops no existen).

- [ ] **Step 3: Declarar las ops en la interfaz `ProjectState`**

Junto a las demás firmas de vídeo:

```ts
  addVideoTrack: () => void;
  removeVideoTrack: (trackId: string) => void;
  moveClipToTrack: (clipId: string, destTrackId: string, newStart: number, opts?: MutateOptions) => void;
```

- [ ] **Step 4: Implementar las ops**

Usa los helpers `findClipCtx`, `baseTrack`, `createVideoTrack` ya presentes (importa `createVideoTrack` si no lo está). Añade en el objeto del store:

```ts
    addVideoTrack: () =>
      mutate((d) => {
        d.tracks.video.push(createVideoTrack());
      }),

    removeVideoTrack: (trackId) =>
      mutate((d) => {
        if (d.tracks.video.length <= 1) return; // nunca dejar 0 pistas
        const idx = d.tracks.video.findIndex((t) => t.id === trackId);
        if (idx !== -1) d.tracks.video.splice(idx, 1);
      }),

    moveClipToTrack: (clipId, destTrackId, newStart, opts) =>
      mutate((d) => {
        const ctx = findClipCtx(d, clipId);
        const dest = d.tracks.video.find((t) => t.id === destTrackId);
        if (!ctx || !dest) return;
        const start = Math.max(0, newStart);
        // no-solape en la pista destino (excluye el propio clip si ya estuviera ahí)
        if (hasOverlap(dest.clips, start, clipDuration(ctx.clip), clipId)) return;
        // saca el clip de su pista actual y lo coloca en destino con el nuevo inicio
        ctx.track.clips.splice(ctx.index, 1);
        dest.clips.push({ ...ctx.clip, timelineStart: start });
        dest.clips.sort((a, b) => a.timelineStart - b.timelineStart);
      }, opts),
```

- [ ] **Step 5: Run hasta verde**

Run: `cd client && npx vitest run projectStore`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/stores/projectStore.ts client/src/stores/projectStore.test.ts
git commit -m "feat(multipista): ops del store para crear/borrar pistas y mover clips entre pistas"
```

---

## Task 2: Helper puro de pista activa + geometría (testeable)

**Files:**
- Create: `client/src/features/preview/trackVideo.ts`
- Test: `client/src/features/preview/trackVideo.test.ts`

Extrae la lógica pura que comparten PreviewCanvas y OverlayLayer para no duplicarla y poder testearla.

- [ ] **Step 1: Test**

```ts
import { describe, expect, it } from "vitest";
import { visibleRect } from "./trackVideo";

describe("visibleRect", () => {
  const info = { width: 1920, height: 1080 };
  it("sin crop: tamaño del frame completo, posición por zoom", () => {
    const r = visibleRect(1080, 1920, info, { x: 0.5, y: 0.5, scale: 1 }, null);
    // base = min(1080/1920, 1920/1080) = 0.5625 → w=1080, h=607.5
    expect(Math.round(r.w)).toBe(1080);
    expect(Math.round(r.fullW)).toBe(1080);
  });
  it("con crop reduce el tamaño visible y posiciona por (lienzo - visible)", () => {
    const r = visibleRect(1080, 1920, info, { x: 1, y: 0.5, scale: 1 }, { x: 0.25, y: 0, w: 0.5, h: 1 });
    expect(Math.round(r.w)).toBe(540); // 1080 * 0.5
    expect(Math.round(r.left)).toBe(1080 - 540); // zoom.x=1 → pegado a la derecha
  });
});
```

- [ ] **Step 2: Implementar (refleja `renderRect` del server y la geometría de PreviewCanvas)**

```ts
import type { CropRect } from "@clipforge/shared";

export interface VisibleRect {
  fullW: number; fullH: number; // frame completo
  w: number; h: number;         // visible (frame × crop)
  left: number; top: number;    // posición del rect visible en el lienzo
  cropX: number; cropY: number; // origen del recorte (fracción)
}

/** Geometría del rect VISIBLE de un clip en el lienzo (misma fórmula que el export). */
export function visibleRect(
  canvasW: number,
  canvasH: number,
  info: { width: number; height: number },
  zoom: { x: number; y: number; scale: number },
  crop: CropRect,
): VisibleRect {
  const base = Math.min(canvasW / info.width, canvasH / info.height);
  const fullW = info.width * base * zoom.scale;
  const fullH = info.height * base * zoom.scale;
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const w = fullW * c.w;
  const h = fullH * c.h;
  return {
    fullW, fullH, w, h,
    left: zoom.x * (canvasW - w),
    top: zoom.y * (canvasH - h),
    cropX: c.x, cropY: c.y,
  };
}
```

- [ ] **Step 3: Run hasta verde + Commit**

Run: `cd client && npx vitest run trackVideo` → PASS.
```bash
git add client/src/features/preview/trackVideo.ts client/src/features/preview/trackVideo.test.ts
git commit -m "feat(multipista): helper puro visibleRect para la geometría de pista"
```

---

## Task 3: Registro de vídeos esclavos en el contexto de reproducción

**Files:**
- Modify: `client/src/features/preview/PreviewArea.tsx`
- Modify: `client/src/features/preview/usePlaybackEngine.ts` (firma)

- [ ] **Step 1: Añadir el registro y exponerlo por contexto**

En `PreviewArea.tsx`, dentro de `PlaybackProvider`:

```ts
  const videoRef = useRef<HTMLVideoElement>(null);
  // Registro de los <video> de las pistas superiores (esclavos), por id de pista
  const overlayVideos = useRef<Map<string, HTMLVideoElement>>(new Map());
  const registerOverlayVideo = useCallback((trackId: string, el: HTMLVideoElement | null) => {
    if (el) overlayVideos.current.set(trackId, el);
    else overlayVideos.current.delete(trackId);
  }, []);
  const engine = usePlaybackEngine(videoRef, overlayVideos);
```

Amplía el tipo `PlaybackApi` y el value del provider con `registerOverlayVideo`:

```ts
interface PlaybackApi {
  seek: (t: number) => void;
  togglePlay: () => void;
  inGap: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  registerOverlayVideo: (trackId: string, el: HTMLVideoElement | null) => void;
}
```
(añade `registerOverlayVideo` al objeto pasado a `PlaybackContext.Provider`). Importa `useCallback`.

- [ ] **Step 2: Aceptar el registro en `usePlaybackEngine` (sin usarlo aún)**

Cambia la firma a `usePlaybackEngine(videoRef, overlayVideos: RefObject<Map<string, HTMLVideoElement>>)`. Aún no lo usa (Task 5). Typecheck verde.

- [ ] **Step 3: Typecheck + Commit**

Run: `cd client && npx tsc --noEmit` → limpio.
```bash
git add client/src/features/preview/PreviewArea.tsx client/src/features/preview/usePlaybackEngine.ts
git commit -m "feat(multipista): registro de vídeos esclavos en el contexto de reproducción"
```

---

## Task 4: Render de un `<video>` por pista en PreviewCanvas

**Files:**
- Modify: `client/src/features/preview/PreviewCanvas.tsx`

Factoriza el render del vídeo en un componente `TrackVideo` que sirve tanto para la base
como para las capas. La base mantiene `videoRef` y la fuente del blur; las capas se
registran vía `registerOverlayVideo`.

- [ ] **Step 1: Crear `TrackVideo`**

Dentro de `PreviewCanvas.tsx` (o un archivo hermano), un componente que recibe la pista,
el `canvas`, `inGap`, si es base, y (si no) la función de registro. Calcula su clip
activo por el playhead, su geometría con `visibleRect`, su opacidad, y el caso crop-mode
“frame completo”. Estructura `<div wrapper><video></div>` SIEMPRE montada (no remonta).

```tsx
import { visibleRect } from "./trackVideo";
// ...
function TrackVideo({ track, canvas, isBase, videoRef, register, zIndex }: {
  track: VideoTrack; canvas: { width: number; height: number };
  isBase: boolean; inGap: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
  register?: (id: string, el: HTMLVideoElement | null) => void;
  zIndex: number;
}) {
  const playhead = useUiStore((s) => s.playhead);
  const cropMode = useUiStore((s) => s.cropMode);
  const selection = useUiStore((s) => s.selection);
  const clipsInfo = useClipsStore((s) => s.clips);
  const active = videoClipAt(track.clips, playhead);
  const info = active ? clipsInfo.find((c) => c.id === active.clipId) : undefined;

  // ref: la base usa videoRef; las capas se registran en el motor
  const localRef = useRef<HTMLVideoElement>(null);
  const setEl = (el: HTMLVideoElement | null) => {
    if (isBase && videoRef) (videoRef as MutableRefObject<HTMLVideoElement | null>).current = el;
    else { localRef.current = el; register?.(track.id, el); }
  };

  if (!info || !canvas.width) {
    // mantener el <video> montado pero oculto para no remontar (igual que la base hoy)
    return <video ref={setEl} preload="auto" className="absolute max-w-none" style={{ visibility: "hidden", inset: 0, width: "100%", height: "100%", zIndex }} />;
  }
  const isCroppingThis = cropMode && selection?.kind === "video" && selection.id === active!.id;
  const crop = isCroppingThis ? null : active!.crop;
  const r = visibleRect(canvas.width, canvas.height, info, active!.zoom, crop);
  // ... estilos del wrapper/inner como en el PreviewCanvas actual, usando r ...
  // wrapper: left=r.left, top=r.top, width=r.w, height=r.h, overflow hidden, opacity=active.opacity, zIndex
  // inner: width=r.fullW, height=r.fullH, left=-r.fullW*r.cropX, top=-r.fullH*r.cropY, filter (color del clip)
  return (/* <div style={wrapper}><video ref={setEl} ...style={inner}/></div> */);
}
```

> Reutiliza el cálculo del `filter` CSS de color del clip que PreviewCanvas ya hace
> (brightness/contrast/saturate/hue/grayscale) — extráelo a una función o cópialo.
> La **base** conserva además el espejo del blur (`bgVideoRef` sigue espejando `videoRef`).

- [ ] **Step 2: Renderizar una `TrackVideo` por pista en z-order**

En el JSX de PreviewCanvas, sustituye el bloque del `<video>` único por:

```tsx
{project.tracks.video.map((track, i) => (
  <TrackVideo
    key={track.id}
    track={track}
    canvas={canvas}
    inGap={inGap}
    isBase={i === 0}
    videoRef={i === 0 ? videoRef : undefined}
    register={i === 0 ? undefined : registerOverlayVideo}
    zIndex={i}
  />
))}
```

`registerOverlayVideo` se obtiene de `usePlayback()`. `project.tracks.video` se suscribe
del store. El velo y los overlays Konva (`children`) van por encima (z mayor) como ahora.

- [ ] **Step 3: Typecheck + Commit**

Run: `cd client && npx tsc --noEmit` → limpio. (Visualmente: con una sola pista debe verse igual que antes.)
```bash
git add client/src/features/preview/PreviewCanvas.tsx
git commit -m "feat(multipista): render de un <video> por pista en el preview (z-order, opacidad)"
```

---

## Task 5: Sincronizar los vídeos esclavos en el motor

**Files:**
- Modify: `client/src/features/preview/usePlaybackEngine.ts`

- [ ] **Step 1: Sincronizar esclavos en `sync` y corregir deriva en el rAF**

Añade un helper interno `syncOverlays(seeking)` que itera `overlayVideos.current`:

```ts
  const syncOverlays = useCallback((seeking: boolean) => {
    const map = overlayVideos.current;
    if (!map || map.size === 0) return;
    const { playhead, playing } = useUiStore.getState();
    const project = useProjectStore.getState().project;
    const clips = useClipsStore.getState().clips;
    const volume = usePlayerStore.getState().volume;
    for (const track of project.tracks.video.slice(1)) {
      const el = map.get(track.id);
      if (!el) continue;
      const active = videoClipAt(track.clips, playhead);
      if (!active) { if (!el.paused) el.pause(); continue; }
      const info = clips.find((c) => c.id === active.clipId);
      if (!info) continue;
      const src = `/files/${info.fileName}`;
      if (el.getAttribute("src") !== src) el.src = src;
      el.volume = volume;
      if (el.playbackRate !== active.speed) el.playbackRate = active.speed;
      const target = sourceTimeFor(active, playhead);
      if (seeking || Math.abs(el.currentTime - target) > SYNC_TOLERANCE) el.currentTime = target;
      if (playing && el.paused) void el.play().catch(() => {});
      if (!playing && !el.paused) el.pause();
    }
  }, [overlayVideos]);
```

- Llama `syncOverlays(seeking)` al final de `sync(seeking)`.
- En el tick del rAF (tras actualizar el playhead desde la base), llama `syncOverlays(false)` para corregir deriva de los esclavos cada frame.
- En el `seek` y en el efecto de play/pause, ya se llama `sync`, que ahora arrastra a los esclavos.

> Importa `sourceTimeFor`, `usePlayerStore` si hace falta. `SYNC_TOLERANCE` ya existe.
> Una sola pista → `map` vacío → `syncOverlays` es no-op (comportamiento idéntico).

- [ ] **Step 2: Typecheck + Commit**

Run: `cd client && npx tsc --noEmit` → limpio.
```bash
git add client/src/features/preview/usePlaybackEngine.ts
git commit -m "feat(multipista): sincronizar los vídeos de las pistas superiores con el playhead"
```

---

## Task 6: Recuadro de selección por clip de cualquier pista (OverlayLayer)

**Files:**
- Modify: `client/src/features/preview/OverlayLayer.tsx`

Hoy `VideoFrameNode` opera sobre el clip activo de la base. Generalízalo para renderizar
un recuadro por **clip activo de cada pista** (así se puede seleccionar/mover/zoom
cualquier capa). La selección (`{kind:"video", id}`) ya identifica el clip por id único.

- [ ] **Step 1: Parametrizar `VideoFrameNode` por clip+pista**

- `VideoFrameNode` recibe el `clip` (VideoClip) y su pista; su geometría usa `visibleRect`
  (reemplaza el cálculo inline actual) — idéntico resultado para la base.
- Las ediciones (mover→zoom.x/y, escalar→zoom.scale, rueda) siguen llamando
  `updateVideoClip(clip.id, ...)` (ya funciona por id en cualquier pista tras Fase 1).
- En `OverlayLayer`, en vez de un solo `VideoFrameNode`, renderiza uno por cada pista que
  tenga clip activo en el playhead, en z-order:

```tsx
{project.tracks.video.map((track) => {
  const active = videoClipAt(track.clips, playhead);
  return active ? <VideoFrameNode key={track.id} clip={active} width={width} height={height} onGuides={onGuides} cropMode={cropMode} /> : null;
})}
```

- `selected` se deriva de `selection?.kind==="video" && selection.id===clip.id`.
- El Transformer se adjunta solo al recuadro seleccionado (como hoy).

> Mantén el imán de centrado y el clamp por tamaño visible que ya implementaste en Fase
> de recorte (ahora vía `visibleRect`). Suscribe `project.tracks.video` y `playhead`.

- [ ] **Step 2: Typecheck + tests del cliente**

Run: `cd client && npx tsc --noEmit` → limpio.
Run: `cd client && npx vitest run` → PASS (los tests existentes no cubren Konva, pero no deben romperse).

- [ ] **Step 3: Commit**

```bash
git add client/src/features/preview/OverlayLayer.tsx
git commit -m "feat(multipista): recuadro de selección por clip activo de cada pista"
```

---

## Task 7: Verificación de la fase

- [ ] **Step 1: Suite + typecheck globales**

Run: `cd shared && npx vitest run` && `cd ../client && npx vitest run` && `cd ../server && npx vitest run` → PASS.
Run typecheck en los tres → limpio.

- [ ] **Step 2: Smoke manual del usuario (con afordancia temporal si hace falta)**

La Fase 4 (UI del timeline) aún no existe, así que para ver el PiP el usuario necesita
crear una segunda pista. Opciones de verificación:
- Vía consola del navegador: `useProjectStore.getState().addVideoTrack()` y
  `moveClipToTrack(<clipId>, <destTrackId>, <t>)` para colocar un clip en la 2ª pista, y
  comprobar que el preview muestra ambos vídeos compositados, sincronizados al reproducir,
  con su opacidad/posición, y que cada uno es seleccionable/movible.
- Reproducir: ambos avanzan juntos; al hacer scrub, ambos saltan al frame correcto.
- Una sola pista: el preview se ve y se comporta exactamente igual que antes (sin regресión).

- [ ] **Step 3: Actualizar TODO.md y push**

Marca la Fase 3 hecha en `TODO.md` (TASK-012) y `git push origin master`.

---

## Riesgos / notas

- **Sincronía de esclavos:** corregir `currentTime` solo cuando la deriva supera
  `SYNC_TOLERANCE` evita seeks constantes (stutter). Si al reproducir las capas se
  desincronizan, subir la frecuencia de corrección o bajar la tolerancia.
- **Coste de decodificar N vídeos** a la vez: aceptable para 2–4 pistas; no optimizar
  prematuramente.
- **No-op en una pista:** confirmado en cada task (sin esclavos, sin recuadros extra).
- **Verificación visual completa** llega de forma natural con la Fase 4 (crear pistas y
  arrastrar clips desde el timeline). Fase 5: opacidad por capa en la UI de propiedades.
