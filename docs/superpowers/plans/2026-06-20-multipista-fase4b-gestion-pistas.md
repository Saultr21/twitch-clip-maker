# Multipista — Fase 4b: Gestión de pistas en el timeline (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mejoras de UX del timeline multipista pedidas por el usuario (2026-06-20):
1. Botón **+** compacto en la columna de etiquetas (izquierda), encima de los carriles de vídeo, para añadir pista (sustituye al "+ Pista" de la barra superior).
2. **Crear pista soltando un clip en un hueco** por encima del carril superior o por debajo del inferior — vale tanto para clips de **Medios** (DnD nativo) como para clips **ya existentes** (arrastre por pointer).
3. **Reordenar pistas (z-order) arrastrando la cabecera** del carril arriba/abajo.

**Architecture:** Las pistas de vídeo se renderizan en `<div ref={videoLanesRef}>` (orden inverso: índice alto = arriba = capa superior). Se añaden: ops de store para crear pista con posición (devolviendo id) y reordenar; franjas de drop en los extremos del grupo de carriles; y DnD nativo de la cabecera para reordenar. La detección de "soltar en hueco" para clips existentes se hace en `handleVideoMoveEnd` (que ya mapea la Y del puntero al carril).

**Spec base:** `docs/superpowers/specs/2026-06-20-multipista-video-design.md`. Fases 1-5 hechas (multipista funcional).

---

## Contexto actual (para el implementador)

- `Timeline.tsx`: botón "+ Pista" en la barra superior (a quitar); `<div ref={videoLanesRef}>` envuelve las TrackRow de vídeo (render `videoTracks.map((_,i)=>i).reverse().map(i => ...)`); `handleVideoMoveEnd(clipId, clientY, start)` mapea la Y del puntero al carril destino midiendo `videoLanesRef.current.children` y llama `moveClipToTrack`.
- `TrackRow.tsx`: cabecera = `<div className="w-20 ...">` con `title` y, si hay `onRemoveTrack`, una "×". Área de bloques con `onDropClip` (DnD nativo, tipo `application/x-clip-id`). Arrastre de bloques por pointer; en "move", al soltar llama `onMoveEnd(id, clientY, start)`.
- Store: `addVideoTrack()` (push al final = arriba), `removeVideoTrack(id)`, `moveClipToTrack`, `addVideoClipToTrack(clip, trackId, start)`. `createVideoTrack` en `@clipforge/shared`.
- Convención z-order: índice 0 = base (abajo, reloj/blur); índice alto = arriba.

---

## Task 1: Store — crear pista con posición (devuelve id) + reordenar

**Files:** `client/src/stores/projectStore.ts`, `client/src/stores/projectStore.test.ts`

- [ ] **Step 1: Tests**

```ts
it("addVideoTrack('top') añade arriba (último índice) y devuelve su id", () => {
  const s = useProjectStore.getState();
  const id = s.addVideoTrack("top");
  const v = useProjectStore.getState().project.tracks.video;
  expect(v[v.length - 1].id).toBe(id);
  expect(v).toHaveLength(2);
});

it("addVideoTrack('bottom') añade abajo (índice 0)", () => {
  const s = useProjectStore.getState();
  const id = s.addVideoTrack("bottom");
  expect(useProjectStore.getState().project.tracks.video[0].id).toBe(id);
});

it("reorderVideoTrack mueve una pista a otro índice", () => {
  const s = useProjectStore.getState();
  const top = s.addVideoTrack("top"); // [base, top]
  s.reorderVideoTrack(1, 0);          // [top, base]
  const v = useProjectStore.getState().project.tracks.video;
  expect(v[0].id).toBe(top);
  expect(v).toHaveLength(2);
});
```

- [ ] **Step 2: Ver fallar** → `cd client && npx vitest run projectStore -t "addVideoTrack\|reorderVideoTrack"` → FAIL.

- [ ] **Step 3: Implementar**

Cambia la firma en `ProjectState`:
```ts
  addVideoTrack: (position?: "top" | "bottom") => string;
  reorderVideoTrack: (fromIndex: number, toIndex: number) => void;
```
Implementación. `addVideoTrack` debe devolver el id incluso dentro de `mutate` (crea el track FUERA del draft para conservar el id):
```ts
    addVideoTrack: (position = "top") => {
      const track = createVideoTrack();
      mutate((d) => {
        if (position === "bottom") d.tracks.video.unshift(track);
        else d.tracks.video.push(track);
      });
      return track.id;
    },

    reorderVideoTrack: (fromIndex, toIndex) =>
      mutate((d) => {
        const n = d.tracks.video.length;
        if (fromIndex < 0 || fromIndex >= n) return;
        const to = Math.max(0, Math.min(n - 1, toIndex));
        const [moved] = d.tracks.video.splice(fromIndex, 1);
        d.tracks.video.splice(to, 0, moved);
      }),
```

- [ ] **Step 4: Verde + Commit**

`cd client && npx vitest run projectStore` → PASS.
```bash
git add client/src/stores/projectStore.ts client/src/stores/projectStore.test.ts
git commit -m "feat(multipista): crear pista con posición (devuelve id) y reordenar pistas"
```

---

## Task 2: Botón "+" a la izquierda + crear pista soltando en un hueco

**Files:** `client/src/features/timeline/Timeline.tsx`, `client/src/features/timeline/TrackRow.tsx`

- [ ] **Step 1: Quitar "+ Pista" de la barra y poner "+" en la columna de etiquetas**

Elimina el botón "+ Pista" de la barra superior. Encima del `<div ref={videoLanesRef}>`, añade una fila con la "+" alineada a la columna de etiquetas (ancho `w-20`):
```tsx
<div className="flex border-b border-border/60">
  <div className="w-20 shrink-0 px-2 py-0.5 border-r border-border bg-surface sticky left-0 z-10">
    <button type="button" onClick={() => useProjectStore.getState().addVideoTrack("top")}
      title="Añadir pista de vídeo" aria-label="Añadir pista de vídeo"
      className="text-muted hover:text-text text-sm leading-none">+</button>
  </div>
  <div className="flex-1" />
</div>
```

- [ ] **Step 2: Franjas de drop (Medios) en los extremos del grupo de carriles**

Justo dentro de `<div ref={videoLanesRef}>`, una franja ANTES de los carriles (hueco superior) y otra DESPUÉS (hueco inferior). Cada una acepta DnD de Medios (`application/x-clip-id`); al soltar, crea pista y coloca el clip:
```tsx
function gapDrop(position: "top" | "bottom", t: number, clipId: string) {
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) return;
  const id = useProjectStore.getState().addVideoTrack(position);
  useProjectStore.getState().addVideoClipToTrack(clip, id, t);
  useUiStore.getState().select(null);
}
```
Componente de franja (reutiliza el patrón de `onDropClip` de TrackRow, simplificado):
```tsx
function GapDrop({ position, pxPerSecond, onDrop }: {
  position: "top" | "bottom"; pxPerSecond: number; onDrop: (pos: "top" | "bottom", t: number, clipId: string) => void;
}) {
  const [active, setActive] = useState(false);
  return (
    <div className="flex">
      <div className="w-20 shrink-0 border-r border-border bg-surface sticky left-0 z-10" />
      <div
        className={`flex-1 h-2 ${active ? "bg-accent/30 ring-1 ring-inset ring-accent" : ""}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-clip-id")) { e.preventDefault(); setActive(true); } }}
        onDragLeave={() => setActive(false)}
        onDrop={(e) => {
          e.preventDefault(); setActive(false);
          const clipId = e.dataTransfer.getData("application/x-clip-id");
          if (!clipId) return;
          const rect = e.currentTarget.getBoundingClientRect();
          onDrop(position, Math.max(0, (e.clientX - rect.left) / pxPerSecond), clipId);
        }}
      />
    </div>
  );
}
```
Coloca `<GapDrop position="top" .../>` antes del map de carriles y `<GapDrop position="bottom" .../>` después, dentro de `videoLanesRef`. (La franja de h-2 es fina pero válida; el resaltado al `dragover` la hace visible.)

> Importante: que `videoLanesRef.current.children` sigan siendo SOLO carriles para que el
> mapeo Y→carril de `handleVideoMoveEnd` no se confunda con las franjas. Solución: NO metas
> las franjas dentro de `videoLanesRef`; ponlas como hermanas (una antes, otra después del
> `<div ref={videoLanesRef}>`). Reestructura así:
> `<GapDrop top/>` · `<div ref={videoLanesRef}>{lanes}</div>` · `<GapDrop bottom/>`.

- [ ] **Step 3: Crear pista al soltar un clip EXISTENTE en un hueco**

Extiende `handleVideoMoveEnd`: si la `clientY` cae por ENCIMA del primer carril o por DEBAJO del último (fuera del rango de `videoLanesRef`), crea pista en esa posición y mueve el clip ahí:
```ts
const contRect = cont.getBoundingClientRect();
if (clientY < contRect.top) {
  const id = useProjectStore.getState().addVideoTrack("top");
  useProjectStore.getState().moveClipToTrack(clipId, id, start);
  return;
}
if (clientY >= contRect.bottom) {
  const id = useProjectStore.getState().addVideoTrack("bottom");
  useProjectStore.getState().moveClipToTrack(clipId, id, start);
  return;
}
// ...resto: mapeo normal a un carril existente
```
> Da un pequeño margen (p. ej. 6px) si quieres una "zona de hueco" más generosa, pero con
> las `GapDrop` de h-2 visibles, salir del contenedor por arriba/abajo es suficiente.
> `moveClipToTrack` rechaza solapes; aquí la pista nueva está vacía, así que siempre entra.

- [ ] **Step 4: Typecheck + tests + Commit**

`cd client && npx tsc --noEmit` → limpio. `cd client && npx vitest run` → PASS.
```bash
git add client/src/features/timeline/Timeline.tsx client/src/features/timeline/TrackRow.tsx
git commit -m "feat(multipista): botón + en la columna izquierda y crear pista soltando en un hueco"
```

---

## Task 3: Reordenar pistas arrastrando la cabecera

**Files:** `client/src/features/timeline/TrackRow.tsx`, `client/src/features/timeline/Timeline.tsx`

DnD nativo con un tipo propio `application/x-video-track-index`.

- [ ] **Step 1: La cabecera de las pistas de vídeo es arrastrable**

Añade props opcionales a `TrackRowProps`:
```ts
  /** Índice de pista para reordenar por arrastre de la cabecera (solo vídeo). */
  trackIndex?: number;
  onReorder?: (fromIndex: number, toIndex: number) => void;
```
Si `trackIndex !== undefined`, la cabecera (`w-20`) es `draggable` y arrastra el índice; y es zona de drop que, al recibir otra cabecera, llama `onReorder(from, this.trackIndex)`:
```tsx
<div
  className="w-20 shrink-0 ... cursor-grab"
  draggable={trackIndex !== undefined}
  onDragStart={trackIndex !== undefined ? (e) => {
    e.dataTransfer.setData("application/x-video-track-index", String(trackIndex));
    e.dataTransfer.effectAllowed = "move";
  } : undefined}
  onDragOver={trackIndex !== undefined ? (e) => {
    if (e.dataTransfer.types.includes("application/x-video-track-index")) e.preventDefault();
  } : undefined}
  onDrop={trackIndex !== undefined ? (e) => {
    const from = Number(e.dataTransfer.getData("application/x-video-track-index"));
    if (!Number.isNaN(from) && onReorder) onReorder(from, trackIndex);
  } : undefined}
>
  <span className="truncate">{title}</span>
  {onRemoveTrack && (<button ...>×</button>)}
</div>
```
(Mantén el `flex items-center justify-between` de la cabecera de Task de la Fase 4.)

- [ ] **Step 2: Timeline pasa `trackIndex` y `onReorder` a cada carril de vídeo**

```tsx
trackIndex={i}
onReorder={(from, to) => useProjectStore.getState().reorderVideoTrack(from, to)}
```
(`i` es el índice REAL de la pista en `videoTracks`, no el visual.)

- [ ] **Step 3: Typecheck + tests + Commit**

`cd client && npx tsc --noEmit` → limpio. `cd client && npx vitest run` → PASS.
```bash
git add client/src/features/timeline/Timeline.tsx client/src/features/timeline/TrackRow.tsx
git commit -m "feat(multipista): reordenar pistas de vídeo arrastrando su cabecera"
```

> Si el DnD de la cabecera entra en conflicto con el arrastre de bloques (pointer) o con
> `onDropClip`, repórtalo: la cabecera (`w-20`) está separada del área de bloques, así que
> no deberían interferir. Usa un tipo de dataTransfer propio para no mezclar con clips.

---

## Task 4: Verificación

- [ ] **Step 1:** suite + typecheck globales verdes.
- [ ] **Step 2: Smoke del usuario:** "+" izquierda añade pista; arrastrar clip de Medios a un hueco arriba/abajo crea pista; arrastrar un clip existente fuera (arriba/abajo) crea pista; arrastrar la cabecera reordena z-order (se refleja en preview y export); una sola pista sigue igual.
- [ ] **Step 3:** actualizar TODO.md + push.

---

## Riesgos / notas

- **`videoLanesRef.children` deben ser SOLO carriles** para que el mapeo Y→carril siga
  correcto: las franjas `GapDrop` van FUERA de ese div (hermanas).
- **Crear pista abajo (`"bottom"`, índice 0)** convierte el clip en la nueva base (reloj/blur
  del preview). Es coherente con "índice 0 = base"; el usuario puede reordenar. Documentar.
- **Reorder por DnD de cabecera** es nativo y aislado del arrastre de bloques (tipos de
  dataTransfer distintos); bajo riesgo. Diferible si diera guerra.
- Fundido/− al exportar y el resto del pipeline ya respetan el orden del array de pistas.
