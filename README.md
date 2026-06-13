# ClipForge

Editor local de clips de Twitch: descarga un clip por su URL y edítalo en una
línea de tiempo multipista — recorte, multi-clip, zoom/encuadre, texto e imágenes
superpuestas (arrastrables, redimensionables y rotables), música de fondo,
velocidad y filtros de color por clip — y expórtalo con FFmpeg a vídeo vertical
(9:16), horizontal (16:9), cuadrado (1:1) o 4:5, listo para TikTok, Reels,
Shorts o YouTube.

Aplicación de un solo usuario, sin autenticación y sin despliegue: se arranca en
local y se abre en el navegador. Pensada para Windows.

## Requisitos

- **Node.js 22+**
- **Windows** (los binarios de yt-dlp y las fuentes de texto asumen rutas de Windows)
- Conexión a internet en el primer arranque (descarga automática de yt-dlp; FFmpeg
  viene incluido vía `ffmpeg-static`)

## Puesta en marcha

```bash
npm install
npm run dev
```

`npm run dev` levanta a la vez el servidor (http://127.0.0.1:3001) y el cliente
(http://localhost:5173). Abre **http://localhost:5173** en el navegador.

En el primer arranque el servidor descarga `yt-dlp` (canal nightly) en
`data/bin/`; verás una pantalla de preparación hasta que esté listo.

## Cómo se usa

1. **Medios** → pega la URL de un clip de Twitch y pulsa *Descargar clip*.
2. *+ Añadir a la línea de tiempo* coloca el clip en la pista de Vídeo.
3. Edita: arrastra/recorta los bloques del timeline, añade **Texto** e **Imagen**
   (arrástralos, redimensiónalos por las esquinas y rótalos en el lienzo),
   sube **Música**, y ajusta **Velocidad** y **Filtros** del clip en el panel
   de propiedades.
4. **Guardar** / menú **Proyectos** conservan el trabajo (autoguardado cada 5 s).
   El menú **Plantillas** guarda y reaplica formato + textos + imágenes.
5. **Exportar** → elige calidad (TikTok / YouTube / Máxima) y genera el MP4 en
   `data/exports/`.

## Atajos de teclado

| Tecla | Acción |
|---|---|
| Espacio | Reproducir / pausar |
| S | Dividir el clip en el playhead |
| Supr / Retroceso | Eliminar el elemento seleccionado |
| Ctrl+Z / Ctrl+Y | Deshacer / rehacer |
| Ctrl+S | Guardar el proyecto |
| Flechas | Mover el overlay seleccionado (Shift acelera) |
| ← → | Sin selección: mover el playhead fotograma a fotograma |
| Escape | Deseleccionar / cerrar menús |
| ? | Ayuda de atajos |

## Arquitectura

Monorepo de workspaces npm:

```
twitch-clip/
├── client/   Vite + React 19 + TypeScript + Tailwind v4 + Zustand + Konva
│   └── src/
│       ├── components/   shell (TopBar, ToolRail, AppShell, diálogos)
│       ├── features/     media, preview, timeline, properties, image,
│       │                 audio, projects, export
│       ├── stores/       projectStore (historial undo/redo), uiStore, ...
│       └── lib/          coordenadas normalizadas, lógica de timeline, atajos
├── server/   Fastify 5 + TypeScript (NodeNext) + execa + Zod
│   └── src/
│       ├── routes/       clips, projects, assets, export, presets, setup
│       ├── services/     descarga (yt-dlp), binarios, repos, ffmpeg/ (builder
│       │                 del filter_complex, drawtext, geometría, presets)
│       └── lib/          paths, validación de URLs, sniffers de magic bytes
├── shared/   tipos y esquemas Zod del modelo Project, export y plantillas
└── data/     workspace local (gitignored): clips, assets, projects, presets,
              exports, bin
```

- **Previsualización 100 % en el cliente**: `<video>` nativo + capa Konva para los
  overlays + filtros CSS. FFmpeg solo interviene al exportar.
- **Coordenadas normalizadas (0–1)** en el modelo → las plantillas y los cambios
  de formato no recalculan posiciones.
- **Exportación**: el `Project` se traduce a un grafo `filter_complex` (segmentos
  de clip sobre fondo negro, concat, overlays, drawtext, mezcla de audio) que se
  ejecuta con FFmpeg vía execa; el progreso llega por SSE y se puede cancelar.

## Scripts

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor + cliente en modo desarrollo |
| `npm run test` | Tests (Vitest) de los tres workspaces |
| `npm run typecheck` | Comprobación de tipos de los tres workspaces |
| `npm run build -w @clipforge/client` | Build de producción del cliente |

## Seguridad

App local en `127.0.0.1`. Allowlist de dominios de Twitch para la descarga;
FFmpeg y yt-dlp se invocan con execa (array de argumentos, nunca shell); los
nombres de archivo se sanean (sin path traversal) y los uploads se verifican por
magic bytes; los colores de texto se validan como hex estricto antes de entrar al
`filter_complex`.

## Limitaciones conocidas

- Solo Windows (rutas de binarios y fuentes TTF del sistema).
- La paridad visual entre la preview (CSS/Konva) y el MP4 (FFmpeg) es muy alta
  pero no píxel-perfect en métricas finas de texto.
