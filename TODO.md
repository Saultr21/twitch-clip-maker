# TODO — ClipForge (editor local de clips de Twitch)

> Last updated: 2026-06-11
> Current phase: development
> Overall progress: Hito 2 implementado (15/15 tareas) — pendiente smoke test del usuario y merge

## In Progress
- [ ] `TASK-002` — Hito 2: editor — **IMPLEMENTACIÓN COMPLETA, pendiente smoke test visual y merge**
  - Plan: `docs/superpowers/plans/2026-06-10-hito-2-editor.md` (15/15 tareas, doble revisión por tarea + revisión a11y 5/5 + revisión final ✅ READY FOR PR)
  - Rama: `feat/hito-2-editor`
  - Verificado: 65 tests verdes (26 client + 34 server + 5 shared), typecheck limpio en los 3 workspaces, APIs de proyectos/assets funcionando por el proxy, contrastes AA computados
  - Pendiente del usuario: smoke test visual (overlays drag/resize/rotación, timeline drag/trim/split, undo/redo, autoguardado, atajos)

## Up Next
- Smoke test del usuario sobre la PR del Hito 2 → merge
- Planificación del Hito 3 (exportación)

## Backlog (hitos pendientes de plan)
- [ ] `TASK-003` — Hito 3: exportación (builder filter_complex con TDD, jobs FFmpeg, progreso SSE, presets de calidad; API /api/fonts con TTF para paridad drawtext)
  - Depends on: TASK-002
- [ ] `TASK-004` — Hito 4: presets de plantilla, filtros de color, velocidad por tramos, zoom/pan, música de fondo, pulido y accesibilidad final
  - Depends on: TASK-003

## Discovered / Backlog (mejoras menores del review final, para Hito 2)
- [ ] Guard de `process.platform` o comentario en `binaries.ts` (yt-dlp.exe es solo-Windows a propósito)
  - Origin: revisión final Hito 1 | Priority: low
- [ ] Null-check explícito de `ffmpegStatic` en vez del cast (`as unknown as string`)
  - Origin: revisión final Hito 1 | Priority: low
- [ ] Sustituir `res.body!` por guard en `clipsStore.ts`
  - Origin: revisión final Hito 1 | Priority: low

## Completed
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
- El logotipo "ClipForge" en acento #9146FF está exento de contraste por WCAG 1.4.3 (logotypes)
- Rama base del repo: `master` (no `main`)
