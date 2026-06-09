# TODO — ClipForge (editor local de clips de Twitch)

> Last updated: 2026-06-09
> Current phase: development
> Overall progress: 0/10 tasks completed (Hito 1)

## In Progress
- (ninguna — listo para empezar el Hito 1)

## Up Next
- [ ] `TASK-001` — Hito 1: base, descarga y reproducción
  - Plan detallado: `docs/superpowers/plans/2026-06-09-hito-1-base-descarga.md` (10 tareas)
  - Scaffold monorepo → servidor Fastify → validador URLs → parser progreso → registro clips → binarios → descarga yt-dlp → shell cliente → panel medios → reproductor B+C

## Backlog (hitos pendientes de plan)
- [ ] `TASK-002` — Hito 2: editor (overlays Konva drag/resize/rotación, timeline multipista a medida, panel propiedades, undo/redo, autoguardado, proyectos)
  - Depends on: TASK-001
- [ ] `TASK-003` — Hito 3: exportación (builder filter_complex con TDD, jobs FFmpeg, progreso SSE, presets de calidad)
  - Depends on: TASK-002
- [ ] `TASK-004` — Hito 4: presets de plantilla, filtros de color, velocidad por tramos, zoom/pan, música de fondo, pulido y accesibilidad final
  - Depends on: TASK-003

## Completed
- [x] `TASK-000` — Brainstorming, spec y plan del Hito 1 (2026-06-09)
  - Spec: `docs/superpowers/specs/2026-06-09-twitch-clip-editor-design.md`

## Architecture Decisions
- `DEC-001`: App web local (Vite+React / Fastify), no escritorio — iteración más rápida, FFmpeg nativo en backend (2026-06-09)
- `DEC-002`: yt-dlp canal nightly auto-gestionado — Twitch rompe el extractor periódicamente y las nightly llevan el fix (2026-06-09)
- `DEC-003`: Konva+react-konva para overlays; timeline a medida (librerías existentes estancadas) (2026-06-09)
- `DEC-004`: FFmpeg nativo + execa con filter_complex a mano — fluent-ffmpeg archivado, ffmpeg.wasm ~10x más lento (2026-06-09)
- `DEC-005`: Coordenadas normalizadas (0–1) en el modelo — presets reutilizables entre formatos (2026-06-09)
- `DEC-006`: Progreso de descarga por NDJSON sobre fetch en vez de SSE — más simple sobre POST, mismo efecto (2026-06-09)

## Notes
- Estilo aprobado: oscuro Twitch (#0e0e10 / #18181b, acento #9146FF)
- Controles de transporte: combinación B+C (inicio/fin, fotograma a fotograma, bucle + barra de progreso y volumen)
- Usuario en Windows; binarios asumen yt-dlp.exe
- data/ y .superpowers/ están en .gitignore
