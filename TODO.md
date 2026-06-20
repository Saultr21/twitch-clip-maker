# TODO — VideoForge (editor de vídeo local; antes ClipForge)

> Last updated: 2026-06-20 23:15
> Current phase: development
> Overall progress: Hitos 1–4 completos + multipista completa + gestión de pistas (4b) en master + migración a modelo de capas (layers) + export por orden de capas + timeline unificado de capas completados

## In Progress
- [ ] `TASK-015` Capas unificadas (vídeo+imagen+texto en un z-stack) — épico en curso
  - Spec: `docs/superpowers/specs/2026-06-20-capas-unificadas-design.md`
  - **Fase 1 (modelo `layers[]` + migración v3) — HECHA**: `tracks.layers: Layer[]` (capas tipadas), `migrateLayers` v2→v3 (encadenada tras `migrateProject`), store/lectores/tests migrados vía selectores. Comportamiento preservado (una capa imagen + una texto; composición vídeo→imagen→texto). 263 tests verdes + typecheck limpio. Plan: `docs/superpowers/plans/2026-06-20-capas-fase1-modelo.md`.
  - **Fase 2 (export por orden de capas) — HECHA (2026-06-20)**: `buildFilterGraph` reescrito — modelo concat-base + overlays fijos → fondo único `[bg]` de duración total + overlays temporizados en orden de `tracks.layers`. Cualquier z-stack (texto detrás de un vídeo, imagen entre vídeos, etc.) ahora funciona en el export. clipTransition conservado en la primera capa de vídeo. Blur derivado del primer clip activo de la primera capa (negro en huecos). Audio = todos los clips de todas las capas con adelay+amix. Tests de equivalencia v2, orden inverso, imagen entre vídeos, regresión de colisión de etiquetas. E2e con capas intercaladas `[video, text, video, image]` verificado con ffprobe (1 vídeo + 1 audio). 150 tests server verdes, typecheck limpio. Plan: `docs/superpowers/plans/2026-06-20-capas-fase2-export.md`. Commit: `c650edc`.
  - **Fase 3 (timeline unificado) — HECHA (2026-06-20)**: Timeline reescrito sobre `tracks.layers` — un carril por capa (vídeo, imagen, texto) con etiqueta de tipo, botones `addVideoLayer`/`addImageLayer`/`addTextLayer`, arrastre de clips entre capas del mismo tipo via `moveElementToLayer` (rechaza tipo distinto y solapes), reordenado de capas con DnD nativo (`reorderLayer`), y eliminación de capas con `removeLayer` (guarda mínimo una de vídeo). 107 client + 25 shared + 150 server tests verdes, typecheck limpio en los 3 paquetes. Plan: `docs/superpowers/plans/2026-06-20-capas-fase3-timeline.md`.
  - **Pendiente**: Fase 4 (preview rearquitecturado opción A — diseño propio), Fase 5 (pulido).

## Ajustes UX del multipista (2026-06-20) — hecho
- [x] Botón **+** movido a la cabecera de cada pista de vídeo (no en fila aparte)
- [x] Fix lienzo: el clip seleccionado se dibuja encima (recibe el arrastre aunque otro lo tape) y los clips que entran en pista superior lo hacen como **PiP a media escala/centrado** (antes a frame completo → no se podían mover)
- [x] **Clip "fantasma"** que sigue al cursor + resalte del carril destino al arrastrar (feedback visual)
  - Files: `Timeline.tsx`, `TrackRow.tsx`, `OverlayLayer.tsx`, `projectStore.ts`. 257 tests verdes. Pendiente smoke test del usuario.
  - Minors de pulido pendientes (no bloqueantes): DRY del mapeo Y→carril (`laneAtClientY`/`handleVideoMoveEnd`), clamp del ghost al borde del viewport.

## Gestión de pistas en el timeline (Fase 4b, 2026-06-20) — hecha
- [x] Botón **+** compacto en la columna de etiquetas (izquierda) para añadir pista de vídeo (sustituye al "+ Pista" de la barra)
- [x] Crear pista soltando un clip en un **hueco** por encima/debajo de los carriles: vale para clips de Medios (DnD) y para clips existentes (arrastre por pointer, vía ramas de hueco en `handleVideoMoveEnd`)
- [x] **Reordenar pistas (z-order) arrastrando la cabecera** del carril (DnD nativo con tipo propio `application/x-video-track-index`, aislado del resto)
- [x] Store: `addVideoTrack(position)` devuelve id, `reorderVideoTrack(from,to)`
  - Plan: `docs/superpowers/plans/2026-06-20-multipista-fase4b-gestion-pistas.md`. Revisión por subagentes; 257 tests verdes (21+92+144) + typecheck limpio. Pendiente smoke test del usuario.

## Recorte directo (2026-06-19) — hecho
- [x] UX de recorte de vídeo/imagen rehecha (commit 98adfe8, directo a master)
  - Botones ✓/✕ discretos en el lienzo + etiqueta "Recortando" (sin depender solo de Enter/Esc)
  - El recuadro abraza el elemento VISIBLE y los recortes se componen de forma acumulativa (`composeCrop` puro + tests)
  - El box de selección del vídeo sigue al recorte aplicado, no al frame completo (arrastre/zoom/imán ajustados al offset del crop)
  - Render del `<video>` con estructura estable (wrapper único): aplicar recorte ya no funde a negro
  - Fix de `boundBoxFunc` para el offset del stage (`STAGE_MARGIN`): el rect ya no se descontrola al redimensionar
  - Files: `client/src/features/preview/{CropOverlay,OverlayLayer,PreviewCanvas}.tsx`, `client/src/lib/cropBox.ts(.test)`
  - Verificado: 81 tests client verdes + typecheck limpio + smoke test del usuario OK

## Descarga multiplataforma (2026-06-19) — hecha
- [x] Allowlist de plataformas (Twitch, YouTube, TikTok, Instagram, X) vía `matchPlatform` (`server/src/lib/supportedUrl.ts`), sustituye la validación solo-Twitch; quita la regex `/clip/` (acepta también VODs y canal de Twitch)
- [x] Selector de formato `bv*+ba/b` con merge a mp4 en `download.ts` (sube calidad; arregla el techo de 720p en YouTube). `--no-playlist` evita descargar canales/playlists enteras
- [x] Textos multiplataforma en Medios, preview y tour de bienvenida
- [x] Solo contenido público (sin cookies/PO tokens, por decisión de alcance). Spec: `docs/superpowers/specs/2026-06-19-descarga-multiplataforma-design.md`; Plan: `docs/superpowers/plans/2026-06-19-descarga-multiplataforma.md`
- Verificado: 221 tests verdes (client 71, server 134, shared 16) + typecheck limpio. Pendiente smoke test del usuario con URLs reales de YouTube/TikTok

## Migración a modelo de capas (2026-06-20) — COMPLETA (Tasks 1-6)
- [x] **Task 1**: Modelo `tracks.layers: Layer[]` en `@clipforge/shared` (v3), selectores `videoLayers/imageLayers/textLayers/allVideoClips/imageItems/textItems`, factories `createVideoLayer/ImageLayer/TextLayer`, `createEmptyProject` devuelve v3
- [x] **Task 2**: `migrateLayers` v2→v3 (aún no aplicada al servidor; pendiente Task 3)
- [x] **Task 3**: `migrateLayers` aplicada en `server/src/routes/projects.ts` al cargar proyectos
- [x] **Task 4 (2026-06-20)**: Store (`projectStore.ts`) reescrito sobre `layers` — helpers internos `baseVideoLayer/findClipCtx/imageLayerFor/textLayerFor/findImage/findText`, ops de multitrack sobre el array `tracks.layers`; comportamiento preservado (commit 585d92f)
- [x] **Task 5 (2026-06-20)**: Todos los lectores del cliente y servidor migrados a los selectores: `usePlaybackEngine`, `Timeline`, `OverlayLayer`, `PreviewCanvas`, `PropertiesPanel`, `CropOverlay`, `MediaPanel`, `ExportDialog`, `SubtitlesPanel`, `ToolRail`, `shortcuts.ts`, `timeline.ts`, `filterGraph.ts` (commit 6105e18)
- [x] **Task 6 (2026-06-20)**: Tests actualizados al modelo de capas: `projectStore.test.ts`, `timeline.test.ts`, `shortcuts.test.ts`, `filterGraph.test.ts`, `multitrackExport.e2e.test.ts` — helpers `addText/addImage/addVideoLayer` en filterGraph.test.ts (commit 7269a0f)
- **Resultado**: 262 tests verdes (25 shared + 92 client + 145 server), typecheck limpio en los 3 paquetes, sin cambio de comportamiento en runtime
- Plan: `docs/superpowers/plans/2026-06-20-capas-fase1-modelo.md` (Tasks 1-6 de 7)
- **Pendiente (Task 7)**: limpiar exports de `VideoTrack`/`createVideoTrack` ya sin uso en `@clipforge/shared` y borrar el campo `tracks.video[]` del esquema de migración antiguo (cleanup final de fase 1)

## Up Next
- Task 7 de migración de capas: limpiar `VideoTrack`/`createVideoTrack` obsoletos en `shared/src/project.ts`
- Smoke test del usuario del export por GPU (NVENC) y del waveform en uso real
- Se trabaja directamente en `master`, sin ramas ni PRs (petición del usuario)

## Mejoras de rendimiento y robustez (2026-06-13, sesión extra) — hechas
- [x] Aceleración GPU de subtítulos: whisper.cpp CUDA (cuBLAS) con autodetección NVIDIA y fallback CPU, multihilo + flash attention, warmup PTX-JIT en setup; selector de modelo small/medium
- [x] Export por GPU NVENC (h264_nvenc) con fallback transparente a CPU; ~8,6x más rápido medido en RTX 5070 Ti
- [x] Karaoke en tiempo real: playhead avanza por rAF leyendo video.currentTime (60fps) en vez del evento timeupdate (~4/s)
- [x] Waveform de audio en los carriles Vídeo y Música (endpoint con picos cacheados en data/waveforms + render canvas)
- [x] Restauración de sesión al arrancar (último proyecto en localStorage) + flush en visibilitychange y aviso beforeunload
- [x] Renombrar proyecto mueve el archivo (previousName) en vez de dejar un .json huérfano

## Mejoras de Pendiente.txt (post-Hito 4) — TODAS hechas
- [x] Sliders con campo numérico editable a mano (2026-06-13)
- [x] Fondo de proyecto color/blur en preview y export (2026-06-13)
- [x] Marcas de agua reutilizables: guardar logo + insertar en esquina (2026-06-13)
- [x] Fondo de IMAGEN (export con input en bucle + split, preview y UI) (2026-06-13)
- [x] Subtítulos automáticos karaoke (whisper.cpp + ASS/libass) (2026-06-13)
  - Spec: `docs/superpowers/specs/2026-06-13-subtitulos-automaticos-design.md`; Plan: `docs/superpowers/plans/2026-06-13-subtitulos-automaticos.md` (13/13 tareas)
  - whisper.cpp auto-descargado (zip+bsdtar del sistema, modelo base), transcripción con SSE y mapeo de tiempos por trim/speed (TDD), generador .ass karaoke discreto (TDD), preview Konva, quemado con filtro ass de libass
  - Verificado e2e: transcripción real (UTF-8 correcto) + export con subtítulos → MP4 1080x1920 válido; 162 tests verdes

## Hardening (2026-06-14) — hechas
- [x] Poda de jobs de export en memoria (cap 20, descarta terminados antiguos) y de la caché de waveform al borrar un clip
- [x] Subidas con códec no-web (mov/mkv/avi/HEVC) se transcodifican a mp4 H.264 reproducible (NVENC con fallback CPU); mp4/h264 y webm se conservan
- [x] Renombrado de app a VideoForge (marca visible); subir vídeos del escritorio (botón + arrastrar)

## Hecho (2026-06-14, cont.)
- [x] Eliminar silencios: detección con silencedetect + recorte por tramos con voz (ripple)
- [x] UX: estado vacío guiado en la preview sin vídeo + textos de Medios

## Hecho (2026-06-14, cont. 2)
- [x] Auto-reframe (seguir cara) simplificado: MediaPipe detecta la cara → parte el clip en segmentos con encuadre estático (sin keyframes), reutilizando split+zoom. Verificado e2e (25 segmentos en clip con caras)
- [x] Transiciones: fundido de entrada/salida del vídeo y audio al exportar (fade/afade)
- [x] Subtítulos: filtro de palabrotas (Censurar) + animación pop de la palabra activa (preview + ASS)
- [x] Export extra: fotograma de portada (PNG) y GIF del montaje

## Opcional — hecho (2026-06-14)
- [x] Soltar un vídeo en cualquier parte de la app para subir (GlobalDropZone)
- [x] Mini-tour de bienvenida (primer arranque)
- [x] Transición entre clips: fundido a negro en los límites (gated)

## Opcional — deferido a propósito (no se rushea)
- [ ] Cola de varios exports — poco valor en app de un usuario; montaje UI no trivial
- [ ] Empaquetar MediaPipe offline — marginal (el navegador ya cachea el CDN; el 1.er uso necesita red como el resto de herramientas)
- [ ] Auto-reframe v2: paneo SUAVE con keyframes — proyecto de arquitectura (keyframes en modelo + preview + export); requiere diseño propio, no un batch
- [ ] Transiciones v2: crossfade real (xfade) entre clips — reescribe el concat (lo más central/testeado); riesgo alto

## Pendiente — features grandes (pedidas por el usuario 2026-06-19, requieren diseño propio)
- [ ] `TASK-010` — Zoom de la zona de trabajo (preview/lienzo)
  - Poder acercar/alejar el lienzo del editor para trabajar con precisión (no confundir con el `zoom.scale` del clip, que reencuadra el vídeo)
  - Notas: afecta al cálculo de tamaño del lienzo en `PreviewCanvas` y a las coordenadas del Stage de Konva (`OverlayLayer`); pan + reset; atajos rueda/Ctrl
  - Priority: medium
- [ ] `TASK-011` — Botón de Transiciones + apartado de animaciones/transiciones
  - Un **botón de Transiciones** en la UI que permita añadir transiciones (desvanecer, fundido, crossfade, etc.) ENTRE clips, al inicio y al final (petición usuario 2026-06-20)
  - Notas: se solapa con lo ya deferido (fade in/out al export ya existe; "Transiciones v2: crossfade real (xfade)" reescribe el concat → riesgo alto). Requiere modelo de transiciones en el proyecto + UI de selección/colocación + preview + export FFmpeg (xfade/acrossfade)
  - Priority: medium
- [ ] `TASK-013` — Botón de Efectos (capa de efectos sobre el vídeo)
  - Un **botón de Efectos** con, p. ej.: **blur a zonas** del vídeo (difuminar una región), **censurar/pixelar partes** (mosaico sobre una zona), **añadir formas** (rectángulos, círculos, flechas…), y posibles más (viñeta, etc.) — petición usuario 2026-06-20
  - Notas: feature grande. Probablemente un nuevo tipo de overlay en el modelo (región normalizada + tipo de efecto + ventana de tiempo), render en preview (Konva) y export FFmpeg (boxblur/crop+overlay para zonas, drawbox/geq o delogo/pixelize para censura, drawbox/formas). Requiere diseño propio (brainstorming + spec + plan por fases)
  - Priority: medium
- [x] `TASK-012` — Multipista: varias líneas de medios (vídeo/imagen superpuestos, PiP) — COMPLETA (5/5 fases, 2026-06-20)
  - Picture-in-picture: un vídeo encima de otro, una imagen encima de otra, etc.
  - Spec: `docs/superpowers/specs/2026-06-20-multipista-video-design.md` (modelo `VideoTrack[]`, DEC-010..013, 5 fases)
  - **Fase 1 (modelo + migración) — HECHA (2026-06-20)**: `tracks.video` → `VideoTrack[]`, `opacity` por clip, esquema v1→v2 con `migrateProject` (aplicada al cargar en el servidor), todos los lectores y el store sobre la pista base (refactor que preserva comportamiento). 239 tests verdes + typecheck limpio. Plan: `docs/superpowers/plans/2026-06-20-multipista-fase1-modelo.md`. Revisión por subagentes (spec+calidad) por unidad + revisión final holística OK.
  - **Fase 2 (export multipista) — HECHA (2026-06-20)**: `filterGraph` compositа las pistas superiores como overlays de vídeo sobre la base (`[vlay${i}]`, z-order, ventana de tiempo, recorte/escala/color/opacidad) y mezcla el audio de todas las capas (voz = base + capas; música duckeada bajo la voz). No-op en proyectos de una pista (salida idéntica). Verificado con tests de string + **e2e con ffmpeg real** (render de 2 pistas → MP4 con 1 vídeo + 1 audio vía ffprobe). 144 tests server verdes. Plan: `docs/superpowers/plans/2026-06-20-multipista-fase2-export.md`. Bug corregido en review: colisión de etiqueta `[ov]` entre capas de vídeo e imágenes.
  - **Fase 3 (preview compositado) — HECHA (2026-06-20)**: un `<video>` por pista en z-order con opacidad; pista base sin cambios (`videoRef`, reloj, blur, volumen), pistas superiores como esclavos registrados en un `Map<trackId,HTMLVideoElement>` y sincronizados al playhead por el motor (deriva corregida con `SYNC_TOLERANCE`); recuadro de selección Konva por clip activo de cada pista. Ops del store `addVideoTrack`/`removeVideoTrack`/`moveClipToTrack` + helper puro `visibleRect`. No-op en proyectos de una pista (sin regresión). 87 tests client + 21 shared + 144 server verdes, typecheck limpio. Plan: `docs/superpowers/plans/2026-06-20-multipista-fase3-preview.md`. Fix en review: ref-callback del `<video>` estabilizado.
  - **Verificación visual pendiente**: el PiP se ve completo al terminar la Fase 4 (UI para crear pistas/arrastrar). De momento se puede probar por consola: `useProjectStore.getState().addVideoTrack()` + `moveClipToTrack(clipId, destTrackId, t)`.
  - **Fase 4 (timeline multipista) — HECHA (2026-06-20)**: un carril por pista de vídeo (arriba = capa superior, base abajo), botón **+ Pista**, **×** para quitar pistas no base, soltar clips de Medios en una pista concreta (`addVideoClipToTrack`), y arrastrar clips **entre** pistas (mapeo de la Y del puntero al carril midiendo el DOM; `moveClipToTrack` rechaza solapes). **El PiP ya es usable de punta a punta desde la UI.** No-op/idéntico con una sola pista. 89 tests client + 21 shared + 144 server verdes, typecheck limpio. Plan: `docs/superpowers/plans/2026-06-20-multipista-fase4-timeline.md`.
  - **Fase 5 (opacidad por clip) — HECHA (2026-06-20)**: slider de opacidad en el panel de Propiedades cableado a `updateVideoClip({ opacity })`; además se corrigió el lookup del clip para buscar en CUALQUIER pista (antes solo la base, así que no se podían editar las propiedades de clips de capas superiores). 89 tests client verdes, typecheck limpio.
  - **`TASK-012` COMPLETA (5/5 fases)**: picture-in-picture / multipista funcional de punta a punta (modelo, export, preview, timeline, opacidad). Pendientes menores anotados: marcadores `TODO(fase2)` en `projectStore.ts` (ripple/split operan solo sobre la pista del clip / la base; "Dividir" solo en base) — afinar si el uso lo pide.
  - Priority: high

## Discovered / Backlog
- [x] Comentario en `binaries.ts` (yt-dlp.exe es solo-Windows a propósito) (2026-06-14)
- [x] Null-check de `ffmpegStatic` (cast al tipo real `string | null` + guard) (2026-06-14)
- [x] `res.body!` → guard en `clipsStore.ts` (2026-06-14)
- [x] Validar con Zod la respuesta de `/api/presets/:name` antes de `applyPreset` (2026-06-14)
- [x] Favicon (SVG con la marca) y launcher `VideoForge.cmd` (abrir sin comando) (2026-06-14)
- [x] Audio ducking: baja la música cuando hay voz al exportar (sidechaincompress, toggle en Música) (2026-06-14)
- [x] Modales in-app (confirmDialog/promptDialog) en vez de window.confirm/prompt nativos (2026-06-14)
- [x] yt-dlp estable en vez de nightly (Smart App Control bloqueaba el nightly) (2026-06-14)
- [ ] Estilos/animaciones de subtítulo (pop/bounce, caja, emojis, filtro de palabrotas)
- [ ] Export extra: miniatura, GIF, cola de exports
- [ ] Revisión de atajos de teclado y acciones de timeline (ripple delete, etc.)
- [ ] Descarga: cap opcional de duración/tamaño (diferido; vídeos largos de YouTube pueden ser enormes) — Origin: spec multiplataforma 2026-06-19, Priority: low
- [ ] Descarga: soporte de cookies/PO token para contenido privado/con edad — Origin: spec multiplataforma 2026-06-19, Priority: low

## Completed
- [x] `TASK-004` — Hito 4: filtros, velocidad, música, plantillas y pulido (2026-06-13)
  - Directo en master (commits 27d606e..0d9469e aprox.)
  - Plan: `docs/superpowers/plans/2026-06-12-hito-4-final.md` (12/12 tareas, revisión por tarea)
  - Filtros de color por clip (CSS en vivo + eq/hue en export, B&N reduce saturación), velocidad por clip (playbackRate + setpts/cadena atempo)
  - Música de fondo: subida con sniffer mp3/wav/ogg, pista en timeline, preview con pool de `<audio>` sincronizado, export con adelay+amix
  - Rotación de textos en el export vía capa transparente rotada; plantillas (formato+textos+imágenes) guardar/aplicar/borrar con ids regenerados y undo
  - 6 herramientas del carril activas; ayuda de atajos accesible (tecla ? + botón)
  - Verificado e2e con ffprobe: export con velocidad 2x + B&N + texto rotado 30° → MP4 1080x1920 de 3.002s (6s de material a 2x). 129 tests verdes
- [x] `TASK-003` — Hito 3: exportación con FFmpeg (2026-06-12)
- [x] `TASK-003` — Hito 3: exportación con FFmpeg (2026-06-12)
  - Directo en master (commits 33d6ba1..3ef976d aprox.)
  - Plan: `docs/superpowers/plans/2026-06-12-hito-3-exportacion.md` (9/9 tareas, doble revisión por tarea)
  - Builder de filter_complex con TDD (geometría contain+zoom par a la preview, multi-clip, huecos en negro, audio normalizado a 44.1kHz para el concat, cola final para overlays, drawtext con expansion=none y apóstrofo seguro, imágenes con rotación/opacidad)
  - Jobs en memoria con progreso por stderr (último time= del chunk), SSE con guard de doble cierre, cancelación que espera el lock del archivo
  - UI: diálogo modal con portal, foco atrapado (WCAG 2.4.3), presets TikTok/YouTube/CRF, abrir carpeta
  - Verificado e2e con Playwright + ffprobe: MP4 1080x1920 de 32.04s exportado desde la UI, sin errores de consola
- [x] `TASK-002` — Hito 2: editor con timeline, overlays y proyectos (2026-06-12)
  - Fusionado en master (PR #2, https://github.com/Saultr21/twitch-clip-maker/pull/2)
  - Plan: `docs/superpowers/plans/2026-06-10-hito-2-editor.md` (15/15 tareas, doble revisión por tarea + a11y 5/5 + revisión final)
  - Smoke test del usuario OK tras iteraciones: zoom/encuadre con recuadro en vivo (contain por defecto, letterbox, rueda), velo sobre lo que desborda el lienzo, guías de centrado con imán + botón centrar, carriles automáticos, paneles redimensionables, fix del playhead y del max-width del preflight
  - 65+ tests verdes, verificación de UI con arnés Playwright (client/devDependencies)
- [x] `TASK-001` — Hito 1: base, descarga y reproducción (2026-06-10)
  - Fusionado en master (PR #1, https://github.com/Saultr21/twitch-clip-maker/pull/1)
  - Plan: `docs/superpowers/plans/2026-06-09-hito-1-base-descarga.md` (10/10 tareas, doble revisión por tarea + revisión final)
  - Verificado: descarga real end-to-end con progreso NDJSON, streaming con Range, URL inválida → 400, persistencia, smoke test visual del usuario OK, 20 tests verdes, typecheck limpio
  - Fixes post-smoke-test: layout del reproductor (grid→flex, el vídeo tapaba los controles) y salida UTF-8 de yt-dlp (`--encoding utf-8`, títulos con acentos)
- [x] `TASK-000` — Brainstorming, spec y plan del Hito 1 (2026-06-09)
  - Spec: `docs/superpowers/specs/2026-06-09-twitch-clip-editor-design.md`

## Architecture Decisions
- `DEC-001`: App web local (Vite+React / Fastify), no escritorio — iteración más rápida, FFmpeg nativo en backend (2026-06-09)
- `DEC-002`: yt-dlp canal nightly auto-gestionado — Twitch rompe el extractor periódicamente y las nightly llevan el fix (2026-06-09)
- `DEC-003`: Konva+react-konva para overlays; timeline a medida (librerías existentes estancadas) (2026-06-09)
- `DEC-004`: FFmpeg nativo + execa con filter_complex a mano — fluent-ffmpeg archivado, ffmpeg.wasm ~10x más lento (2026-06-09)
- `DEC-005`: Coordenadas normalizadas (0–1) en el modelo — presets reutilizables entre formatos (2026-06-09)
- `DEC-006`: Progreso de descarga por NDJSON sobre fetch en vez de SSE — más simple sobre POST, mismo efecto (2026-06-09)
- `DEC-007`: Script dev del server con `node --watch --import tsx` — `tsx watch` se cuelga bajo concurrently en Windows (privatenumber/tsx#623) (2026-06-10)
- `DEC-008`: `@fastify/static` ^9.1.3 y shell-quote parcheados por avisos de seguridad (GHSA-pr96-94w5-mx2h, GHSA-w7jw-789q-3m8p) (2026-06-10)
- `DEC-009`: Volumen del reproductor en `playerStore` (Zustand) — sobrevive al remontaje por `key={clip.id}` al cambiar de clip (2026-06-10)

## Notes
- Estilo aprobado: oscuro Twitch (#0e0e10 / #18181b, acento #9146FF); token `--color-muted` subido a #8e8e96 por contraste AA
- Controles de transporte: combinación B+C (inicio/fin, fotograma a fotograma, bucle + barra de progreso y volumen)
- Usuario en Windows; binarios asumen yt-dlp.exe
- data/ y .superpowers/ están en .gitignore
- El logotipo "VideoForge" en acento #9146FF está exento de contraste por WCAG 1.4.3 (logotypes)
- Rama base del repo: `master` (no `main`)
