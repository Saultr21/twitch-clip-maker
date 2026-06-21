# Capas "media" — M3: Preview compositado por orden de capas (opción A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Que el lienzo de vista previa respete el ORDEN DE CAPAS (z) para vídeo, imagen y texto a la vez (un texto puede quedar DETRÁS de un vídeo, una imagen ENTRE dos vídeos, etc.), igual que ya hace el export. Hoy los vídeos son HTML pero imagen y texto los pinta Konva, que va SIEMPRE encima de todos los vídeos → z incorrecto en el preview.

**Arquitectura (opción A — aprobada):** TODO lo visual se pinta en HTML/CSS apilado por z-index = índice de la capa en `project.tracks.layers` (0 = fondo). Konva queda como capa TRANSPARENTE por encima, solo para asas/transformador/recorte/guías (interacción), nunca pinta píxeles visibles. Los nodos Konva derivan su geometría del MISMO modelo y con las MISMAS fórmulas que el HTML, así que coinciden.

**Tech:** React, react-konva, Zustand, CSS transforms.

---

## Estado actual
- `PreviewCanvas.tsx`: pinta un `<video>` por capa de vídeo (`TrackVideo`, `pointer-events:none`), `zIndex` = índice entre las capas-con-vídeo. Imagen/texto NO se pintan aquí.
- `OverlayLayer.tsx` (un `<Stage>` Konva absoluto sobre todo el lienzo): `ImageNode` (pinta la imagen real + asas), `TextNode` (pinta el texto real + asas), `VideoFrameNode` (Rect TRANSPARENTE de selección/zoom del vídeo), `SubtitlesLayer`, `CropOverlay`, guías. Por eso imagen/texto van siempre por encima.
- Geometría compartida: `visibleRect(width,height,info,zoom,crop)` en `preview/trackVideo.ts`.
- TRAMPA CRÍTICA: un selector Zustand que devuelve un array nuevo (p. ej. `imageItems(s.project)`) provoca bucle infinito en `useSyncExternalStore` (pantalla en negro). SIEMPRE suscribirse a `s.project.tracks.layers` (ref estable) y derivar con `useMemo`.

## Diseño objetivo

### PreviewCanvas: pintar TODO en HTML por capa, en z-order
Iterar `project.tracks.layers` (índice = z, 0 = fondo → zIndex CSS bajo). Por cada capa, hallar el elemento ACTIVO en el playhead (a lo sumo uno, porque no hay solape temporal dentro de la capa) y pintarlo en HTML con `zIndex = layerIndex` y `pointer-events:none`:
- **video** → `<video>` (igual que `TrackVideo` hoy) pero con `zIndex = layerIndex` (no el índice filtrado). Mantener el registro en el motor de reproducción (`registerOverlayVideo`) para sync; la capa con el vídeo de índice más bajo que sea "base" sigue usando `videoRef`. OJO: la "base" para `videoRef`/sync debe ser determinista — usar el PRIMER clip de vídeo activo en orden de capas.
- **image** → `<img src="/assets/...">` posicionada con la MISMA fórmula que `ImageNode`: contenedor `position:absolute; left:x*W; top:y*H; width:w*W; height:h*H; transform: translate(-50%,-50%) rotate(rot)`; `opacity`; recorte vía `object-fit`/`clip-path` equivalente al `crop` normalizado (x,y,w,h sobre la imagen natural). `pointer-events:none`.
- **text** → `<div>` con `transform: translate(-50%,-50%) rotate(rot)`, `left:x*W; top:y*H`, `font-family`, `font-size: fontSize*H`, `color: fill`, `-webkit-text-stroke`/text-shadow equivalentes a `stroke`/`strokeWidth*H`/`shadow`, `opacity`. `white-space:nowrap`. `pointer-events:none`.

El velo (boxShadow) y el `<video>` de blur de fondo se mantienen. El estado vacío (sin clips) se mantiene.

### OverlayLayer (Konva): solo interacción, transparente
- `VideoFrameNode`: igual (ya es un Rect transparente). Mantener.
- `ImageNode`: dejar de pintar la imagen visible — el `KonvaImage` se vuelve invisible (`opacity={0}` o `fill`/imagen presente solo para medir y transformar) PERO conserva exactamente la misma geometría (x,y,width,height,offset,rotation, crop) para que el `Transformer` y los gestos (drag/transform/crop) sigan funcionando. La imagen visible la pinta el HTML. Alternativa equivalente: sustituir `KonvaImage` por un `Rect` transparente del mismo tamaño/posición/rotación (como `VideoFrameNode`) — preferible si simplifica; conservar el comportamiento de `onDragMove/onTransformEnd/updateImage` idéntico.
- `TextNode`: igual idea — el texto visible lo pinta el HTML; el nodo Konva queda invisible pero conserva tamaño (para el offset centrado y el `Transformer`). Se puede mantener un `KonvaText` con `fill`/`stroke`/`shadow` transparentes (sigue midiendo su tamaño para `offset` y asas) y dejar de mostrar color. Conservar `updateText` en los gestos.
- `SubtitlesLayer`, `CropOverlay`, guías: sin cambios (los subtítulos pueden seguir en Konva por encima; el usuario dijo que subtítulos van aparte y al fondo lógico, pero visualmente los subtítulos se pintan al frente como hasta ahora — mantener).
- IMPORTANTE: las asas/Transformer van por encima de TODO el HTML (el Stage está sobre el lienzo) — correcto, las asas deben verse siempre.

### Selección por clic
Hoy el clic lo capturan los nodos Konva (los `<video>`/`<img>`/`<div>` HTML tienen `pointer-events:none`). Mantener: Konva sigue siendo la capa de interacción con sus Rect/nodos transparentes en la posición de cada elemento. Para imagen/texto, el nodo Konva transparente debe cubrir el área del elemento para poder seleccionarlo. Verificar que se puede seleccionar imagen y texto que queden visualmente DETRÁS de un vídeo (el nodo Konva está por encima en el Stage, así que el clic los alcanza aunque el píxel HTML esté tapado — comportamiento aceptable y útil).

## Tasks (TDD donde aplique; el grueso es visual → verificación por typecheck + tests existentes + e2e manual)

### Task 1: Geometría HTML compartida
- Crear helpers puros en `preview/` (p. ej. `overlayCss.ts`): `imageOverlayStyle(overlay, W, H)` y `textOverlayStyle(overlay, W, H)` que devuelvan los `CSSProperties` (incluida la conversión de `crop` a `object-fit`/`clip-path` y de `stroke/shadow` a CSS). Tests unitarios de las fórmulas (p. ej. centro, rotación, tamaño en px, clip-path del crop).

### Task 2: PreviewCanvas pinta imagen y texto en HTML por z
- Iterar capas; por capa, elemento activo; render HTML con `zIndex=layerIndex`, `pointer-events:none`, usando los helpers de Task 1. Vídeo: `zIndex=layerIndex`. Mantener el patrón de ref estable + `useMemo`. No romper el motor de reproducción/blur/velo/estado vacío.

### Task 3: OverlayLayer deja de pintar imagen/texto visibles
- Convertir `ImageNode`/`TextNode` a interacción transparente (sin pintar píxeles), conservando gestos y `Transformer`. `VideoFrameNode`/subtítulos/crop/guías sin cambios.

### Task 4: Verificación
- `shared`+`client`+`server` tsc limpio; `client` y `server` vitest verdes. (No hay test visual automatizado del z; el export ya tiene e2e de orden.) Actualizar TODO.md.

## Riesgos
- **Doble render**: si Konva sigue pintando imagen/texto Y el HTML también → duplicado. Asegurar que Konva NO pinta píxeles visibles.
- **Desalineación HTML/Konva**: ambos deben usar EXACTAMENTE las mismas fórmulas (centro como origen, rotación en grados, tamaños en px = normalizado×W/H). El texto puede tener leve diferencia de métrica de fuente entre Konva y HTML; aceptable para las asas.
- **Bucle infinito Zustand**: ref estable + `useMemo` siempre.
- **z del vídeo**: usar el índice REAL de capa, no el índice filtrado entre capas-con-vídeo, para que se intercale con imagen/texto.
- **base/videoRef**: elegir de forma determinista el vídeo "base" (primer clip de vídeo activo por orden de capas) para no romper el sync de reproducción.
