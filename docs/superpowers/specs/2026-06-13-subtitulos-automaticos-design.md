# Subtítulos automáticos (karaoke) — Especificación de diseño

> Diseño — 2026-06-13
> Estado: aprobado por el usuario tras brainstorming

## 1. Propósito

Transcribir automáticamente el audio de un clip a texto con tiempos (voz-a-texto
local) y mostrarlo como **subtítulos karaoke** —frase visible con la palabra
hablada resaltada— en la previsualización y en el vídeo exportado, con edición
manual de texto, tiempos y estilo.

Encaja en ClipForge (app local Vite+React / Fastify, un solo usuario, Windows)
manteniendo el modelo "solo Node + binarios auto-descargados" ya usado para
yt-dlp y FFmpeg.

## 2. Decisiones validadas

| Tema | Decisión |
|---|---|
| Estilo | Karaoke: la frase completa visible, la palabra activa resaltada (color de acento) |
| Motor STT | whisper.cpp (binario C++ standalone + modelo GGML, sin Python) |
| Modelo por defecto | `base` (~142 MB, multilingüe); `small` configurable si falta precisión |
| Idioma | Autodetección por defecto, con selector para forzarlo |
| Edición | Completa: texto (por frase), estilo (global) y tiempos (bloques en el timeline) |
| Render preview | Konva (control total del resaltado por palabra) |
| Render export | Subtítulos ASS quemados con el filtro `ass` de FFmpeg (libass) |
| Disparo | Botón explícito "Generar subtítulos" por clip, no automático |

**Descartado:** faster-whisper (arrastra runtime de Python/CTranslate2, rompe el
modelo de binarios; instalación frágil en Windows). Render karaoke a mano con
`drawtext` (resaltado por palabra dentro de una línea es inviable de forma
limpia; solo fallback degradado si libass no estuviera disponible).

## 3. Modelo de datos (en `shared/`)

Las palabras son la única fuente de verdad de los tiempos.

```ts
interface SubtitleWord {
  text: string;
  start: number;   // segundos, en la línea de tiempo del PROYECTO
  end: number;
}
interface SubtitleCue {
  id: string;
  words: SubtitleWord[];   // ≥1 palabra; la frase que se ve junta en pantalla
}
interface SubtitleStyle {   // estilo global, uno para todos los subtítulos
  fontFamily: string;
  fontSize: number;        // fracción de la altura del lienzo (0–1)
  fill: string;            // #RRGGBB color base
  highlight: string;       // #RRGGBB de la palabra activa
  stroke: string;          // #RRGGBB del borde ("" = sin borde)
  strokeWidth: number;     // fracción de la altura (0–~0.1)
  y: number;               // posición vertical 0–1 (defecto 0.82)
  uppercase: boolean;
}
```

En `Project`: `subtitles: { cues: SubtitleCue[]; style: SubtitleStyle }`, definido
en el esquema Zod con `.default(...)` (igual que `background`) para que los
proyectos guardados antes de esta función sigan validando. Estilo por defecto:
fuente "Impact", fontSize 0.05, fill "#ffffff", highlight "#9146ff" (acento),
stroke "#000000", strokeWidth 0.004, y 0.82, uppercase true.

**Reglas de derivación:**
- Bloque de una frase en el timeline: de `words[0].start` a `words[última].end`.
- Arrastrar el bloque → desplaza todas las palabras por el mismo Δ.
- Redimensionar el bloque → escala los tiempos de las palabras proporcionalmente.
- Editar el texto de una frase → reparte los tiempos `[inicio, fin]` actuales
  equitativamente entre las palabras nuevas (se pierde la precisión por palabra
  de Whisper solo en las frases editadas).

## 4. Backend de transcripción

**Gestión del binario** (extiende `services/binaries.ts`):
- En el primer uso descarga `whisper-cli.exe` (whisper.cpp) y el modelo GGML
  (`ggml-base.bin` por defecto) a `data/bin/`. El estado se reporta por el
  endpoint de setup ya existente (pantalla de preparación).

**Ruta** `POST /api/clips/:id/subtitles`, body `{ language?: string }`:
1. Validar `:id` contra el registro de clips (sin paths del usuario).
2. Extraer el audio del clip a WAV 16 kHz mono con ffmpeg (lo que espera whisper.cpp).
3. Ejecutar whisper.cpp vía execa (array de args) con salida JSON y timestamps
   por palabra; idioma autodetectado o forzado por `language`.
4. Parsear el JSON → cues con palabras y tiempos; **desplazar los tiempos** al
   espacio del proyecto según `trimIn`, `timelineStart` y `speed` del clip:
   `tProyecto = clip.timelineStart + (tArchivo − clip.trimIn) / clip.speed`,
   recortando palabras fuera de `[trimIn, trimOut]`.
5. Responder `SubtitleCue[]`; el cliente los fusiona en el store (una entrada de
   historial → Ctrl+Z lo deshace).
- Progreso por **SSE** con cancelación (mismo patrón que el export). El WAV
  temporal se borra al terminar o cancelar.

**Pieza con TDD:** el parser del JSON de whisper.cpp → `SubtitleCue[]` con el
desplazamiento por trim/speed (lógica pura).

## 5. Render

**Preview (Konva):** un `SubtitlesLayer` dentro del `OverlayLayer`. Busca la cue
activa (la que contiene el playhead), pinta sus palabras como una línea centrada
en `style.y`; la palabra cuyo `[start,end]` contiene el playhead va en
`style.highlight`, el resto en `style.fill`, con borde según el estilo. Solo
lectura en el lienzo (se edita en su panel y su pista) para no chocar con la
selección de overlays.

**Export (ASS + libass):**
- Generar un `.ass`: cabecera `[V4+ Styles]` derivada de `SubtitleStyle`
  (fuente, fontsize = `fontSize·H`, `PrimaryColour`/`SecondaryColour`/`OutlineColour`,
  alineación inferior-centro, `MarginV` desde `style.y`), y `[Events]` con un
  `Dialogue` por cue usando karaoke nativo (`{\k<cs>}palabra `) y el truco de
  color primario/secundario para que la palabra activa cambie a `highlight`.
- En `filterGraph.ts`, tras textos e imágenes, si hay cues añadir el filtro
  `ass='<ruta escapada>'` a la cadena de vídeo. El `.ass` se escribe en un
  temporal por job y se borra al terminar.
- **Paso 1 del plan (riesgo):** verificar que ffmpeg-static trae libass
  (`ffmpeg -filters` contiene `ass`). Si no, fallback degradado a subtítulo por
  frase sin resaltado vía drawtext, avisando antes de continuar.

**Piezas con TDD:** generador del `.ass` (cabecera de estilo + líneas Dialogue
con `\k` y escape) y el cálculo de centisegundos de karaoke.

**Trade-off asumido:** Konva (preview) y libass (export) no son idénticos al
píxel en métricas de fuente; con la misma familia y tamaño relativo quedan muy
parecidos. Es el mismo trade-off preview↔export ya aceptado en el proyecto.

## 6. UI de edición

**Herramienta "Subtítulos"** (nuevo icono en el `ToolRail`) → panel contextual:
- Selector de idioma (Autodetectar por defecto) + botón "Generar subtítulos" con
  barra de progreso y cancelar.
- Lista de frases editable: texto inline por frase (al cambiarlo se redistribuyen
  los tiempos de sus palabras) y borrar frase.
- Estilo global: fuente, tamaño, color base, color de resaltado, borde, posición
  vertical, MAYÚSCULAS (reutilizando `Field`/`Slider` con campo numérico).
- Botón "Borrar todos los subtítulos".

**Pista "Subtítulos" en el timeline** (nuevo carril, como Texto/Imagen/Música):
cada cue es un bloque arrastrable y recortable (handles de `TrackRow`); arrastrar
desplaza sus palabras, redimensionar las escala; seleccionar resalta su fila en
el panel. Color de pista propio (violeta/rosa).

## 7. Errores y estados

- Sin clips → el botón avisa de añadir un clip primero.
- whisper sin binario → pantalla de preparación; fallo de descarga → error claro.
- Sin voz detectada → "No se detectó habla en el clip" (cero cues, no error duro).
- Idioma mal detectado → forzar idioma y regenerar.
- Transcripción fallida → error legible con stderr expandible (como el export).

## 8. Pruebas

- **Unit (Vitest, TDD):** parser JSON de whisper → cues con desplazamiento por
  trim/speed; generador `.ass` (estilo + `\k` + escape); redistribución de
  tiempos al editar texto; escalado al redimensionar un bloque.
- **Integración:** ruta de subtítulos con un WAV de fixture diminuto; verificación
  de que el `.ass` generado quema en un export real (ffprobe + el filtro `ass` no
  falla).
- **Manual/Playwright:** generar subtítulos, ver el karaoke en preview, editar
  texto, arrastrar un bloque, exportar.

## 9. Fuera de alcance (YAGNI)

- Edición de tiempos palabra a palabra (solo por frase / bloque).
- Estilos por frase (el estilo es global).
- Traducción de subtítulos a otro idioma.
- Subtítulos para la pista de música (solo el audio del vídeo).
- Exportar un fichero de subtítulos aparte (.srt/.ass sidecar) — solo quemados.
