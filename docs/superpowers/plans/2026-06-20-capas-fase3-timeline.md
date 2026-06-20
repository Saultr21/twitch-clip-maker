# Capas unificadas — Fase 3: Timeline unificado (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que el timeline muestre **un carril por capa** (vídeo/imagen/texto) en el orden de `tracks.layers` (arriba = más al frente), con controles para **añadir** carriles de cada tipo y **reordenar** cualquier carril (cambia el z, intercala tipos). Dentro de un carril, los elementos no se solapan en el tiempo. Audio y subtítulos quedan como carriles aparte abajo.

**Architecture:** Generaliza las ops de pista de vídeo a **cualquier capa** en el store (añadir/borrar/reordenar capa de cualquier tipo; mover elemento entre capas del MISMO tipo; no-solape por carril para imagen/texto igual que vídeo). El `Timeline` renderiza los carriles de `tracks.layers` (invertidos: índice alto arriba) como `TrackRow` (que ya es genérica por `BlockDescriptor.kind`), más los carriles de Audio y Subtítulos como hasta ahora. El reordenar por arrastre de cabecera y el "+" pasan a operar sobre capas de cualquier tipo.

**Spec:** `docs/superpowers/specs/2026-06-20-capas-unificadas-design.md` (§5, §6, DEC-021/022). Fases 1-2 hechas.

---

## Contexto actual

- Store (`projectStore.ts`): ops de vídeo sobre capas (`addVideoTrack(position)`,
  `removeVideoTrack(id)`, `reorderVideoTrack(from,to)` sobre la sublista de vídeo,
  `moveClipToTrack`, `addVideoClipToTrack`); ops de imagen/texto sobre la única capa de su
  tipo (`addImage/addText/updateImage/updateText/moveOverlay/trimOverlay`). Selectores en
  `@clipforge/shared`.
- `Timeline.tsx`: renderiza los carriles de vídeo (de `videoLayers`, invertidos) dentro de
  `<div ref={videoLanesRef}>` con `+`/`×`/reorder de cabecera/gap-drop/ghost; y, aparte,
  carriles `Texto`, `Imagen` (de `textItems`/`imageItems`, auto-apilados con `assignLanes`),
  `Música`, `Subtítulos`.
- `TrackRow.tsx`: genérica; bloques con `BlockDescriptor.kind`; arrastre move/trim por
  pointer; `onMoveEnd(id,clientY,start)` (cross-lane), `onDropClip`, `onAddTrack`,
  `onRemoveTrack`, `trackIndex`+`onReorder` (DnD cabecera), `onMoveDrag`/`highlight` (ghost).

---

## Task 1: Store — ops genéricas de capa + no-solape imagen/texto

**Files:** `client/src/stores/projectStore.ts`, `client/src/stores/projectStore.test.ts`

- [ ] **Step 1: Tests**
  - `addImageLayer()`/`addTextLayer()` añaden una capa vacía de ese tipo (al frente) y devuelven id.
  - `reorderLayer(fromIndex, toIndex)` reordena CUALQUIER capa en `tracks.layers` (índices del array total).
  - `removeLayer(id)` borra una capa cualquiera; nunca deja 0 capas (si era la última, deja una de vídeo vacía).
  - `moveElementToLayer(elementId, destLayerId, newStart)` mueve un elemento a otra capa **del mismo tipo** (rechaza si el destino es de otro tipo o si solaparía).
  - Añadir/mover un texto/imagen respeta no-solape dentro de su capa (cae a hueco libre).

- [ ] **Step 2-4:** Implementar:
  - `addImageLayer/addTextLayer`: `d.tracks.layers.push(createImageLayer()/createTextLayer())`, return id. (Generaliza con `addVideoTrack` que ya existe; mantén `addVideoTrack` o añade `addLayer(kind)`.)
  - `reorderLayer(fromIndex,toIndex)`: como `reorderVideoTrack` pero sobre `tracks.layers` directo (índices del array total, clamp, early-return si igual).
  - `removeLayer(id)`: `splice` la capa; si quedan 0, push `createVideoLayer()`.
  - `moveElementToLayer`: localizar el elemento (vídeo/imagen/texto) y su capa origen; encontrar la capa destino; si distinto `kind` → return; comprobar no-solape en destino (`hasOverlap` para vídeo; equivalente por tiempo para imagen/texto); sacar de origen, insertar en destino ordenado.
  - `addImage`/`addText`/`moveOverlay`(text/image): aplicar no-solape dentro de la capa (si el `start` deseado solapa, caer al final del último item).
  - Mantén `reorderVideoTrack`/`moveClipToTrack`/`addVideoTrack` como envoltorios o sustitúyelos por las versiones genéricas (ajusta los llamantes en Timeline en Task 2).
  - Verde + commit (`feat(capas): ops del store genéricas por capa + no-solape por carril`).

---

## Task 2: Timeline unificado

**Files:** `client/src/features/timeline/Timeline.tsx`, `client/src/features/timeline/TrackRow.tsx`

- [ ] **Step 1:** Sustituir el bloque de carriles de vídeo + los carriles separados de
  Texto/Imagen por un **único bloque de carriles de capa** que recorre `project.tracks.layers`
  invertido (índice alto arriba = frente). Por cada capa, una `TrackRow` con:
  - `blocks` = los elementos de la capa como `BlockDescriptor` (vídeo: clips con waveform;
    imagen: items con su `fileName`; texto: items con su `content`).
  - `title` = etiqueta por tipo + índice (p. ej. "Vídeo 2", "Texto", "Imagen 3").
  - `onMove`/`onTrim` que llaman a la op correcta según el `kind` de la capa.
  - `onDropClip` (solo capas de vídeo) → `addVideoClipToTrack`.
  - `onRemoveTrack` → `removeLayer(layer.id)`.
  - `trackIndex` = índice REAL en `tracks.layers`; `onReorder` → `reorderLayer`.
  - `onMoveEnd` (cross-lane) → mover el elemento a la capa del mismo tipo bajo el cursor
    (generaliza `handleVideoMoveEnd` usando `moveElementToLayer`; solo permite soltar en
    capas del MISMO tipo; en hueco arriba/abajo crea una capa nueva del MISMO tipo del
    elemento arrastrado).
  - `onMoveDrag`/`highlight` (ghost) como ahora.
- [ ] **Step 2:** Controles de añadir: tres botones "+ Vídeo / + Imagen / + Texto" (en la
  barra del timeline o en una mini-cabecera del bloque de capas) → `addVideoTrack("top")` /
  `addImageLayer()` / `addTextLayer()`.
- [ ] **Step 3:** Mantener **Música** y **Subtítulos** como carriles aparte, debajo del
  bloque de capas (sin cambios).
- [ ] **Step 4:** Typecheck + tests del cliente → verde. Commit
  (`feat(capas): timeline con un carril por capa (vídeo/imagen/texto) reordenable`).

> Nota: la `TrackRow` ya es genérica; el grueso es cablear las ops por `kind` y unificar el
> render. El `assignLanes` (auto-apilado de texto/imagen) deja de usarse para esos tipos:
> ahora cada capa es un carril propio (no-solape por carril). Audio/Subtítulos siguen con
> `assignLanes`.

---

## Task 3: Verificación

- [ ] Suite + typecheck globales verdes. Smoke (al final del épico): añadir capas de cada
  tipo, reordenarlas (cambia z en preview tras Fase 4 / ya en export), mover elementos
  entre capas del mismo tipo, no-solape por carril. Actualizar TODO.md + push.

---

## Riesgos / notas

- **No-solape para imagen/texto** cambia el comportamiento actual (auto-apilado). Es lo
  acordado (DEC-021). Proyectos migrados con imágenes/textos solapados en una sola capa:
  el render del carril los mostrará solapados (legacy); los NUEVOS adds/moves respetan el
  no-solape. (Opcional futuro: trocear en la migración.)
- **El z visible** de imagen/texto entre vídeos NO se verá en el preview hasta la Fase 4
  (el preview aún compone imagen/texto siempre encima). El export (Fase 2) sí lo respeta.
  Documentar este estado intermedio.
- `TrackRow` genérica: cuidado de no romper los carriles de Audio/Subtítulos (siguen igual).
