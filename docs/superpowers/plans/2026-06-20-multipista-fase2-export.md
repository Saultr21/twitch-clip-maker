# Multipista de vídeo — Fase 2: Export (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el export (FFmpeg) componga varias pistas de vídeo: la pista base (`tracks.video[0]`) por `concat` como ahora, y las pistas superiores (`tracks.video[1..]`) como overlays de vídeo en z-order, con ventana de tiempo, recorte, escala, color y opacidad por clip; además, mezclar el audio de todas las capas.

**Architecture:** Extensión de `buildFilterGraph`. Tras el `concat` que produce `[vcat]`, se compositan los clips de las pistas superiores sobre el vídeo acumulado (mismo patrón que los overlays de imagen, pero con input de vídeo, `trim` + desplazamiento de PTS al `timelineStart`, y opacidad vía `format=rgba,colorchannelmixer=aa`). El audio de cada clip superpuesto se retrasa a su `timelineStart` y se mezcla con el audio base y la música (patrón de las pistas de música). **Clave:** para un proyecto de una sola pista, el código nuevo es un no-op (no añade inputs ni filtros), así que la salida y todos los tests existentes quedan idénticos.

**Tech Stack:** TypeScript, FFmpeg `filter_complex` (overlay, setpts, adelay, amix), Vitest (tests de string del grafo), ffprobe (verificación e2e).

**Spec:** `docs/superpowers/specs/2026-06-20-multipista-video-design.md` (sección 6 + DEC-013). Fase 1 ya hecha (`tracks.video: VideoTrack[]`, `opacity` por clip, `renderRect` acepta `crop`).

---

## Estructura de archivos

**Modifica:**
- `server/src/services/ffmpeg/filterGraph.ts` — compositación de vídeo y audio de pistas superiores.
- `server/src/services/ffmpeg/filterGraph.test.ts` — tests de multipista (vídeo + audio).

No se tocan otros archivos: el modelo y `renderRect` ya soportan lo necesario.

---

## Contexto del código actual (para el implementador)

`buildFilterGraph` (en `filterGraph.ts`) hoy:
- `const clips = [...(project.tracks.video[0]?.clips ?? [])].sort(...)` → solo la pista base.
- Recorre `clips`, construye un segmento por clip (`[cvN]` + fondo `[bgN]` + `overlay` → `[segN]`) y su audio `[segaN]`.
- `filters.push(\`${segLabels.join("")}concat=n=${segLabels.length}:v=1:a=1[vcat][acat]\`)` y `let videoLabel = "[vcat]"`.
- Luego: overlays de imagen (loop, `videoLabel` encadenado a `[ovJ]`), textos (`[txtK]`), subtítulos (`[subs]`).
- Audio: `let audioLabel = "[acat]"`; si hay música, construye `musLabels` y hace `amix` (con rama de ducking opcional que baja la música bajo `[acat]`).
- Helpers disponibles en el archivo: `clipEnd(c)`, `num(n)`, `colorFilters(c)`, `renderRect(W,H,srcW,srcH,zoom,crop)`, `atempoChain(speed)`.

Las pistas superiores se compositan **después** del `concat` y **antes** de los overlays de imagen (z-order: fondo → base → vídeos superpuestos → imágenes → textos → subtítulos).

---

## Task 1: Compositar el VÍDEO de las pistas superiores

**Files:**
- Modify: `server/src/services/ffmpeg/filterGraph.ts`
- Test: `server/src/services/ffmpeg/filterGraph.test.ts`

- [ ] **Step 1: Test — un clip en una segunda pista produce overlay de vídeo con opacidad y ventana**

Añade a `filterGraph.test.ts` (usa el `info`/`projectWithClip` existentes; añade un segundo `ClipInfo` para la capa):

```ts
const info2: ClipInfo = {
  id: "clip-2", url: "https://x", title: "cam", fileName: "clip-2.mp4",
  duration: 6, width: 1280, height: 720, createdAt: "2026-06-20T00:00:00.000Z",
};

describe("buildFilterGraph — multipista (vídeo)", () => {
  it("una pista superior compositа un overlay de vídeo con opacidad y ventana de tiempo", () => {
    const p = projectWithClip(); // base: clip-1 en [0,5)
    // pista superior con un facecam en [1, 4) (3s), opacidad 0.8
    p.tracks.video.push({
      id: "t2", name: "", clips: [
        { ...createVideoClip("clip-2", 1, 6), trimIn: 0, trimOut: 3, opacity: 0.8, zoom: { x: 0.5, y: 0.5, scale: 0.4 } },
      ],
    });
    const g = buildFilterGraph(p, new Map([["clip-1", info], ["clip-2", info2]]));
    // el clip-2 es el segundo input de vídeo (índice 1)
    expect(g.inputs).toContainEqual({ kind: "video", fileName: "clip-2.mp4" });
    // cadena de la capa: trim + setpts con offset al timelineStart + scale + rgba + opacidad
    expect(g.filterComplex).toContain("[1:v]trim=start=0:end=3,setpts=(PTS-STARTPTS)/1+1/TB");
    expect(g.filterComplex).toContain("format=rgba,colorchannelmixer=aa=0.8[ovsrc0]");
    // overlay sobre [vcat] con enable entre 1 y 4 (clipEnd = 1 + 3/1)
    expect(g.filterComplex).toContain("[vcat][ovsrc0]overlay=");
    expect(g.filterComplex).toContain("enable='between(t,1,4)':eof_action=pass[ov0]");
    // el vídeo final ya no es [vcat] sino la capa compositada (luego seguirían imágenes/textos)
    expect(g.videoLabel).toContain("ov0");
  });

  it("proyecto de una sola pista: NO añade overlays de vídeo (comportamiento idéntico)", () => {
    const g = buildFilterGraph(projectWithClip(), new Map([["clip-1", info]]));
    expect(g.filterComplex).not.toContain("ovsrc");
    expect(g.videoLabel).toBe("[vcat]");
  });
});
```

- [ ] **Step 2: Run para ver fallar**

Run: `cd server && npx vitest run filterGraph -t multipista`
Expected: FAIL (no existe la compositación de capas; `[1:v]` no aparece o no como overlay).

- [ ] **Step 3: Implementar la compositación de vídeo de pistas superiores**

En `filterGraph.ts`, **justo después** de `let videoLabel = "[vcat]";` (la línea que sigue al `concat`), e **antes** del loop de overlays de imagen, inserta. Declara también `const overlayAudioLabels: string[] = [];` cerca del inicio de la función (junto a `const filters: string[] = []`), porque la Task 2 lo usa:

```ts
  // ── Capas de vídeo superpuestas (pistas por encima de la base) ──
  // z-order: se compositan sobre [vcat] y antes de imágenes/textos. Para un
  // proyecto de una sola pista, overlayTracks está vacío → no-op (salida idéntica).
  const overlayTracks = project.tracks.video.slice(1);
  let ovIdx = 0;
  for (const track of overlayTracks) {
    const layerClips = [...track.clips].sort((a, b) => a.timelineStart - b.timelineStart);
    for (const clip of layerClips) {
      const cinfo = clipInfos.get(clip.clipId);
      if (!cinfo) throw new Error(`Falta la información del clip ${clip.clipId}`);
      const inputIdx = inputs.length;
      inputs.push({ kind: "video", fileName: cinfo.fileName });
      const rect = renderRect(W, H, cinfo.width, cinfo.height, clip.zoom, clip.crop);
      const start = clip.timelineStart;
      const end = clipEnd(clip);
      const cropStep = clip.crop
        ? `crop=iw*${clip.crop.w}:ih*${clip.crop.h}:iw*${clip.crop.x}:ih*${clip.crop.y}`
        : null;
      // setpts: normaliza a 0, aplica velocidad y desplaza el inicio al timelineStart
      const vchain = [
        `trim=start=${num(clip.trimIn)}:end=${num(clip.trimOut)}`,
        ...(cropStep ? [cropStep] : []),
        `setpts=(PTS-STARTPTS)/${num(clip.speed)}+${num(start)}/TB`,
        `scale=${rect.w}:${rect.h}`,
        ...colorFilters(clip),
        "format=rgba",
        `colorchannelmixer=aa=${num(clip.opacity)}`,
      ];
      filters.push(`[${inputIdx}:v]${vchain.join(",")}[ovsrc${ovIdx}]`);
      filters.push(
        `${videoLabel}[ovsrc${ovIdx}]overlay=x=${rect.left}:y=${rect.top}:enable='between(t,${num(start)},${num(end)})':eof_action=pass[ov${ovIdx}]`,
      );
      videoLabel = `[ov${ovIdx}]`;

      // audio de la capa: se retrasa a su timelineStart y se acumula para el amix
      const achain = [
        `atrim=start=${num(clip.trimIn)}:end=${num(clip.trimOut)}`,
        "asetpts=PTS-STARTPTS",
        ...atempoChain(clip.speed),
        `volume=${num(project.originalAudioVolume)}`,
        "aresample=44100",
        "aformat=channel_layouts=stereo",
        `adelay=${Math.round(start * 1000)}:all=1`,
      ];
      filters.push(`[${inputIdx}:a]${achain.join(",")}[ova${ovIdx}]`);
      overlayAudioLabels.push(`[ova${ovIdx}]`);
      ovIdx++;
    }
  }
```

> Nota: la cola en negro (`pushGap` para overlays que terminan tras el último clip
> base) y `totalDuration` ya consideran textos/imágenes; en esta fase NO se cambia
> `totalDuration` por las capas de vídeo (sus clips deberían caber dentro de la
> duración del proyecto; si una capa excede, queda fuera — se afina en una fase
> posterior si hace falta). Déjalo como está.

- [ ] **Step 4: Run hasta verde**

Run: `cd server && npx vitest run filterGraph`
Expected: PASS (los nuevos tests de multipista-vídeo + todos los existentes sin cambios).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/ffmpeg/filterGraph.ts server/src/services/ffmpeg/filterGraph.test.ts
git commit -m "feat(multipista): compositar el vídeo de las pistas superiores en el export"
```

---

## Task 2: Mezclar el AUDIO de las capas superiores

**Files:**
- Modify: `server/src/services/ffmpeg/filterGraph.ts`
- Test: `server/src/services/ffmpeg/filterGraph.test.ts`

El audio de cada clip de capa ya se generó en Task 1 como `[ovaN]` y se acumuló en
`overlayAudioLabels`. Ahora hay que incorporarlo al `amix` final. Regla (DEC-013):
las capas de vídeo son "voz" (volumen completo, NO se duckean); el ducking solo baja
la música bajo la voz combinada (base + capas).

- [ ] **Step 1: Tests del audio multipista**

```ts
describe("buildFilterGraph — multipista (audio)", () => {
  function twoTrackProject() {
    const p = projectWithClip(); // base clip-1 en [0,5)
    p.tracks.video.push({
      id: "t2", name: "", clips: [
        { ...createVideoClip("clip-2", 1, 6), trimIn: 0, trimOut: 3, opacity: 1, zoom: { x: 0.5, y: 0.5, scale: 0.4 } },
      ],
    });
    return p;
  }

  it("mezcla el audio de la capa (retrasado a su inicio) con el audio base", () => {
    const g = buildFilterGraph(twoTrackProject(), new Map([["clip-1", info], ["clip-2", info2]]));
    // audio de la capa: trim + adelay al timelineStart (1s = 1000ms)
    expect(g.filterComplex).toContain("adelay=1000:all=1[ova0]");
    // amix de voz = base + capa
    expect(g.filterComplex).toContain("[acat][ova0]amix=inputs=2:duration=first:normalize=0[voicemix]");
    expect(g.audioLabel).toBe("[voicemix]");
  });

  it("con música y ducking, la música baja bajo la voz combinada (base + capa)", () => {
    const p = twoTrackProject();
    p.settings.audioDucking = true;
    p.tracks.audio.push({ id: "a1", assetId: "m1", fileName: "m.mp3", volume: 0.8, start: 0, end: 5, trimIn: 0, trimOut: 5 });
    const g = buildFilterGraph(p, new Map([["clip-1", info], ["clip-2", info2]]));
    // se construye la voz combinada y la música se duckeа contra ella
    expect(g.filterComplex).toContain("[acat][ova0]amix=inputs=2:duration=first:normalize=0[voicemix]");
    expect(g.filterComplex).toContain("sidechaincompress");
    expect(g.audioLabel).toBe("[amix]");
  });

  it("una sola pista con música: salida de audio idéntica a la actual (sin voicemix)", () => {
    const p = projectWithClip();
    p.tracks.audio.push({ id: "a1", assetId: "m1", fileName: "m.mp3", volume: 0.8, start: 0, end: 5, trimIn: 0, trimOut: 5 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).not.toContain("voicemix");
    expect(g.filterComplex).toContain("[acat][mus0]amix=inputs=2:duration=first:normalize=0[amix]");
  });
});
```

- [ ] **Step 2: Run para ver fallar**

Run: `cd server && npx vitest run filterGraph -t "multipista (audio)"`
Expected: FAIL (no existe `[voicemix]`; el audio de la capa no se mezcla).

- [ ] **Step 3: Reescribir la sección de audio para incluir las capas**

Sustituye TODO el bloque de audio actual (desde `let audioLabel = "[acat]";` hasta el
cierre del `if (project.tracks.audio.length > 0) { ... }`) por esta versión, que es
idéntica en salida cuando NO hay capas de vídeo (`overlayAudioLabels` vacío):

```ts
  // ── Audio ──
  // "Voz" = audio base [acat] + audio de las capas de vídeo (volumen completo).
  // La música (si hay) se mezcla encima, con ducking opcional bajo la voz.
  let audioLabel = "[acat]";
  let voiceLabel = "[acat]";
  if (overlayAudioLabels.length > 0) {
    filters.push(
      `[acat]${overlayAudioLabels.join("")}amix=inputs=${overlayAudioLabels.length + 1}:duration=first:normalize=0[voicemix]`,
    );
    voiceLabel = "[voicemix]";
    audioLabel = "[voicemix]";
  }

  if (project.tracks.audio.length > 0) {
    const musLabels: string[] = [];
    project.tracks.audio.forEach((a, m) => {
      const inputIdx = inputs.length;
      inputs.push({ kind: "audio", fileName: a.fileName });
      const playDur = a.end - a.start;
      const chain = [
        `atrim=start=${num(a.trimIn)}:end=${num(a.trimIn + playDur)}`,
        "asetpts=PTS-STARTPTS",
        `volume=${num(a.volume)}`,
        "aresample=44100",
        "aformat=channel_layouts=stereo",
        `adelay=${Math.round(a.start * 1000)}:all=1`,
      ];
      filters.push(`[${inputIdx}:a]${chain.join(",")}[mus${m}]`);
      musLabels.push(`[mus${m}]`);
    });
    if (project.settings.audioDucking) {
      filters.push(`${voiceLabel}asplit=2[avoice][ascv]`);
      filters.push("[ascv]aresample=44100,aformat=channel_layouts=stereo[asc]");
      let musmix = musLabels[0];
      if (musLabels.length > 1) {
        filters.push(`${musLabels.join("")}amix=inputs=${musLabels.length}:duration=longest:normalize=0[musmix]`);
        musmix = "[musmix]";
      }
      filters.push(`${musmix}[asc]sidechaincompress=threshold=0.02:ratio=8:attack=5:release=250[ducked]`);
      filters.push("[avoice][ducked]amix=inputs=2:duration=first:normalize=0[amix]");
    } else {
      filters.push(
        `${voiceLabel}${musLabels.join("")}amix=inputs=${musLabels.length + 1}:duration=first:normalize=0[amix]`,
      );
    }
    audioLabel = "[amix]";
  }
```

> Verifica: cuando no hay capas (`voiceLabel = "[acat]"`) y sin música, `audioLabel`
> queda `[acat]` (idéntico). Con música y sin capas, las cadenas `[acat]...amix...[amix]`
> y la rama de ducking son textualmente iguales a las actuales → tests existentes pasan.

- [ ] **Step 4: Run hasta verde**

Run: `cd server && npx vitest run filterGraph`
Expected: PASS (audio multipista + todos los existentes).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/ffmpeg/filterGraph.ts server/src/services/ffmpeg/filterGraph.test.ts
git commit -m "feat(multipista): mezclar el audio de las capas de vídeo en el export"
```

---

## Task 3: Verificación e2e con FFmpeg real (2 pistas)

**Files:**
- Test/script: `server/src/services/ffmpeg/multitrackExport.e2e.test.ts` (nuevo) — o un script temporal si se prefiere no dejar test e2e permanente.

Objetivo: probar que el grafo generado para un proyecto de 2 pistas produce un MP4
válido con FFmpeg de verdad (no solo strings). Usa clips reales pequeños si existen en
`data/clips`; si no, genera dos con `ffmpeg lavfi/testsrc` en un tmp.

- [ ] **Step 1: Escribir el test e2e (saltable si no hay ffmpeg)**

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { createEmptyProject, createVideoClip, type ClipInfo } from "@clipforge/shared";
import { buildFilterGraph } from "./filterGraph.js";
import { ffmpegPath } from "../ffmpeg/ffmpegBin.js"; // AJUSTA al helper real que resuelve el binario de ffmpeg

describe("export multipista e2e", () => {
  it("dos pistas → MP4 válido con stream de audio", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-"));
    const a = path.join(dir, "a.mp4");
    const b = path.join(dir, "b.mp4");
    // genera dos vídeos de prueba con audio (5s y 3s)
    const gen = (out: string, dur: number, color: string, freq: number) =>
      execa(ffmpegPath, ["-y", "-f", "lavfi", "-i", `testsrc=size=320x240:rate=30:duration=${dur}`,
        "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${dur}`,
        "-pix_fmt", "yuv420p", "-shortest", out]);
    await gen(a, 5, "red", 440);
    await gen(b, 3, "blue", 880);

    const p = createEmptyProject("e2e");
    p.settings.width = 360; p.settings.height = 640; p.settings.fps = 30;
    p.tracks.video[0].clips.push({ ...createVideoClip("ca", 0, 5), trimIn: 0, trimOut: 5 });
    p.tracks.video.push({ id: "t2", name: "", clips: [
      { ...createVideoClip("cb", 1, 3), trimIn: 0, trimOut: 3, opacity: 0.9, zoom: { x: 0.5, y: 0.2, scale: 0.4 } },
    ]});
    const infos = new Map<string, ClipInfo>([
      ["ca", { id: "ca", url: "", title: "a", fileName: "a.mp4", duration: 5, width: 320, height: 240, createdAt: "" }],
      ["cb", { id: "cb", url: "", title: "b", fileName: "b.mp4", duration: 3, width: 320, height: 240, createdAt: "" }],
    ]);
    const graph = buildFilterGraph(p, infos);
    const out = path.join(dir, "out.mp4");
    const args = [
      "-y",
      ...graph.inputs.flatMap((i) => i.loop ? ["-stream_loop", "-1", "-i", path.join(dir, i.fileName)] : ["-i", path.join(dir, i.fileName)]),
      "-filter_complex", graph.filterComplex,
      "-map", graph.videoLabel, "-map", graph.audioLabel,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out,
    ];
    await execa(ffmpegPath, args);
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.statSync(out).size).toBeGreaterThan(1000);
  }, 60000);
});
```

> AJUSTES que el implementador debe resolver leyendo el código real:
> 1. Cómo se resuelve el binario de ffmpeg (busca en `server/src/services` el helper
>    que usa el export real — p. ej. `ffmpeg-static` o un path en `data/bin`). Usa ese
>    mismo mecanismo en lugar de `ffmpegBin.js` si el nombre difiere.
> 2. Cómo construye el export real los args (mira `exportJobs.ts`): replica el mapeo de
>    `inputs` (incluido `-stream_loop -1` para `loop:true`) para que el test refleje el
>    pipeline real.
> 3. Si en CI no hay ffmpeg, envuelve el test con un guard que lo salte
>    (`it.skipIf(!hasFfmpeg)`).

- [ ] **Step 2: Ejecutar el e2e**

Run: `cd server && npx vitest run multitrackExport`
Expected: PASS — genera `out.mp4` > 1KB. (Verifica además con ffprobe que tiene 1 stream de vídeo + 1 de audio si quieres reforzar.)

- [ ] **Step 3: Commit**

```bash
git add server/src/services/ffmpeg/multitrackExport.e2e.test.ts
git commit -m "test(multipista): export e2e con ffmpeg real de un proyecto de 2 pistas"
```

---

## Task 4: Verificación final de la fase

- [ ] **Step 1: Suite completa verde**

Run: `cd shared && npx vitest run` && `cd ../client && npx vitest run` && `cd ../server && npx vitest run`
Expected: PASS en los tres paquetes.

- [ ] **Step 2: Typecheck global**

Run: `cd shared && npx tsc --noEmit && cd ../client && npx tsc --noEmit && cd ../server && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Actualizar TODO.md y push**

Marca la Fase 2 como hecha en `TODO.md` (TASK-012) y `git push origin master`.

---

## Notas / riesgos

- **Sincronía de la capa:** `setpts=(PTS-STARTPTS)/speed+START/TB` coloca el primer
  fotograma de la capa en `START`; `overlay ... enable='between(t,START,END)'` la muestra
  solo en su ventana; `eof_action=pass` deja pasar la base cuando la capa acaba. Si en la
  verificación e2e la capa apareciera desfasada, revisar este `setpts` primero.
- **Audio de la capa:** `adelay` posiciona; el ducking NO afecta a las capas (DEC-013).
- **No-op en una pista:** confirmado por el test "una sola pista" en Tasks 1 y 2 — la
  salida debe ser idéntica a la de antes de la fase.
- Fases siguientes: Fase 3 (preview compositado), Fase 4 (timeline multipista: crear/
  borrar pistas, arrastre entre pistas), Fase 5 (opacidad en UI).
