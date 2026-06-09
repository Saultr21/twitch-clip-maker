# ClipForge — Editor local de clips de Twitch

> Especificación de diseño — 2026-06-09
> Estado: aprobada por el usuario tras brainstorming

## 1. Propósito

Aplicación web **de uso local** para descargar clips de Twitch por URL y editarlos con un editor visual completo (recorte, redimensionado, texto e imágenes arrastrables, audio, velocidad, filtros, multi-clip) sobre una línea de tiempo multipista, exportando con FFmpeg a formatos listos para TikTok/Shorts/Reels, YouTube y otros.

Usuario único, sin autenticación, sin despliegue: se arranca con `npm run dev` y se abre en el navegador.

## 2. Decisiones de alcance (validadas con el usuario)

| Tema | Decisión |
|---|---|
| Plataforma | App web local (Vite + React frontend, Node + Fastify backend) |
| Obtención de clips | Pegar URL del clip (sin API de Twitch, sin credenciales) |
| Formatos de salida | 9:16 (1080x1920), 16:9 (1920x1080), 1:1, 4:5 y resolución personalizada |
| Funciones de edición | Trim/división, multi-clip en secuencia, texto e imágenes superpuestas (drag + resize por esquinas + rotación), volumen del clip + música de fondo, velocidad por tramos, zoom/pan, filtros de color |
| Presets | Guardar/aplicar plantillas con formato + elementos de texto/imagen (posición, estilo, tamaño) — sin los clips |
| Estilo visual | Oscuro estilo Twitch: fondo #0e0e10/#18181b, acento púrpura #9146FF, bordes redondeados |
| Controles de reproducción | Combinación B+C: ir a inicio/fin, fotograma a fotograma, play/pausa, bucle, tiempo + barra de progreso con volumen bajo el vídeo |

## 3. Stack técnico (verificado junio 2026)

| Pieza | Elección | Motivo |
|---|---|---|
| Frontend | Vite + React 19 + TypeScript strict | Iteración rápida, sin SSR innecesario |
| Estado | Zustand | Proyecto = JSON serializable; undo/redo por snapshots |
| Overlays | Konva + react-konva | `Transformer` integrado: drag, resize por esquinas, rotación; bindings React oficiales mantenidos |
| Timeline | A medida (sin librería) | Las librerías existentes están estancadas (`react-timeline-editor` sin releases); patrones de OpenCut/Remotion como referencia |
| Backend | Node 22 + Fastify + TypeScript | Ligero, SSE nativo sencillo |
| Descarga | yt-dlp (binario standalone, canal **nightly**) vía execa | Estándar de facto; Twitch rompe el extractor periódicamente y las nightly llevan el fix; auto-update al arrancar |
| Export | FFmpeg nativo (ffmpeg-static) + execa, `filter_complex` construido a mano | fluent-ffmpeg está archivado (2025); ffmpeg.wasm ~10x más lento y sin aceleración hardware |
| Validación | Zod en cada boundary (API requests, JSON de proyecto) | Estándar del proyecto |
| Tests | Vitest | Unit + integration |

**Descartado:** Next.js (API routes encajan mal con jobs largos), procesado en navegador con WebCodecs/Mediabunny (la descarga necesita backend igualmente; renders complejos peor que FFmpeg nativo), fluent-ffmpeg (muerto), Fabric.js (sin bindings React oficiales).

## 4. Arquitectura

```
twitch-clip/  (monorepo npm workspaces)
├── client/                    # Vite + React + TS
│   └── src/
│       ├── features/
│       │   ├── media/         # panel medios: pegar URL, lista de clips
│       │   ├── preview/       # <video> + capa Konva + transport B+C
│       │   ├── timeline/      # timeline multipista a medida
│       │   ├── properties/    # panel derecho contextual con sliders
│       │   ├── presets/       # guardar/aplicar plantillas
│       │   └── export/        # diálogo export + progreso SSE
│       ├── stores/            # Zustand: project, ui, history (undo/redo)
│       └── lib/               # coordenadas normalizadas, tiempo, tipos compartidos
├── server/                    # Fastify + TS
│   └── src/
│       ├── routes/            # clips, export, assets, projects, presets, fonts
│       ├── services/          # ytdlp.ts, ffmpeg/ (builder filter_complex), binaries.ts
│       └── lib/               # validación zod, sanitización, paths
├── shared/                    # tipos TS del modelo Project (cliente y servidor)
└── data/                      # workspace local (gitignored)
    ├── clips/  assets/  fonts/  projects/  presets/  exports/
```

- `npm run dev` arranca cliente (5173) y servidor (3001) con concurrently.
- Primer arranque: el servidor descarga los binarios de yt-dlp (nightly) y FFmpeg si faltan, con pantalla de preparación en la UI.
- Previsualización 100% en cliente (sin renderizar): `<video>` nativo + Konva encima + filtros CSS. FFmpeg solo al exportar.

## 5. Layout de la UI (mockup aprobado)

Cinco zonas, estilo oscuro Twitch:

1. **Barra superior**: nombre del proyecto, deshacer/rehacer, guardar, exportar (botón púrpura degradado)
2. **Carril izquierdo** (64px): herramientas Medios / Texto / Imagen / Audio / Filtros / Velocidad — cada una abre un panel contextual adyacente
3. **Centro**: lienzo de previsualización con selector de formato (9:16 ▾), overlays seleccionables con asas en esquinas + asa de rotación; debajo, transport B+C (⏮ ◀| ▶ |▶ ⏭ 🔁 + barra de progreso + volumen + tiempo)
4. **Panel derecho** (~280px): propiedades del elemento seleccionado — inputs, selector de fuente, colores, sliders (opacidad, rotación, tamaño, volumen…)
5. **Timeline inferior**: regla de tiempo, playhead arrastrable, zoom, dividir/eliminar; pistas: Vídeo (multi-clip), Texto, Imagen, Música. Bloques arrastrables, recortables por los bordes

Accesibilidad: WCAG 2.2 AA — navegación por teclado en timeline y overlays (flechas mueven el elemento seleccionado), focus visible, contraste verificado sobre fondos oscuros, atajos documentados (Space play/pausa, S dividir, Supr eliminar, Ctrl+Z/Y).

## 6. Modelo de datos

```ts
interface Project {
  id: string; name: string; version: 1;
  settings: { aspect: "9:16"|"16:9"|"1:1"|"4:5"|"custom"; width: number; height: number; fps: number };
  tracks: {
    video: VideoClip[];   // { clipId, timelineStart, trimIn, trimOut, speed, zoom: {x,y,scale}, filters: {brightness, contrast, saturation, hue, grayscale} }
    text: TextOverlay[];  // { content, fontFamily, fontSize, fill, stroke, shadow, x, y, rotation, opacity, start, end }
    image: ImageOverlay[];// { assetId, x, y, width, height, rotation, opacity, start, end }
    audio: AudioTrack[];  // { assetId, volume, start, end, trimIn, trimOut }
  };
  originalAudioVolume: number; // 0–1, volumen del audio de los clips
}
```

- **Coordenadas y tamaños normalizados (0–1)** relativos al lienzo → presets y cambios de formato sin recalcular.
- **Preset** = `Pick<Project, "settings"> + tracks.text + tracks.image` (sin clips ni audio), en `data/presets/<nombre>.json`.
- **Undo/redo**: snapshots inmutables del Project en el store history (límite 100), Ctrl+Z/Ctrl+Y.
- **Autoguardado** cada 5s si hay cambios, a `data/projects/<nombre>.json`.

## 7. API del backend

| Endpoint | Función |
|---|---|
| `POST /api/clips` | body `{ url }` → valida dominio Twitch (allowlist), descarga con yt-dlp, SSE de progreso |
| `GET /api/clips/:id/stream` | sirve el MP4 con soporte Range para el `<video>` |
| `POST /api/assets` | sube imagen (png/jpg/webp/gif) o audio (mp3/wav/ogg), límite 100MB |
| `GET/POST/DELETE /api/projects[/:name]` | listar, guardar, cargar, borrar proyectos |
| `GET/POST/DELETE /api/presets[/:name]` | ídem presets |
| `GET /api/fonts` / `POST /api/fonts` | fuentes disponibles (TTF en data/fonts, set inicial descargado de Google Fonts) |
| `POST /api/export` | body = Project + calidad → job FFmpeg, devuelve `jobId` |
| `GET /api/export/:jobId/progress` | SSE: porcentaje (parseo de stderr), cancelación con `DELETE` |
| `GET /api/setup/status` | estado de descarga de binarios en primer arranque |

## 8. Pipeline de exportación

1. Validar Project con Zod.
2. Construir grafo `filter_complex` por capas: trim+setpts/atempo por clip → concat multi-clip → scale+crop al formato → eq/hue/grayscale → overlays de imagen (scale, rotate, overlay con enable between) → drawtext por cada texto (fontfile con escape de rutas Windows `C\:/...`, enable between) → mezcla de audio (volume + amix con música).
3. Ejecutar FFmpeg vía execa (args como array, nunca shell), codec H.264 + AAC, preset de calidad elegido (TikTok ~8Mbps 1080x1920, YouTube 1080p/1440p, o personalizado).
4. Emitir progreso por SSE; al terminar, archivo en `data/exports/` y botón "abrir carpeta".

**Pieza de mayor riesgo**: el builder de `filter_complex`. Se desarrolla con TDD y tests por combinación (ver §10).

**Trade-off asumido**: preview (Konva) y render (FFmpeg) pueden diferir ligeramente en métricas de texto/antialiasing. Mitigación: mismas fuentes TTF en ambos lados, coordenadas normalizadas. Sin píxel-perfect garantizado.

## 9. Errores y estados

Toda operación async tiene loading / error / empty:

- URL no válida o clip inexistente/regional → mensaje específico con el motivo
- Extractor de Twitch roto → auto-update de yt-dlp nightly y reintento; si persiste, aviso con enlace al clip
- Export fallido → error traducido a lenguaje humano + stderr completo expandible
- Primer arranque → pantalla de preparación de binarios con progreso
- Proyecto corrupto → fallback al último autoguardado válido
- Servidor caído → banner de reconexión en la UI

## 10. Seguridad (ssdlc, aunque sea local)

- Allowlist de dominios para descarga: `clips.twitch.tv`, `www.twitch.tv`, `twitch.tv`
- Sin shell: execa con array de argumentos; ningún string del usuario interpolado en comandos
- Nombres de archivo saneados (sin path traversal); IDs generados por el servidor
- Límites de tamaño y tipo MIME verificados en uploads
- Servidor escucha solo en 127.0.0.1
- Sin secretos: no hay credenciales en el proyecto

## 11. Testing

- **Unit (Vitest)**: builder de `filter_complex` (trim, velocidad, multi-clip, overlays, texto, audio y combinaciones), conversión coordenadas normalizadas↔px, lógica de timeline (solapamientos, divisiones, snapping)
- **Integration**: rutas Fastify con fixtures; render FFmpeg real con clips diminutos (2s) verificando duración/resolución de salida con ffprobe
- **Manual guiado**: UI del editor (drag/resize/rotación, timeline, undo) validada en navegador durante el desarrollo

## 12. Fuera de alcance (YAGNI)

- Búsqueda de clips por canal (API de Twitch con credenciales)
- Subtítulos automáticos / transcripción
- Transiciones animadas entre clips
- Keyframes de animación para overlays
- Multiusuario, despliegue, autenticación
- Empaquetado como app de escritorio
