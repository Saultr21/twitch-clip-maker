# TODO — ClipForge (editor local de clips de Twitch)

> Last updated: 2026-06-13
> Current phase: maintenance
> Overall progress: Hitos 1–4 completos en master — proyecto funcional de punta a punta

## In Progress
- (nada — los 4 hitos del plan están cerrados; pendiente smoke test del usuario del Hito 4)

## Up Next
- Mejoras de `Pendiente.txt` pendientes: fondo de IMAGEN (export con inputs en bucle) y subtítulos automáticos (necesita brainstorming: motor voz-a-texto local)
- Se trabaja directamente en `master`, sin ramas ni PRs (petición del usuario)

## Mejoras de Pendiente.txt (post-Hito 4)
- [x] Sliders con campo numérico editable a mano (2026-06-13)
- [x] Fondo de proyecto color/blur en preview y export (2026-06-13)
- [x] Marcas de agua reutilizables: guardar logo + insertar en esquina (2026-06-13)
- [x] Fondo de IMAGEN (export con input en bucle + split, preview y UI) (2026-06-13)
- [ ] Subtítulos automáticos (en brainstorming: Whisper u otro STT local)

## Discovered / Backlog (mejoras menores, baja prioridad)
- [ ] Guard de `process.platform` o comentario en `binaries.ts` (yt-dlp.exe es solo-Windows a propósito)
- [ ] Null-check explícito de `ffmpegStatic` en vez del cast (`as unknown as string`)
- [ ] Sustituir `res.body!` por guard en `clipsStore.ts`
- [ ] Validar con Zod la respuesta de `/api/presets/:name` en el cliente antes de `applyPreset`
- [ ] Jobs de export en memoria sin poda (crecen por sesión; aceptable en local)

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
- El logotipo "ClipForge" en acento #9146FF está exento de contraste por WCAG 1.4.3 (logotypes)
- Rama base del repo: `master` (no `main`)
