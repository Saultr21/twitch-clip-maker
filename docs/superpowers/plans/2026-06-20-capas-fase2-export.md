# Capas unificadas — Fase 2: Export por orden de capas (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que el export (FFmpeg) componga el vídeo **siguiendo el orden de `tracks.layers`** (índice 0 = atrás, último = frente), mezclando vídeo, imagen y texto en cualquier z. Así un texto puede ir detrás de un vídeo, una imagen entre dos vídeos, etc.

**Architecture:** Se reescribe la compositación visual de `buildFilterGraph` a un modelo de **overlays temporizados sobre un fondo de duración completa**, en vez del `concat` de la pista base. (1) Se genera un **fondo base** para toda la duración (negro/color/imagen/blur). (2) Se recorre `tracks.layers` de atrás a frente y se compone cada capa encima: los clips de vídeo como overlays con su ventana de tiempo (`enable=between`, `setpts` desplazado al `timelineStart`), las imágenes y textos con su lógica de overlay actual. (3) El audio se mezcla desde **todos** los clips de vídeo (retrasados a su inicio) + música (sin `concat`). (4) Subtítulos ASS al final, encima.

**Tech Stack:** TypeScript, FFmpeg `filter_complex` (overlay, setpts, adelay, amix, boxblur, drawtext, ass), Vitest (tests de string), ffprobe (e2e).

**Spec:** `docs/superpowers/specs/2026-06-20-capas-unificadas-design.md` (§3). Fase 1 hecha (`tracks.layers`).

---

## Contexto actual (para el implementador)

`buildFilterGraph` (en `server/src/services/ffmpeg/filterGraph.ts`) HOY:
- Toma la base como `videoLayers(project)[0].clips` (ordenados), los concatena en
  segmentos sobre fondo (negro/color/blur/imagen), con huecos (`pushGap`), produciendo
  `[vcat][acat]`. Aplica `clipTransition` (fade a negro entre clips) y velocidad/color.
- Luego compone, en orden FIJO: capas de vídeo superiores (`videoLayers.slice(1)`),
  imágenes (`imageItems`), textos (`textItems`), todas con `enable=between(start,end)`.
- Audio: audio de clips base (en el concat) + audio de capas de vídeo superiores
  (`adelay`) + música (`amix`, con ducking opcional). Subtítulos ASS al final.
- Helpers: `solidBackground`, `blurRadius`, `colorFilters`, `renderRect(W,H,sw,sh,zoom,crop)`,
  `atempoChain`, `num`, `clipEnd`, `drawtextFilter`, `drawtextFilterCentered`.
- Selectores: `videoLayers`, `imageItems`, `textItems`, `allVideoClips` de `@clipforge/shared`;
  además `project.tracks.layers` (orden real).

---

## Modelo objetivo (lo que debe generar tras la Fase 2)

1. **Duración total** = máximo `end` entre: todos los clips de vídeo (`allVideoClips`,
   `clipEnd`), imágenes (`item.end`), textos (`item.end`). (Ya hay lógica similar para la
   cola; generalízala a `allVideoClips`.)
2. **Fondo base `[bg]`** de duración total:
   - `black`/`color`: `solidBackground` a la duración total.
   - `image`: imagen en bucle escalada a cover, recortada a la duración total.
   - `blur`: copia desenfocada del **primer clip de la capa de vídeo más al fondo** (la
     primera capa de vídeo del array) que esté activo; si no hay clip activo en un tramo,
     cae a negro. (Para no complicar: el blur se deriva de la primera capa de vídeo como
     hoy lo hacía la base; si esto resulta difícil de generalizar a duración completa con
     huecos, mantener el comportamiento de blur por-clip SOLO para la primera capa de vídeo
     y negro en los huecos.)
3. **Compositar capas en orden** (`tracks.layers`, índice 0 primero = más al fondo):
   - **video**: por cada clip, rama `trim` + (`crop`) + `setpts=(PTS-STARTPTS)/speed+START/TB`
     + `scale=rect.w:rect.h` (con `renderRect`) + `colorFilters` + (`format=rgba,
     colorchannelmixer=aa=opacity` si `opacity<1`); overlay sobre el acumulado con
     `enable='between(t,start,clipEnd)':eof_action=pass`.
   - **image**: por cada item, `crop`/`scale`/`format=rgba`/`colorchannelmixer=aa=opacity`/
     `rotate` (lógica de overlay de imagen actual) + overlay `enable=between`.
   - **text**: por cada item, `drawtext` (o capa rotada) + overlay `enable=between` (lógica
     de texto actual).
4. **Audio**: por cada clip de vídeo (de cualquier capa), `atrim`+`asetpts`+`atempo`+
   `volume(originalAudioVolume)`+`aresample`+`aformat`+`adelay=timelineStart` → mezclar
   todos (`amix`) junto con la música (ducking afecta solo a la música, como hoy). Si no
   hay clips, silencio de duración total.
5. **fadeIn/fadeOut** globales (último paso sobre vídeo/audio finales) — se conservan.
6. **clipTransition** (fade a negro entre clips consecutivos): se conserva aplicándolo a
   los clips consecutivos de la **primera capa de vídeo** (la base). Si su integración en
   el modelo de overlays resulta arriesgada, márcalo como limitación y cúbrelo con un test
   que documente el comportamiento elegido (no romper el flag).
7. **Subtítulos ASS**: al final, encima de todo (sin cambios).

> El orden de composición ahora lo da `tracks.layers`. Para un proyecto migrado de v2
> (capas en orden vídeo→imagen→texto) el RESULTADO VISUAL debe ser equivalente al de hoy.

---

## Tasks

### Task 1: Geometría/duración helpers + andamiaje

**Files:** `server/src/services/ffmpeg/filterGraph.ts`, `filterGraph.test.ts`

- [ ] **Step 1:** Añade un test que, con un proyecto de una capa de vídeo (1 clip), el grafo
  siga produciendo un MP4 equivalente: existe `[bg...]`, el clip se compone, hay audio, y
  `totalDuration` correcto. (Reusa los helpers de test existentes.)
- [ ] **Step 2:** Implementa el cálculo de `totalDuration` con `allVideoClips`+imágenes+textos.
- [ ] **Step 3:** Run + commit (`feat(capas): duración total sobre todas las capas`).

### Task 2: Reescribir la compositación visual por orden de capas

**Files:** `server/src/services/ffmpeg/filterGraph.ts`, `filterGraph.test.ts`

- [ ] **Step 1: Tests** (string del grafo) para:
  - Proyecto v2-equivalente (capas vídeo→imagen→texto): el orden de overlays en el grafo
    es vídeo, luego imagen, luego texto (equivale a hoy).
  - Proyecto con `layers=[text, video]` (texto ATRÁS): en el grafo el texto se compone
    ANTES (debajo) del vídeo. Verifica que la etiqueta del texto alimenta el overlay del
    vídeo (texto detrás).
  - Proyecto con `layers=[video, image, video]` (imagen entre vídeos): la imagen se compone
    entre los dos overlays de vídeo.
- [ ] **Step 2:** Run para ver fallar.
- [ ] **Step 3: Implementar** la nueva compositación:
  - Genera `[bg]` de duración total (negro/color/imagen/blur según §2).
  - Recorre `project.tracks.layers`; mantén un `acc` (etiqueta del vídeo acumulado, empieza
    en `[bg]`); por cada capa compón sus elementos en orden temporal sobre `acc`, encadenando
    etiquetas únicas; usa prefijos de etiqueta por tipo para evitar colisiones
    (`[vl{i}_{j}]`, `[img{i}_{j}]`, `[txt{i}_{j}]`).
  - Reúne las ramas de audio de TODOS los clips de vídeo (con `adelay`).
- [ ] **Step 4:** Run hasta verde (nuevos + existentes ajustados).
- [ ] **Step 5: Commit** (`feat(capas): compositar el export por orden de capas`).

### Task 3: Audio mezclado desde todos los clips + música/ducking

**Files:** `server/src/services/ffmpeg/filterGraph.ts`, `filterGraph.test.ts`

- [ ] **Step 1: Tests** del audio: con 2 capas de vídeo solapadas en tiempo, ambos audios
  se mezclan (cada uno con su `adelay`); con música + ducking, la música baja bajo la voz
  combinada; sin clips, silencio de duración total.
- [ ] **Step 2-4:** Implementar la mezcla de audio (voz = todos los clips de vídeo
  retrasados + amix; música encima con ducking opcional) + verde + commit.

### Task 4: Verificación e2e con ffmpeg real (capas intercaladas)

**Files:** `server/src/services/ffmpeg/multitrackExport.e2e.test.ts` (ampliar)

- [ ] Añade un caso e2e: proyecto con `layers=[video(base), text, video(esquina)]` y una
  imagen → ejecutar ffmpeg real (binario vía `binaries.ts`, args vía `presets.ts`) →
  MP4 válido con 1 stream de vídeo + 1 de audio (ffprobe). Confirma que el grafo nuevo
  RENDERIZA (no solo strings).

### Task 5: Cierre

- [ ] Suite + typecheck globales verdes (los 3 paquetes). Actualizar TODO.md + push.

---

## Riesgos / notas

- **El concat→overlay es el cambio de mayor riesgo**; la red de seguridad son los tests de
  string existentes (ajustados al nuevo orden) + el e2e con ffmpeg real (que habría cazado
  bugs como la colisión de etiquetas del multipista).
- **Blur de fondo a duración completa con huecos**: si es difícil, derivarlo de la primera
  capa de vídeo y negro en huecos; documentar con test.
- **clipTransition**: conservar para la primera capa de vídeo; si su integración complica,
  documentar el comportamiento con un test (no romper el flag) — afinar en Fase 5 si hace falta.
- **Equivalencia v2**: un proyecto migrado (orden vídeo→imagen→texto) debe dar el mismo
  resultado visual que antes; verificarlo con un test de orden y el e2e.
- Preview (Fase 4) compondrá en el MISMO orden de capas; export y preview quedarán alineados.
