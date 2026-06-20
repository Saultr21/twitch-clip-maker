# Multipista de vídeo — Fase 4: Timeline multipista (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el timeline muestre un carril por pista de vídeo (arriba = capa superior, base abajo), con un botón **+** para añadir pista, control para quitar pista, soltar clips de Medios en una pista concreta, y (tarea aparte) arrastrar clips existentes entre pistas. Esto deja el picture-in-picture **usable de punta a punta** desde la UI.

**Architecture:** Hoy `Timeline` renderiza UNA `TrackRow` "Vídeo" con los clips de la pista base. Se sustituye por un bucle sobre `project.tracks.video` (en orden inverso: índice alto = capa superior = carril arriba). Cada carril es una `TrackRow` con los clips de SU pista, su `onDropClip` apuntando a esa pista, y (salvo la base) un control para borrarla. Las ops del store (`addVideoTrack`, `removeVideoTrack`, `moveClipToTrack`) ya existen (Fase 3); falta `addVideoClipToTrack`. El arrastre entre pistas se hace a nivel de `Timeline` detectando el carril destino por la Y del puntero.

**Tech Stack:** React, Zustand, eventos pointer + DnD nativo (HTML5), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-20-multipista-video-design.md` (sección 5). Fases 1-3 hechas.

---

## Contexto del código actual (para el implementador)

- `client/src/features/timeline/Timeline.tsx`: calcula `baseClips = project.tracks.video[0]?.clips ?? EMPTY_CLIPS`, `videoBlocks` a partir de ellos, y renderiza UNA `<TrackRow title="Vídeo" blocks={videoBlocks} onMove=moveVideoClip onTrim=trimVideoClip onDropClip=(addVideoClipAt) />`. Debajo, las TrackRow de Texto/Imagen/Música/Subtítulos (no se tocan).
- `client/src/features/timeline/TrackRow.tsx`: una pista. Renderiza una etiqueta (`title`, ancho `w-20`) + área de bloques. Soporta `lanes`/`laneCount` (apilado), arrastre horizontal (mover/trim) por pointer events con `setPointerCapture`, y `onDropClip` (DnD nativo desde Medios, tipo `application/x-clip-id`). `BlockDescriptor` = `{ id, kind, start, end, label, color, waveform? }`.
- Store: `addVideoClipAt(clip, start)` añade a la base; `addVideoTrack()`, `removeVideoTrack(id)`, `moveClipToTrack(clipId, destId, start)` ya existen. `videoClipAt`, `clipEnd`, `hasOverlap`, `clipDuration` en `lib/timeline.ts`.
- `MediaPanel` arrastra un clip con `dataTransfer.setData("application/x-clip-id", clip.id)`.

---

## Task 1: Store — añadir un clip a una pista concreta

**Files:**
- Modify: `client/src/stores/projectStore.ts`
- Test: `client/src/stores/projectStore.test.ts`

- [ ] **Step 1: Test**

```ts
it("addVideoClipToTrack añade el clip a la pista indicada en el instante dado", () => {
  const s = useProjectStore.getState();
  s.addVideoTrack();
  const destId = useProjectStore.getState().project.tracks.video[1].id;
  s.addVideoClipToTrack(
    { id: "c1", url: "", title: "", fileName: "c1.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" },
    destId, 2,
  );
  const st = useProjectStore.getState().project.tracks.video;
  expect(st[0].clips).toHaveLength(0);
  expect(st[1].clips).toHaveLength(1);
  expect(st[1].clips[0].timelineStart).toBe(2);
});

it("addVideoClipToTrack cae al final si el instante solaparía en esa pista", () => {
  const s = useProjectStore.getState();
  s.addVideoTrack();
  const destId = useProjectStore.getState().project.tracks.video[1].id;
  const info = { id: "c1", url: "", title: "", fileName: "c1.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" };
  s.addVideoClipToTrack(info, destId, 0); // ocupa [0,5)
  s.addVideoClipToTrack(info, destId, 2); // solaparía → al final (5)
  const clips = useProjectStore.getState().project.tracks.video[1].clips;
  expect(clips).toHaveLength(2);
  expect(Math.max(...clips.map((c) => c.timelineStart))).toBe(5);
});
```

- [ ] **Step 2: Run para ver fallar**

Run: `cd client && npx vitest run projectStore -t addVideoClipToTrack`
Expected: FAIL.

- [ ] **Step 3: Declarar + implementar**

Firma en `ProjectState`:
```ts
  addVideoClipToTrack: (clip: ClipInfo, trackId: string, start: number) => void;
```
Implementación (misma política anti-solape que `addVideoClipAt`, pero sobre la pista dada):
```ts
    addVideoClipToTrack: (clip, trackId, start) =>
      mutate((d) => {
        const track = d.tracks.video.find((t) => t.id === trackId);
        if (!track) return;
        const dur = clip.duration;
        const desired = Math.max(0, start);
        const overlaps = track.clips.some(
          (v) => desired < clipEnd(v) && desired + dur > v.timelineStart,
        );
        const lastEnd = track.clips.length ? Math.max(...track.clips.map(clipEnd)) : 0;
        track.clips.push(createVideoClip(clip.id, overlaps ? lastEnd : desired, dur));
        track.clips.sort((a, b) => a.timelineStart - b.timelineStart);
      }),
```

- [ ] **Step 4: Run hasta verde + Commit**

Run: `cd client && npx vitest run projectStore` → PASS.
```bash
git add client/src/stores/projectStore.ts client/src/stores/projectStore.test.ts
git commit -m "feat(multipista): addVideoClipToTrack para soltar clips en una pista concreta"
```

---

## Task 2: Render de un carril por pista de vídeo + añadir/quitar pista

**Files:**
- Modify: `client/src/features/timeline/Timeline.tsx`
- Modify: `client/src/features/timeline/TrackRow.tsx` (prop opcional para borrar la pista)

- [ ] **Step 1: TrackRow acepta una acción opcional de borrar pista**

Añade props opcionales a `TrackRowProps`:
```ts
  /** Si se define, muestra un botón “×” en la cabecera para borrar la pista. */
  onRemoveTrack?: () => void;
```
En la cabecera (el `div` de `title`, ancho `w-20`), si `onRemoveTrack` está definido, añade un botón pequeño “×” a la derecha del título:
```tsx
<div className="w-20 shrink-0 px-2 py-1 text-[10px] text-muted border-r border-border bg-surface sticky left-0 z-10 flex items-center justify-between gap-1">
  <span className="truncate">{title}</span>
  {onRemoveTrack && (
    <button type="button" onClick={onRemoveTrack} title="Quitar pista"
      aria-label={`Quitar pista ${title}`} className="text-muted hover:text-danger shrink-0">×</button>
  )}
</div>
```

- [ ] **Step 2: Timeline renderiza una TrackRow por pista de vídeo (arriba = capa superior)**

En `Timeline.tsx`, sustituye el cálculo de `baseClips`/`videoBlocks` y la única `<TrackRow title="Vídeo">` por un render de todas las pistas. Helper para los bloques de una pista:

```tsx
const videoTracks = project.tracks.video;
const blocksForTrack = (clipsOfTrack: VideoClip[]): BlockDescriptor[] =>
  clipsOfTrack.map((c) => {
    const info = clips.find((i) => i.id === c.clipId);
    return {
      id: c.id, kind: "video" as const, start: c.timelineStart, end: clipEnd(c),
      label: info?.title ?? "clip", color: "bg-accent/25 text-accent-soft",
      waveform: info ? { kind: "clip" as const, fileName: info.fileName, trimIn: c.trimIn, trimOut: c.trimOut } : undefined,
    };
  });
```

En el JSX, en lugar de la TrackRow de "Vídeo", renderiza las pistas en orden inverso
(índice mayor arriba = capa superior; la base, índice 0, queda abajo):

```tsx
{videoTracks.map((track, i) => i).reverse().map((i) => {
  const track = videoTracks[i];
  const isBase = i === 0;
  return (
    <TrackRow
      key={track.id}
      title={isBase ? "Vídeo" : `Vídeo ${i + 1}`}
      blocks={blocksForTrack(track.clips)}
      pxPerSecond={pxPerSecond}
      onMove={(id, t, transient) => moveVideoClip(id, t, { transient })}
      onTrim={(id, edge, t, transient) => trimVideoClip(id, edge, t, { transient })}
      onDropClip={(clipId, t) => {
        const clip = clips.find((c) => c.id === clipId);
        if (!clip) return;
        useProjectStore.getState().addVideoClipToTrack(clip, track.id, t);
        useUiStore.getState().select(null);
      }}
      onRemoveTrack={isBase ? undefined : () => useProjectStore.getState().removeVideoTrack(track.id)}
    />
  );
})}
```

Añade un botón **+ Pista de vídeo** en la barra de herramientas del timeline (junto a
Dividir/Eliminar/Recortar):
```tsx
<button type="button" onClick={() => useProjectStore.getState().addVideoTrack()}
  title="Añadir pista de vídeo" aria-label="Añadir pista de vídeo"
  className="flex items-center gap-1 text-muted hover:text-text text-xs px-1.5">
  + Pista
</button>
```

> `baseClips`/`videoBlocks`/`EMPTY_CLIPS` y el efecto de auto-scroll pueden seguir
> usando la pista base (índice 0) — el auto-scroll al añadir clip a la base se mantiene.
> Importa `VideoClip` de `@clipforge/shared` para el tipo del helper.

- [ ] **Step 3: Typecheck + tests + Commit**

Run: `cd client && npx tsc --noEmit` → limpio. `cd client && npx vitest run` → PASS.
```bash
git add client/src/features/timeline/Timeline.tsx client/src/features/timeline/TrackRow.tsx
git commit -m "feat(multipista): un carril por pista de vídeo en el timeline + añadir/quitar pista"
```

**En este punto el PiP ya es usable:** añadir pista → arrastrar un clip de Medios al
carril nuevo → se ve compositado en el preview y se exporta.

---

## Task 3: Arrastrar clips existentes entre pistas de vídeo

**Files:**
- Modify: `client/src/features/timeline/Timeline.tsx`
- Modify: `client/src/features/timeline/TrackRow.tsx`

Permite arrastrar un bloque de vídeo en vertical para cambiarlo de pista. Se detecta el
carril destino por la Y del puntero al soltar.

- [ ] **Step 1: TrackRow informa de la Y del puntero al soltar un “move”**

Añade prop opcional:
```ts
  /** Al soltar un arrastre de tipo "move", informa de la Y de pantalla y el start final. */
  onMoveEnd?: (id: string, clientY: number, start: number) => void;
```
En el handler de arrastre, guarda el último `start` calculado en el modo "move" y el
`clientY`; en `onPointerUp`, si el modo era "move" y `onMoveEnd` está definido, llámalo:
```ts
// dentro de onPointerMove (modo move), tras onMove(...):
drag.lastStart = snapped; drag.lastClientY = e.clientY;
// onPointerUp:
const drag = dragRef.current;
if (drag?.mode === "move" && drag.started && onMoveEnd) onMoveEnd(drag.id, drag.lastClientY ?? 0, drag.lastStart ?? 0);
dragRef.current = null;
```
(extiende el tipo de `dragRef` con `lastStart?: number; lastClientY?: number`).

- [ ] **Step 2: Timeline mapea la Y a la pista destino y mueve el clip**

Envuelve los carriles de vídeo en un contenedor con ref (`videoLanesRef`). Pasa a cada
TrackRow de vídeo `onMoveEnd`. En Timeline:
```ts
const videoLanesRef = useRef<HTMLDivElement>(null);
const LANE_TOTAL = 36; // alto aprox. de un carril de vídeo (4 + 32); ajustar si difiere
const handleVideoMoveEnd = (clipId: string, clientY: number, start: number) => {
  const cont = videoLanesRef.current;
  if (!cont) return;
  const rect = cont.getBoundingClientRect();
  // carril visual (de arriba abajo) → índice de pista (recordando el render inverso)
  const visualLane = Math.floor((clientY - rect.top) / LANE_TOTAL);
  const order = videoTracks.map((_, i) => i).reverse(); // [N-1..0]
  const destIndex = order[Math.max(0, Math.min(order.length - 1, visualLane))];
  const destTrack = videoTracks[destIndex];
  const src = videoTracks.find((t) => t.clips.some((c) => c.id === clipId));
  if (!destTrack || !src || src.id === destTrack.id) return; // misma pista: nada
  useProjectStore.getState().moveClipToTrack(clipId, destTrack.id, start);
};
```
Renderiza los carriles de vídeo dentro de `<div ref={videoLanesRef}>...</div>` y pasa
`onMoveEnd={handleVideoMoveEnd}` a cada TrackRow de vídeo.

> Nota: el alto del carril debe coincidir con el real (`4 + laneCount*LANE_HEIGHT`, y los
> carriles de vídeo tienen `laneCount=1` → 36). Si el implementador ve desalineación,
> medir el carril real en vez de la constante (p. ej. `cont.children[k].getBoundingClientRect()`).
> `moveClipToTrack` ya rechaza el solape en destino, así que un drop inválido no rompe nada.

- [ ] **Step 3: Typecheck + tests + Commit**

Run: `cd client && npx tsc --noEmit` → limpio. `cd client && npx vitest run` → PASS.
```bash
git add client/src/features/timeline/Timeline.tsx client/src/features/timeline/TrackRow.tsx
git commit -m "feat(multipista): arrastrar clips entre pistas de vídeo en el timeline"
```

> Si esta tarea desestabiliza el arrastre horizontal existente o resulta frágil, repórtalo
> como BLOCKED/diferido: la Task 2 ya entrega PiP usable (soltar desde Medios en cada pista).

---

## Task 4: Verificación de la fase

- [ ] **Step 1: Suite + typecheck globales** → PASS/limpio en shared/client/server.

- [ ] **Step 2: Smoke manual del usuario (ya completamente testeable en UI)**

- “+ Pista” crea un carril nuevo arriba (capa superior).
- Arrastrar un clip de Medios al carril nuevo → aparece como overlay en el preview
  (PiP), sincronizado al reproducir; se puede mover/zoom/recortar/opacidad-por-clip.
- “×” en una pista no base la borra (con sus clips).
- (Si Task 3) arrastrar un clip de un carril a otro lo cambia de pista.
- Exportar → el MP4 refleja el PiP.
- Una sola pista: el timeline se ve y funciona igual que antes.

- [ ] **Step 3: Actualizar TODO.md y push.**

---

## Riesgos / notas

- **Arrastre vertical (Task 3)** es lo más frágil por el modelo de `setPointerCapture`
  (los eventos siguen en el bloque aunque el puntero esté sobre otro carril); por eso se
  resuelve mapeando `clientY`→carril en el `Timeline`. Diferible sin perder el MVP.
- Convención de z-order: carril **arriba = capa superior**; base (índice 0) abajo. Coincide
  con el orden de compositación del preview/export.
- Borrar la pista base: la op del store promueve la siguiente a base; en la UI la base no
  muestra “×” (no se borra desde el timeline) — coherente.
- Fase 5 (siguiente): control de **opacidad por clip** en el panel de Propiedades
  (cableado a `updateVideoClip({ opacity })`).
