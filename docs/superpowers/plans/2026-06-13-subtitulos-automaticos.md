# Subtítulos automáticos (karaoke) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transcribir el audio de un clip con whisper.cpp y mostrar subtítulos karaoke (frase visible, palabra activa resaltada) en la preview y en el MP4 exportado, editables en texto, tiempos y estilo.

**Architecture:** El modelo `Subtitles` (cues con palabras temporizadas + estilo global) vive en `shared/`. El servidor descarga whisper.cpp como binario, transcribe vía execa y devuelve cues por SSE; un parser puro convierte el JSON de whisper a cues y los lleva al tiempo de proyecto. La preview los pinta con Konva (resaltado por palabra) y el export genera un `.ass` que se quema con el filtro `ass` (libass) de FFmpeg.

**Tech Stack:** whisper.cpp (binario), modelo GGML, ffmpeg-static (ya trae libass — verificado), execa, Zod, Vitest. Sin dependencias npm nuevas.

**Git:** trabajo DIRECTO en `master`; cada tarea termina con commit (español, Conventional Commits, sin trailers) y `git push`.

---

## Verificaciones previas ya hechas (no repetir)

- **libass está en ffmpeg-static**: `ffmpeg -filters` incluye `ass` y `subtitles`. El export por ASS es viable; no hace falta fallback a drawtext.
- **whisper.cpp en Windows**: releases oficiales en `github.com/ggml-org/whisper.cpp/releases` con asset `whisper-bin-x64.zip` (contiene `whisper-cli.exe` + DLLs). Modelos GGML en `huggingface.co/ggerganov/whisper.cpp`. Requiere el Microsoft Visual C++ Redistributable (presente en la mayoría de Windows; si falta, el error se mostrará al transcribir).

## Decisiones de diseño del hito (fijadas aquí)

- **Cues = segmentos de whisper**; las palabras de cada cue salen de los tokens del JSON completo (`-ojf`). Tokens sub-palabra (sin espacio inicial) se fusionan en la palabra anterior; tokens especiales (`[_...]`) se descartan.
- **Tiempos en tiempo de PROYECTO**: el parser produce cues en tiempo de archivo y un paso posterior los mapea con `tProyecto = clip.timelineStart + (tArchivo − clip.trimIn) / clip.speed`, descartando palabras fuera de `[trimIn, trimOut]`.
- **Generar reemplaza**: cada "Generar subtítulos" sustituye TODAS las cues del proyecto (no acumula). Es una acción de historial (Ctrl+Z).
- **Estilo global** (uno para todos). **Selección** de cue para edición: `uiStore.selection.kind === "subtitle"` con el id de la cue; `removeElement`/poda tratan "subtitle" como caso especial (las cues viven en `project.subtitles.cues`, no en `tracks`).
- **El binario de whisper se descarga en zip y se extrae con `tar -xf`** (Windows 10+ trae bsdtar, soporta zip; evita dependencias y problemas de comillas). Tag de release y nombre del exe se **confirman en runtime** en la Task 6 (integración externa, igual que yt-dlp nightly).
- **Karaoke discreto en ASS**: cada palabra lleva un override `\t` que la pone en `highlight` durante su ventana y la devuelve a base — solo la palabra activa queda resaltada (no acumulativo).

## Estructura de ficheros (estado final)

```
shared/src/
└── subtitles.ts            # NUEVO: tipos + esquema Zod + estilo por defecto + factoría
client/src/
├── lib/subtitles.ts        # NUEVO: helpers puros (bounds, palabra activa, shift/scale/redistribuir) (TDD)
├── stores/projectStore.ts  # MOD: acciones de subtítulos
├── stores/uiStore.ts       # MOD: Tool "subtitles"
├── features/subtitles/
│   ├── SubtitlesPanel.tsx  # NUEVO: idioma, generar, lista editable, estilo, borrar
│   └── useTranscribe.ts    # NUEVO: cliente SSE de transcripción
├── features/preview/SubtitlesLayer.tsx  # NUEVO: karaoke en Konva
├── features/timeline/Timeline.tsx       # MOD: pista Subtítulos
├── components/ToolRail.tsx              # MOD: herramienta Subtítulos
└── components/AppShell.tsx              # MOD: monta SubtitlesPanel
server/src/
├── services/subtitles/
│   ├── parseWhisperJson.ts # NUEVO: JSON whisper → cues en tiempo de archivo (TDD)
│   ├── cuesToProjectTime.ts# NUEVO: cues → tiempo de proyecto por trim/speed (TDD)
│   ├── assSubtitles.ts      # NUEVO: cues+estilo → string .ass (TDD)
│   ├── whisperBinary.ts     # NUEVO: descarga/asegura whisper-cli.exe + modelo
│   └── transcribeJobs.ts    # NUEVO: extrae wav, ejecuta whisper, parsea; jobs+SSE
├── routes/subtitles.ts      # NUEVO: POST start, GET SSE, DELETE cancel
├── services/ffmpeg/filterGraph.ts  # MOD: filtro ass cuando hay cues
├── services/exportJobs.ts   # MOD: escribe el .ass temporal y lo pasa al builder
└── lib/paths.ts             # MOD: WHISPER_DIR / ruta del modelo si hace falta
```

---

### Task 1: Modelo de subtítulos en shared (TDD)

**Files:**
- Create: `shared/src/subtitles.ts`
- Modify: `shared/src/index.ts` (re-export), `shared/src/project.ts` (campo `subtitles` + default en `createEmptyProject`)
- Test: `shared/src/subtitles.test.ts`

- [ ] **Step 1: Test que falla** — `shared/src/subtitles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSubtitleCue, DEFAULT_SUBTITLE_STYLE, subtitlesSchema } from "./subtitles.js";

describe("subtitlesSchema", () => {
  it("acepta cues con palabras y el estilo por defecto", () => {
    const cue = createSubtitleCue([
      { text: "Hola", start: 0, end: 0.4 },
      { text: "mundo", start: 0.4, end: 0.9 },
    ]);
    const subs = { cues: [cue], style: DEFAULT_SUBTITLE_STYLE };
    expect(subtitlesSchema.safeParse(subs).success).toBe(true);
  });

  it("rechaza una cue sin palabras", () => {
    const subs = { cues: [{ id: "c1", words: [] }], style: DEFAULT_SUBTITLE_STYLE };
    expect(subtitlesSchema.safeParse(subs).success).toBe(false);
  });

  it("rechaza un color de estilo no hex", () => {
    const subs = { cues: [], style: { ...DEFAULT_SUBTITLE_STYLE, highlight: "rojo" } };
    expect(subtitlesSchema.safeParse(subs).success).toBe(false);
  });

  it("aplica el valor por defecto cuando subtitles está ausente", () => {
    const parsed = subtitlesSchema.parse(undefined);
    expect(parsed.cues).toEqual([]);
    expect(parsed.style.highlight).toBe("#9146ff");
  });
});
```

- [ ] **Step 2: Verificar FAIL** — `npm run test -w @clipforge/shared` → módulo no encontrado.

- [ ] **Step 3: Implementar `shared/src/subtitles.ts`**

```ts
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const subtitleWordSchema = z.object({
  text: z.string(),
  start: z.number().min(0),
  end: z.number().min(0),
});

export const subtitleCueSchema = z.object({
  id: z.string().min(1),
  words: z.array(subtitleWordSchema).min(1),
});

export const subtitleStyleSchema = z.object({
  fontFamily: z.string().min(1),
  fontSize: z.number().min(0.01).max(0.3), // fracción de la altura del lienzo
  fill: hex,
  highlight: hex,
  stroke: z.string().regex(/^$|^#[0-9a-f]{6}$/i),
  strokeWidth: z.number().min(0).max(0.1),
  y: z.number().min(0).max(1),
  uppercase: z.boolean(),
});

export const DEFAULT_SUBTITLE_STYLE = {
  fontFamily: "Impact",
  fontSize: 0.05,
  fill: "#ffffff",
  highlight: "#9146ff",
  stroke: "#000000",
  strokeWidth: 0.004,
  y: 0.82,
  uppercase: true,
} as const;

export const subtitlesSchema = z
  .object({
    cues: z.array(subtitleCueSchema),
    style: subtitleStyleSchema,
  })
  .default({ cues: [], style: { ...DEFAULT_SUBTITLE_STYLE } });

export type SubtitleWord = z.infer<typeof subtitleWordSchema>;
export type SubtitleCue = z.infer<typeof subtitleCueSchema>;
export type SubtitleStyle = z.infer<typeof subtitleStyleSchema>;
export type Subtitles = z.infer<typeof subtitlesSchema>;

export function createSubtitleCue(words: SubtitleWord[]): SubtitleCue {
  return { id: globalThis.crypto.randomUUID(), words };
}
```

- [ ] **Step 4: `shared/src/project.ts`** — importar `subtitlesSchema` y `DEFAULT_SUBTITLE_STYLE`, añadir al `projectSchema` el campo `subtitles: subtitlesSchema` (junto a `originalAudioVolume`), y en `createEmptyProject` añadir `subtitles: { cues: [], style: { ...DEFAULT_SUBTITLE_STYLE } }`. Importes desde `./subtitles.js`.

- [ ] **Step 5: `shared/src/index.ts`** — añadir `export * from "./subtitles.js";`

- [ ] **Step 6: Verificar** — `npm run test -w @clipforge/shared && npm run typecheck -w @clipforge/shared` (verde). Ajustar `project.test.ts` si algún `toEqual` de settings/proyecto se rompe por el nuevo campo (comparar campos sueltos como se hizo con `background`).

- [ ] **Step 7: Commit y push**

```bash
git add shared/src/subtitles.ts shared/src/subtitles.test.ts shared/src/project.ts shared/src/project.test.ts shared/src/index.ts
git commit -m "feat(shared): modelo de subtítulos (cues karaoke + estilo) con retrocompatibilidad"
git push
```

---

### Task 2: Helpers puros de subtítulos en el cliente (TDD)

**Files:**
- Create: `client/src/lib/subtitles.ts`
- Test: `client/src/lib/subtitles.test.ts`

- [ ] **Step 1: Test que falla** — `client/src/lib/subtitles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SubtitleCue } from "@clipforge/shared";
import {
  activeWordIndex,
  cueEnd,
  cueStart,
  redistributeWordTimes,
  scaleCueWords,
  shiftCueWords,
} from "./subtitles";

const cue: SubtitleCue = {
  id: "c1",
  words: [
    { text: "Hola", start: 1, end: 1.4 },
    { text: "mundo", start: 1.4, end: 2 },
  ],
};

describe("bounds y palabra activa", () => {
  it("cueStart/cueEnd usan la primera y última palabra", () => {
    expect(cueStart(cue)).toBe(1);
    expect(cueEnd(cue)).toBe(2);
  });

  it("activeWordIndex encuentra la palabra bajo el instante (o -1)", () => {
    expect(activeWordIndex(cue, 1.2)).toBe(0);
    expect(activeWordIndex(cue, 1.6)).toBe(1);
    expect(activeWordIndex(cue, 5)).toBe(-1);
  });
});

describe("shiftCueWords", () => {
  it("desplaza todas las palabras por delta sin bajar de 0", () => {
    const r = shiftCueWords(cue, 2);
    expect(r.words[0]).toEqual({ text: "Hola", start: 3, end: 3.4 });
    const back = shiftCueWords(cue, -5);
    expect(back.words[0].start).toBe(0); // recortado a 0
  });
});

describe("scaleCueWords", () => {
  it("remapea linealmente las palabras al nuevo rango", () => {
    const r = scaleCueWords(cue, 0, 4); // duración 1→4, x4
    expect(r.words[0]).toEqual({ text: "Hola", start: 0, end: 1.6 });
    expect(r.words[1]).toEqual({ text: "mundo", start: 1.6, end: 4 });
  });
});

describe("redistributeWordTimes", () => {
  it("reparte el rango de la cue entre las palabras del nuevo texto", () => {
    const r = redistributeWordTimes(cue, "uno dos tres");
    expect(r.words.map((w) => w.text)).toEqual(["uno", "dos", "tres"]);
    expect(r.words[0].start).toBe(1);
    expect(r.words[2].end).toBe(2);
    // tres palabras en [1,2] → ~0.333 cada una
    expect(r.words[1].start).toBeCloseTo(1.333, 2);
  });

  it("texto vacío deja una palabra vacía que cubre todo el rango", () => {
    const r = redistributeWordTimes(cue, "   ");
    expect(r.words).toHaveLength(1);
    expect(r.words[0]).toEqual({ text: "", start: 1, end: 2 });
  });
});
```

- [ ] **Step 2: Verificar FAIL** — `npm run test -w @clipforge/client`.

- [ ] **Step 3: Implementar `client/src/lib/subtitles.ts`**

```ts
import type { SubtitleCue, SubtitleWord } from "@clipforge/shared";

export function cueStart(c: SubtitleCue): number {
  return c.words[0].start;
}

export function cueEnd(c: SubtitleCue): number {
  return c.words[c.words.length - 1].end;
}

/** Índice de la palabra cuyo [start,end) contiene t, o -1. */
export function activeWordIndex(c: SubtitleCue, t: number): number {
  return c.words.findIndex((w) => t >= w.start && t < w.end);
}

/** Desplaza todas las palabras por delta (sin bajar de 0). */
export function shiftCueWords(c: SubtitleCue, delta: number): SubtitleCue {
  return {
    ...c,
    words: c.words.map((w) => ({
      text: w.text,
      start: Math.max(0, w.start + delta),
      end: Math.max(0, w.end + delta),
    })),
  };
}

/** Remapea linealmente los tiempos de las palabras al rango [newStart,newEnd]. */
export function scaleCueWords(c: SubtitleCue, newStart: number, newEnd: number): SubtitleCue {
  const oldStart = cueStart(c);
  const oldEnd = cueEnd(c);
  const span = oldEnd - oldStart || 1;
  const factor = (newEnd - newStart) / span;
  const map = (t: number) => newStart + (t - oldStart) * factor;
  return { ...c, words: c.words.map((w) => ({ text: w.text, start: map(w.start), end: map(w.end) })) };
}

/** Reparte el rango actual de la cue equitativamente entre las palabras del texto nuevo. */
export function redistributeWordTimes(c: SubtitleCue, text: string): SubtitleCue {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const start = cueStart(c);
  const end = cueEnd(c);
  if (tokens.length === 0) {
    return { ...c, words: [{ text: "", start, end }] };
  }
  const step = (end - start) / tokens.length;
  const words: SubtitleWord[] = tokens.map((t, i) => ({
    text: t,
    start: start + i * step,
    end: i === tokens.length - 1 ? end : start + (i + 1) * step,
  }));
  return { ...c, words };
}
```

- [ ] **Step 4: Verificar** — `npm run test -w @clipforge/client && npm run typecheck -w @clipforge/client` (verde).

- [ ] **Step 5: Commit y push**

```bash
git add client/src/lib/subtitles.ts client/src/lib/subtitles.test.ts
git commit -m "feat(client): helpers puros de subtítulos (bounds, palabra activa, shift/scale/redistribuir)"
git push
```

---

### Task 3: Parser del JSON de whisper.cpp → cues (TDD)

**Files:**
- Create: `server/src/services/subtitles/parseWhisperJson.ts`
- Test: `server/src/services/subtitles/parseWhisperJson.test.ts`

Contexto: whisper.cpp con `-ojf` (output-json-full) escribe `{ transcription: [ { offsets:{from,to}, text, tokens:[ { text, offsets:{from,to} }, ... ] }, ... ] }`. `offsets` en MILISEGUNDOS. Los tokens incluyen sub-palabras (sin espacio inicial → continúan la palabra anterior) y especiales (`text` que empieza por `[` → se descartan). Cada segmento del `transcription` es una cue.

- [ ] **Step 1: Test que falla** — `parseWhisperJson.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseWhisperJson } from "./parseWhisperJson.js";

const sample = {
  transcription: [
    {
      offsets: { from: 0, to: 1200 },
      text: " Hola mundo",
      tokens: [
        { text: "[_BEG_]", offsets: { from: 0, to: 0 } },
        { text: " Ho", offsets: { from: 0, to: 200 } },
        { text: "la", offsets: { from: 200, to: 400 } },
        { text: " mundo", offsets: { from: 400, to: 1200 } },
      ],
    },
    {
      offsets: { from: 1200, to: 2000 },
      text: " adiós",
      tokens: [{ text: " adiós", offsets: { from: 1200, to: 2000 } }],
    },
  ],
};

describe("parseWhisperJson", () => {
  it("agrupa tokens en palabras y segmentos en cues, en SEGUNDOS", () => {
    const cues = parseWhisperJson(JSON.stringify(sample));
    expect(cues).toHaveLength(2);
    expect(cues[0].words.map((w) => w.text)).toEqual(["Hola", "mundo"]);
    expect(cues[0].words[0]).toEqual({ text: "Hola", start: 0, end: 0.4 });
    expect(cues[0].words[1]).toEqual({ text: "mundo", start: 0.4, end: 1.2 });
    expect(cues[1].words[0]).toEqual({ text: "adiós", start: 1.2, end: 2 });
  });

  it("descarta tokens especiales y segmentos sin palabras reales", () => {
    const onlySpecial = {
      transcription: [
        { offsets: { from: 0, to: 100 }, text: "", tokens: [{ text: "[_TT_5]", offsets: { from: 0, to: 100 } }] },
      ],
    };
    expect(parseWhisperJson(JSON.stringify(onlySpecial))).toEqual([]);
  });

  it("lanza con JSON inválido", () => {
    expect(() => parseWhisperJson("{no json")).toThrow();
  });
});
```

- [ ] **Step 2: Verificar FAIL**.

- [ ] **Step 3: Implementar `parseWhisperJson.ts`**

```ts
import type { SubtitleCue, SubtitleWord } from "@clipforge/shared";

interface WhisperToken {
  text: string;
  offsets: { from: number; to: number };
}
interface WhisperSegment {
  offsets: { from: number; to: number };
  text: string;
  tokens: WhisperToken[];
}

/** Convierte la salida -ojf de whisper.cpp en cues (tiempo de ARCHIVO, segundos). */
export function parseWhisperJson(raw: string): SubtitleCue[] {
  const data = JSON.parse(raw) as { transcription?: WhisperSegment[] };
  const segments = data.transcription ?? [];
  const cues: SubtitleCue[] = [];

  segments.forEach((seg, i) => {
    const words: SubtitleWord[] = [];
    for (const tok of seg.tokens ?? []) {
      const t = tok.text;
      if (t.startsWith("[") || t.trim() === "") continue; // tokens especiales / vacíos
      const startsWord = t.startsWith(" ");
      const piece = t.trim();
      if (startsWord || words.length === 0) {
        words.push({ text: piece, start: tok.offsets.from / 1000, end: tok.offsets.to / 1000 });
      } else {
        // sub-palabra: se pega a la palabra anterior y extiende su fin
        const last = words[words.length - 1];
        last.text += piece;
        last.end = tok.offsets.to / 1000;
      }
    }
    if (words.length > 0) cues.push({ id: `cue-${i}`, words });
  });

  return cues;
}
```

- [ ] **Step 4: Verificar PASS**.

- [ ] **Step 5: Commit y push**

```bash
git add server/src/services/subtitles/parseWhisperJson.ts server/src/services/subtitles/parseWhisperJson.test.ts
git commit -m "feat(server): parser del JSON de whisper.cpp a cues con fusión de sub-palabras"
git push
```

---

### Task 4: Mapeo de cues al tiempo de proyecto (TDD)

**Files:**
- Create: `server/src/services/subtitles/cuesToProjectTime.ts`
- Test: `server/src/services/subtitles/cuesToProjectTime.test.ts`

El parser da cues en tiempo de archivo; hay que llevarlas al tiempo de la línea del proyecto según el clip, descartando lo que cae fuera del recorte.

- [ ] **Step 1: Test que falla** — `cuesToProjectTime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SubtitleCue, VideoClip } from "@clipforge/shared";
import { cuesToProjectTime } from "./cuesToProjectTime.js";

function clip(over: Partial<VideoClip>): VideoClip {
  return {
    id: "v1", clipId: "c1", timelineStart: 10, trimIn: 2, trimOut: 8, speed: 1,
    zoom: { x: 0.5, y: 0.5, scale: 1 },
    filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
    ...over,
  };
}

const cues: SubtitleCue[] = [
  { id: "a", words: [{ text: "fuera", start: 0, end: 1 }] }, // antes de trimIn=2 → se descarta
  { id: "b", words: [{ text: "dentro", start: 3, end: 5 }] }, // 3→ proyecto 10+(3-2)=11
];

describe("cuesToProjectTime", () => {
  it("desplaza al tiempo de proyecto y descarta palabras fuera del recorte", () => {
    const r = cuesToProjectTime(cues, clip({}));
    expect(r).toHaveLength(1);
    expect(r[0].words[0]).toEqual({ text: "dentro", start: 11, end: 13 });
  });

  it("la velocidad comprime los tiempos", () => {
    const r = cuesToProjectTime(
      [{ id: "b", words: [{ text: "x", start: 4, end: 6 }] }],
      clip({ speed: 2 }),
    );
    // start: 10 + (4-2)/2 = 11 ; end: 10 + (6-2)/2 = 12
    expect(r[0].words[0]).toEqual({ text: "x", start: 11, end: 12 });
  });

  it("recorta palabras parcialmente dentro al borde del recorte", () => {
    const r = cuesToProjectTime(
      [{ id: "b", words: [{ text: "borde", start: 1, end: 3 }] }], // 1<trimIn=2
      clip({}),
    );
    // start recortado a trimIn=2 → proyecto 10 ; end 3 → 11
    expect(r[0].words[0]).toEqual({ text: "borde", start: 10, end: 11 });
  });
});
```

- [ ] **Step 2: Verificar FAIL**.

- [ ] **Step 3: Implementar `cuesToProjectTime.ts`**

```ts
import type { SubtitleCue, VideoClip } from "@clipforge/shared";

/** Lleva cues en tiempo de archivo al tiempo de proyecto del clip,
 *  descartando lo que cae fuera de [trimIn, trimOut]. */
export function cuesToProjectTime(cues: SubtitleCue[], clip: VideoClip): SubtitleCue[] {
  const toProject = (fileT: number) =>
    clip.timelineStart + (clamp(fileT, clip.trimIn, clip.trimOut) - clip.trimIn) / clip.speed;

  const out: SubtitleCue[] = [];
  for (const cue of cues) {
    const words = cue.words
      // descarta palabras totalmente fuera del recorte
      .filter((w) => w.end > clip.trimIn && w.start < clip.trimOut)
      .map((w) => ({ text: w.text, start: toProject(w.start), end: toProject(w.end) }))
      .filter((w) => w.end > w.start);
    if (words.length > 0) out.push({ ...cue, words });
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
```

- [ ] **Step 4: Verificar PASS**.

- [ ] **Step 5: Commit y push**

```bash
git add server/src/services/subtitles/cuesToProjectTime.ts server/src/services/subtitles/cuesToProjectTime.test.ts
git commit -m "feat(server): mapeo de cues de subtítulos al tiempo de proyecto por trim y velocidad"
git push
```

---

### Task 5: Generador de subtítulos ASS (TDD)

**Files:**
- Create: `server/src/services/subtitles/assSubtitles.ts`
- Test: `server/src/services/subtitles/assSubtitles.test.ts`

ASS usa color `&HBBGGRR&` (BGR, sin alfa o con `&HAABBGGRR`). El tiempo de evento es `h:mm:ss.cs`. Para resaltar SOLO la palabra activa, cada palabra lleva un override `\t(tIni,tIni,\c<hl>)\t(tFin,tFin,\c<base>)` con tiempos en MS relativos al inicio de la línea: la palabra salta a `highlight` en su inicio y vuelve a base en su fin.

- [ ] **Step 1: Test que falla** — `assSubtitles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SubtitleCue, SubtitleStyle } from "@clipforge/shared";
import { hexToAssColor, toAssTime, buildAss } from "./assSubtitles.js";

const style: SubtitleStyle = {
  fontFamily: "Impact", fontSize: 0.05, fill: "#ffffff", highlight: "#9146ff",
  stroke: "#000000", strokeWidth: 0.004, y: 0.82, uppercase: true,
};

describe("hexToAssColor", () => {
  it("convierte #RRGGBB a &HBBGGRR&", () => {
    expect(hexToAssColor("#ffffff")).toBe("&HFFFFFF&");
    expect(hexToAssColor("#9146ff")).toBe("&HFF4691&");
  });
});

describe("toAssTime", () => {
  it("formatea segundos como h:mm:ss.cs", () => {
    expect(toAssTime(0)).toBe("0:00:00.00");
    expect(toAssTime(75.42)).toBe("0:01:15.42");
  });
});

describe("buildAss", () => {
  const cues: SubtitleCue[] = [
    { id: "c1", words: [
      { text: "Hola", start: 1, end: 1.5 },
      { text: "mundo", start: 1.5, end: 2 },
    ] },
  ];

  it("genera cabecera con PlayRes y una línea Dialogue por cue", () => {
    const ass = buildAss(cues, style, 1080, 1920);
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("Fontname: Impact");
    expect(ass).toContain("Dialogue: 0,0:00:01.00,0:00:02.00,");
    // palabra en MAYÚSCULAS por uppercase
    expect(ass).toContain("HOLA");
    expect(ass).toContain("MUNDO");
    // override de resaltado por palabra (ms relativos: Hola 0–500, mundo 500–1000)
    expect(ass).toContain("\\t(0,0,\\c&HFF4691&)");
    expect(ass).toContain("\\t(500,500,\\c&HFFFFFF&)");
  });
});
```

- [ ] **Step 2: Verificar FAIL**.

- [ ] **Step 3: Implementar `assSubtitles.ts`**

```ts
import type { SubtitleCue, SubtitleStyle } from "@clipforge/shared";

/** #RRGGBB → &HBBGGRR& (ASS usa BGR). */
export function hexToAssColor(hex: string): string {
  const h = hex.replace(/^#/, "");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `&H${b}${g}${r}&`.toUpperCase();
}

/** segundos → h:mm:ss.cs */
export function toAssTime(s: number): string {
  const cs = Math.round(s * 100);
  const centis = cs % 100;
  const totalSec = Math.floor(cs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  const hr = Math.floor(totalSec / 3600);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${hr}:${p2(min)}:${p2(sec)}.${p2(centis)}`;
}

function escapeAssText(t: string): string {
  // en ASS las llaves abren overrides; se neutralizan
  return t.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")");
}

/** Genera un fichero .ass completo con karaoke discreto (palabra activa resaltada). */
export function buildAss(
  cues: SubtitleCue[],
  style: SubtitleStyle,
  W: number,
  H: number,
): string {
  const fontSize = Math.round(style.fontSize * H);
  const outline = Math.max(0, Math.round(style.strokeWidth * H));
  const marginV = Math.round((1 - style.y) * H);
  const primary = hexToAssColor(style.fill);
  const outlineColor = hexToAssColor(style.stroke || "#000000");

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Outline, Alignment, MarginL, MarginR, MarginV",
    // Alignment 2 = inferior-centro; Bold -1 = sí
    `Style: Def, ${style.fontFamily}, ${fontSize}, ${primary}, ${outlineColor}, &H00000000&, -1, ${outline}, 2, 40, 40, ${marginV}`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const hl = hexToAssColor(style.highlight);
  const base = primary;

  const events = cues.map((cue) => {
    const start = cue.words[0].start;
    const end = cue.words[cue.words.length - 1].end;
    const text = cue.words
      .map((w) => {
        const relStart = Math.round((w.start - start) * 1000);
        const relEnd = Math.round((w.end - start) * 1000);
        const label = style.uppercase ? w.text.toUpperCase() : w.text;
        // salta a highlight en su ventana y vuelve a base al acabar
        return `{\\t(${relStart},${relStart},\\c${hl})\\t(${relEnd},${relEnd},\\c${base})}${escapeAssText(label)}`;
      })
      .join(" ");
    return `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Def,,0,0,0,,${text}`;
  });

  return [...header, ...events].join("\n");
}
```

- [ ] **Step 4: Verificar PASS**. Nota: `hexToAssColor("#9146ff")` → b=ff,g=46,r=91 → `&HFF4691&` (coincide con el test).

- [ ] **Step 5: Commit y push**

```bash
git add server/src/services/subtitles/assSubtitles.ts server/src/services/subtitles/assSubtitles.test.ts
git commit -m "feat(server): generador de subtítulos ASS con karaoke discreto por palabra"
git push
```

---

### Task 6: Gestión del binario de whisper.cpp

**Files:**
- Create: `server/src/services/subtitles/whisperBinary.ts`
- Modify: `server/src/lib/paths.ts` (rutas si hace falta; usar `BIN_DIR` existente)

Patrón calcado de `services/binaries.ts` (fetch + pipeline a fichero). El binario viene en zip y se extrae con `tar -xf` (bsdtar de Windows soporta zip). El modelo es un `.bin` directo.

- [ ] **Step 1: Implementar `whisperBinary.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { execa } from "execa";
import { BIN_DIR } from "../../lib/paths.js";

// Release fijado; CONFIRMAR en runtime (Step 2) que el asset y el nombre del exe existen
const WHISPER_ZIP_URL =
  "https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.5/whisper-bin-x64.zip";
const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";

const WHISPER_DIR = path.join(BIN_DIR, "whisper");
export const whisperExe = path.join(WHISPER_DIR, "whisper-cli.exe");
export const whisperModel = path.join(WHISPER_DIR, "ggml-base.bin");

export type WhisperStatus =
  | { ready: true }
  | { ready: false; step: "missing" | "downloading" | "error"; message?: string };

let status: WhisperStatus = { ready: false, step: "missing" };
export function getWhisperStatus(): WhisperStatus {
  return status;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Descarga fallida (${res.status}): ${url}`);
  const tmp = `${dest}.tmp`;
  try {
    await pipeline(Readable.fromWeb(res.body as WebReadableStream), fs.createWriteStream(tmp));
    fs.renameSync(tmp, dest);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/** Asegura whisper-cli.exe + modelo. Idempotente; seguro llamar varias veces. */
export async function ensureWhisper(): Promise<void> {
  if (fs.existsSync(whisperExe) && fs.existsSync(whisperModel)) {
    status = { ready: true };
    return;
  }
  try {
    status = { ready: false, step: "downloading" };
    fs.mkdirSync(WHISPER_DIR, { recursive: true });
    if (!fs.existsSync(whisperExe)) {
      const zip = path.join(WHISPER_DIR, "whisper.zip");
      await download(WHISPER_ZIP_URL, zip);
      // bsdtar (Windows 10+) extrae zip; -C destino
      await execa("tar", ["-xf", zip, "-C", WHISPER_DIR]);
      fs.rmSync(zip, { force: true });
      // algunos releases anidan en subcarpeta o llaman al exe "main.exe":
      // localizar el ejecutable y normalizar a whisper-cli.exe
      if (!fs.existsSync(whisperExe)) {
        const found = findExe(WHISPER_DIR);
        if (!found) throw new Error("No se encontró el ejecutable de whisper en el zip");
        fs.copyFileSync(found, whisperExe);
      }
    }
    if (!fs.existsSync(whisperModel)) {
      await download(MODEL_URL, whisperModel);
    }
    status = { ready: true };
  } catch (err) {
    status = { ready: false, step: "error", message: err instanceof Error ? err.message : "Error" };
    throw err;
  }
}

/** Busca recursivamente whisper-cli.exe o main.exe dentro de dir. */
function findExe(dir: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findExe(full);
      if (nested) return nested;
    } else if (/^(whisper-cli|main)\.exe$/i.test(entry.name)) {
      return full;
    }
  }
  return null;
}
```

- [ ] **Step 2: Verificación manual del binario** (integración externa)

Run en una terminal del usuario (no del agente si requiere red interactiva):
```powershell
# confirmar que el asset existe y ver el nombre real del exe dentro
curl.exe -sL -o "$env:TEMP\w.zip" "https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.5/whisper-bin-x64.zip"
tar -tf "$env:TEMP\w.zip" | findstr /i ".exe"
```
Expected: lista que incluye `whisper-cli.exe` (o `main.exe`) + DLLs. Si el tag `v1.7.5` o el nombre del asset han cambiado, actualizar `WHISPER_ZIP_URL` al release vigente de github.com/ggml-org/whisper.cpp/releases. `findExe` ya cubre que el exe se llame `main.exe`.

- [ ] **Step 3: Typecheck + commit y push**

Run: `npm run typecheck -w @clipforge/server`

```bash
git add server/src/services/subtitles/whisperBinary.ts server/src/lib/paths.ts
git commit -m "feat(server): descarga y gestión del binario whisper.cpp y su modelo"
git push
```

---

### Task 7: Servicio de transcripción y rutas con SSE

**Files:**
- Create: `server/src/services/subtitles/transcribeJobs.ts`, `server/src/routes/subtitles.ts`
- Modify: `server/src/index.ts` (registrar `subtitleRoutes`)

Reutiliza el patrón de `exportJobs.ts` (jobs en memoria + listeners SSE) y de `download.ts` (execa + ffmpeg).

- [ ] **Step 1: Implementar `transcribeJobs.ts`**

```ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import type { SubtitleCue, VideoClip } from "@clipforge/shared";
import { CLIPS_DIR, EXPORTS_DIR } from "../../lib/paths.js";
import { ffmpegBin } from "../binaries.js";
import { ensureWhisper, whisperExe, whisperModel } from "./whisperBinary.js";
import { parseWhisperJson } from "./parseWhisperJson.js";
import { cuesToProjectTime } from "./cuesToProjectTime.js";

export type SubtitleJobState = "running" | "done" | "error" | "cancelled";

export interface SubtitleJob {
  jobId: string;
  state: SubtitleJobState;
  cues?: SubtitleCue[];
  error?: string;
  listeners: Set<() => void>;
  cancelled: boolean;
}

const jobs = new Map<string, SubtitleJob>();
export function getSubtitleJob(id: string): SubtitleJob | undefined {
  return jobs.get(id);
}
function notify(j: SubtitleJob): void {
  for (const fn of j.listeners) fn();
}

/** Transcribe el audio del clip y devuelve cues en tiempo de proyecto. */
export function startTranscription(clip: VideoClip, fileName: string, language?: string): SubtitleJob {
  const job: SubtitleJob = {
    jobId: crypto.randomUUID(),
    state: "running",
    listeners: new Set(),
    cancelled: false,
  };
  jobs.set(job.jobId, job);

  void run(job, clip, fileName, language).catch((err) => {
    if (job.cancelled) return;
    job.state = "error";
    job.error = err instanceof Error ? err.message : "Error en la transcripción";
    notify(job);
  });

  return job;
}

async function run(job: SubtitleJob, clip: VideoClip, fileName: string, language?: string): Promise<void> {
  await ensureWhisper();
  if (job.cancelled) return;

  const wav = path.join(EXPORTS_DIR, `subs-${job.jobId}.wav`);
  const outPrefix = path.join(EXPORTS_DIR, `subs-${job.jobId}`);
  try {
    // 1) extraer audio del clip a WAV 16kHz mono (lo que espera whisper.cpp)
    await execa(ffmpegBin, [
      "-y", "-i", path.join(CLIPS_DIR, fileName),
      "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav,
    ]);
    if (job.cancelled) return;

    // 2) whisper.cpp → JSON completo (segmentos + tokens con tiempos)
    const args = [
      "-m", whisperModel, "-f", wav, "-oj", "-ojf", "-of", outPrefix,
      ...(language && language !== "auto" ? ["-l", language] : ["-l", "auto"]),
    ];
    await execa(whisperExe, args);
    if (job.cancelled) return;

    // 3) parsear y mapear al tiempo de proyecto
    const raw = fs.readFileSync(`${outPrefix}.json`, "utf8");
    const fileCues = parseWhisperJson(raw);
    job.cues = cuesToProjectTime(fileCues, clip);
    job.state = "done";
    notify(job);
  } finally {
    fs.rmSync(wav, { force: true });
    fs.rmSync(`${outPrefix}.json`, { force: true });
  }
}

export function cancelTranscription(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.state !== "running") return false;
  job.cancelled = true;
  job.state = "cancelled";
  notify(job);
  return true;
}
```

- [ ] **Step 2: Implementar `routes/subtitles.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SubtitleCue } from "@clipforge/shared";
import { listClips } from "../services/clipsRegistry.js";
import {
  cancelTranscription,
  getSubtitleJob,
  startTranscription,
} from "../services/subtitles/transcribeJobs.js";

const startBody = z.object({
  // clip de vídeo del proyecto a transcribir (su clipId + datos de recorte)
  clip: z.object({
    id: z.string(), clipId: z.string(), timelineStart: z.number(), trimIn: z.number(),
    trimOut: z.number(), speed: z.number(),
    zoom: z.object({ x: z.number(), y: z.number(), scale: z.number() }),
    filters: z.object({
      brightness: z.number(), contrast: z.number(), saturation: z.number(),
      hue: z.number(), grayscale: z.number(),
    }),
  }),
  language: z.string().optional(),
});

type SubtitleEvent =
  | { type: "done"; cues: SubtitleCue[] }
  | { type: "error"; message: string };

export function subtitleRoutes(app: FastifyInstance): void {
  app.post("/api/subtitles", async (req, reply) => {
    const parsed = startBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Petición no válida" });
    const info = listClips().find((c) => c.id === parsed.data.clip.clipId);
    if (!info) return reply.code(404).send({ error: "Clip no encontrado" });
    const job = startTranscription(parsed.data.clip, info.fileName, parsed.data.language);
    return { jobId: job.jobId };
  });

  app.get<{ Params: { jobId: string } }>("/api/subtitles/:jobId/progress", (req, reply) => {
    const job = getSubtitleJob(req.params.jobId);
    if (!job) return reply.code(404).send({ error: "Job no encontrado" });
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const send = (e: SubtitleEvent) => reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      job.listeners.delete(push);
      reply.raw.end();
    };
    const push = () => {
      if (job.state === "done") {
        send({ type: "done", cues: job.cues ?? [] });
        cleanup();
      } else if (job.state === "error" || job.state === "cancelled") {
        send({ type: "error", message: job.error ?? "Transcripción cancelada" });
        cleanup();
      }
      // running: aún no se emite nada (whisper no da progreso fino)
    };
    job.listeners.add(push);
    req.raw.on("close", () => job.listeners.delete(push));
    push();
  });

  app.delete<{ Params: { jobId: string } }>("/api/subtitles/:jobId", async (req, reply) => {
    if (!cancelTranscription(req.params.jobId)) {
      return reply.code(404).send({ error: "Job no encontrado o ya terminado" });
    }
    return reply.code(204).send();
  });
}
```

- [ ] **Step 3: Registrar en `server/src/index.ts`** — `import { subtitleRoutes } from "./routes/subtitles.js";` y `subtitleRoutes(app);`.

- [ ] **Step 4: Verificación manual con un clip real**

Con `npm run dev` (background) y un clip descargado:
```powershell
$clip = (Invoke-WebRequest -Uri http://127.0.0.1:3001/api/clips -UseBasicParsing).Content | ConvertFrom-Json | Select-Object -First 1
$body = @{ clip = @{ id="v1"; clipId=$clip.id; timelineStart=0; trimIn=0; trimOut=8; speed=1; zoom=@{x=0.5;y=0.5;scale=1}; filters=@{brightness=0;contrast=1;saturation=1;hue=0;grayscale=0} }; language="auto" } | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText("$env:TEMP\subs.json", $body)
$r = curl.exe -s -X POST http://127.0.0.1:3001/api/subtitles -H "content-type: application/json" -d "@$env:TEMP\subs.json"
$job = ($r | ConvertFrom-Json).jobId
curl.exe -N -s --max-time 300 "http://127.0.0.1:3001/api/subtitles/$job/progress"
```
Expected: la primera vez descarga whisper + modelo (puede tardar), luego un evento `data: {"type":"done","cues":[...]}` con frases y palabras temporizadas. Parar el servidor.

- [ ] **Step 5: Commit y push**

```bash
git add server/src/services/subtitles/transcribeJobs.ts server/src/routes/subtitles.ts server/src/index.ts
git commit -m "feat(server): transcripción de subtítulos con whisper, progreso SSE y cancelación"
git push
```

---

### Task 8: Subtítulos en el export (ASS + libass) (TDD)

**Files:**
- Modify: `server/src/services/ffmpeg/filterGraph.ts` (filtro `ass` cuando hay cues)
- Modify: `server/src/services/exportJobs.ts` (escribir el `.ass` temporal y pasarlo al builder)
- Test: caso nuevo en `server/src/services/ffmpeg/filterGraph.test.ts`

- [ ] **Step 1: Test que falla** (añadir a `filterGraph.test.ts`):

```ts
it("añade el filtro ass cuando se pasa la ruta del .ass y hay cues", () => {
  const p = projectWithClip();
  p.subtitles.cues.push({ id: "c1", words: [{ text: "Hola", start: 0, end: 1 }] });
  const g = buildFilterGraph(p, new Map([["clip-1", info]]), "C:/data/exports/subs.ass");
  expect(g.filterComplex).toContain("ass='C\\:/data/exports/subs.ass'");
});

it("sin cues no añade filtro ass aunque se pase ruta", () => {
  const g = buildFilterGraph(projectWithClip(), new Map([["clip-1", info]]), "C:/x/subs.ass");
  expect(g.filterComplex).not.toContain("ass=");
});
```

(Nota: el test usa `p.subtitles` — `projectWithClip` parte de `createEmptyProject`, que ya trae `subtitles: { cues: [], style }` por la Task 1.)

- [ ] **Step 2: Implementar en `filterGraph.ts`**

Añadir un tercer parámetro opcional `assPath?: string` a `buildFilterGraph`. Tras el bloque de textos (antes de la música), si `project.subtitles.cues.length > 0 && assPath`:

```ts
// Subtítulos ASS quemados con libass. Ruta escapada como las fuentes drawtext.
if (project.subtitles.cues.length > 0 && assPath) {
  const escaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  filters.push(`${videoLabel}ass='${escaped}'[subs]`);
  videoLabel = "[subs]";
}
```

(`videoLabel` ya es la última etiqueta de vídeo tras overlays/textos.)

- [ ] **Step 3: `exportJobs.ts`** — antes de construir los args, si hay cues, generar y escribir el `.ass`:

```ts
import { buildAss } from "./subtitles/assSubtitles.js";
// ...
let assPath: string | undefined;
if (project.subtitles.cues.length > 0) {
  assPath = path.join(EXPORTS_DIR, `${job.jobId}.ass`);
  fs.writeFileSync(assPath, buildAss(project.subtitles.cues, project.subtitles.style, project.settings.width, project.settings.height));
}
const graph = buildFilterGraph(project, clipInfos);
const args = buildFfmpegArgs(graph, preset, project.settings.fps, outPath, { videoDir: CLIPS_DIR, imageDir: ASSETS_DIR });
```

→ pasar `assPath` al builder: `const graph = buildFilterGraph(project, clipInfos, assPath);`. Y borrar el `.ass` en el `finally`/al terminar el job (junto a la limpieza del parcial): `if (assPath) fs.rmSync(assPath, { force: true });` en las ramas done/error/cancel.

- [ ] **Step 4: Tests + typecheck**

Run: `npm run test -w @clipforge/server && npm run typecheck -w @clipforge/server` (verde).

- [ ] **Step 5: Verificación manual** — export real de un proyecto con cues; comprobar con ffprobe que el MP4 sale a la resolución correcta y, abriéndolo, que los subtítulos karaoke aparecen quemados. (Se cubre en la Task 13 e2e; aquí basta con que el export no falle.)

- [ ] **Step 6: Commit y push**

```bash
git add server/src/services/ffmpeg/filterGraph.ts server/src/services/ffmpeg/filterGraph.test.ts server/src/services/exportJobs.ts
git commit -m "feat(server): subtítulos quemados en el export con el filtro ass de libass"
git push
```

---

### Task 9: Acciones de subtítulos en el store y cliente SSE

**Files:**
- Modify: `client/src/stores/projectStore.ts` (acciones), `client/src/stores/uiStore.ts` (Tool + ElementKind)
- Create: `client/src/features/subtitles/useTranscribe.ts`
- Test: casos en `client/src/stores/projectStore.test.ts`

- [ ] **Step 1: `uiStore.ts`** — `Tool` añade `"subtitles"`. (ElementKind para selección de cue se trata aparte: añadir `"subtitle"` al tipo `ElementKind` en projectStore.)

- [ ] **Step 2: Tests que fallan** (añadir a `projectStore.test.ts`):

```ts
import type { SubtitleCue } from "@clipforge/shared";

describe("subtítulos", () => {
  const cues: SubtitleCue[] = [
    { id: "c1", words: [{ text: "Hola", start: 0, end: 1 }] },
    { id: "c2", words: [{ text: "mundo", start: 1, end: 2 }] },
  ];

  it("setSubtitleCues reemplaza todas las cues (con undo)", () => {
    const s = useProjectStore.getState();
    s.setSubtitleCues(cues);
    expect(useProjectStore.getState().project.subtitles.cues).toHaveLength(2);
    s.setSubtitleCues([cues[0]]);
    expect(useProjectStore.getState().project.subtitles.cues).toHaveLength(1);
    s.undo();
    expect(useProjectStore.getState().project.subtitles.cues).toHaveLength(2);
  });

  it("updateCueText redistribuye los tiempos entre las palabras nuevas", () => {
    const s = useProjectStore.getState();
    s.setSubtitleCues(cues);
    s.updateCueText("c1", "a b");
    const cue = useProjectStore.getState().project.subtitles.cues[0];
    expect(cue.words.map((w) => w.text)).toEqual(["a", "b"]);
    expect(cue.words[0].start).toBe(0);
    expect(cue.words[1].end).toBe(1);
  });

  it("moveCue desplaza las palabras y removeCue la elimina", () => {
    const s = useProjectStore.getState();
    s.setSubtitleCues(cues);
    s.moveCue("c2", 5);
    const c2 = useProjectStore.getState().project.subtitles.cues[1];
    expect(c2.words[0].start).toBe(5); // estaba en 1 → +4
    s.removeCue("c1");
    expect(useProjectStore.getState().project.subtitles.cues.map((c) => c.id)).toEqual(["c2"]);
  });

  it("setSubtitleStyle y clearSubtitles", () => {
    const s = useProjectStore.getState();
    s.setSubtitleCues(cues);
    s.setSubtitleStyle({ uppercase: false });
    expect(useProjectStore.getState().project.subtitles.style.uppercase).toBe(false);
    s.clearSubtitles();
    expect(useProjectStore.getState().project.subtitles.cues).toEqual([]);
  });
});
```

- [ ] **Step 3: Implementar en `projectStore.ts`** — importar helpers de `../lib/subtitles` y tipos. Añadir a la interfaz y la implementación (vía `mutate`):

```ts
// interfaz
setSubtitleCues: (cues: SubtitleCue[]) => void;
updateCueText: (id: string, text: string) => void;
moveCue: (id: string, newStart: number, opts?: MutateOptions) => void;
trimCue: (id: string, edge: "start" | "end", t: number, opts?: MutateOptions) => void;
removeCue: (id: string) => void;
setSubtitleStyle: (patch: Partial<SubtitleStyle>) => void;
clearSubtitles: () => void;
```

```ts
setSubtitleCues: (cues) => mutate((d) => void (d.subtitles.cues = cues)),

updateCueText: (id, text) =>
  mutate((d) => {
    const i = d.subtitles.cues.findIndex((c) => c.id === id);
    if (i !== -1) d.subtitles.cues[i] = redistributeWordTimes(d.subtitles.cues[i], text);
  }),

moveCue: (id, newStart, opts) =>
  mutate((d) => {
    const i = d.subtitles.cues.findIndex((c) => c.id === id);
    if (i === -1) return;
    const delta = Math.max(0, newStart) - cueStart(d.subtitles.cues[i]);
    d.subtitles.cues[i] = shiftCueWords(d.subtitles.cues[i], delta);
  }, opts),

trimCue: (id, edge, t, opts) =>
  mutate((d) => {
    const i = d.subtitles.cues.findIndex((c) => c.id === id);
    if (i === -1) return;
    const c = d.subtitles.cues[i];
    const start = edge === "start" ? Math.min(t, cueEnd(c) - 0.1) : cueStart(c);
    const end = edge === "end" ? Math.max(t, cueStart(c) + 0.1) : cueEnd(c);
    d.subtitles.cues[i] = scaleCueWords(c, start, end);
  }, opts),

removeCue: (id) =>
  mutate((d) => {
    d.subtitles.cues = d.subtitles.cues.filter((c) => c.id !== id);
  }),

setSubtitleStyle: (patch) =>
  mutate((d) => void Object.assign(d.subtitles.style, patch)),

clearSubtitles: () => mutate((d) => void (d.subtitles.cues = [])),
```

(imports: `import { cueStart, cueEnd, redistributeWordTimes, scaleCueWords, shiftCueWords } from "../lib/subtitles";` y `SubtitleCue, SubtitleStyle` de shared. `ElementKind` añade `"subtitle"`; en `pruneSelection` y `removeElement` tratar `"subtitle"` mirando `project.subtitles.cues` en vez de `tracks` — p. ej. en `removeElement`: `if (kind === "subtitle") { d.subtitles.cues = d.subtitles.cues.filter(c => c.id !== id); return; }`, y en `pruneSelection` comprobar cues cuando `sel.kind === "subtitle"`.)

- [ ] **Step 4: Crear `useTranscribe.ts`** (cliente SSE, espejo de `useExport`):

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { SubtitleCue, VideoClip } from "@clipforge/shared";

export type TranscribePhase =
  | { phase: "idle" }
  | { phase: "running"; jobId: string }
  | { phase: "error"; message: string };

export function useTranscribe(onCues: (cues: SubtitleCue[]) => void) {
  const [state, setState] = useState<TranscribePhase>({ phase: "idle" });
  const sourceRef = useRef<EventSource | null>(null);
  useEffect(() => () => sourceRef.current?.close(), []);

  const start = useCallback(
    async (clip: VideoClip, language: string) => {
      try {
        const res = await fetch("/api/subtitles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clip, language }),
        });
        if (!res.ok) {
          const b = (await res.json()) as { error: string };
          throw new Error(b.error);
        }
        const { jobId } = (await res.json()) as { jobId: string };
        setState({ phase: "running", jobId });
        const src = new EventSource(`/api/subtitles/${jobId}/progress`);
        sourceRef.current = src;
        src.onmessage = (e) => {
          const ev = JSON.parse(e.data) as
            | { type: "done"; cues: SubtitleCue[] }
            | { type: "error"; message: string };
          src.close();
          sourceRef.current = null;
          if (ev.type === "done") {
            onCues(ev.cues);
            setState({ phase: "idle" });
          } else {
            setState({ phase: "error", message: ev.message });
          }
        };
        src.onerror = () => {
          src.close();
          sourceRef.current = null;
          setState((s) => (s.phase === "running" ? { phase: "error", message: "Se perdió la conexión" } : s));
        };
      } catch (err) {
        setState({ phase: "error", message: err instanceof Error ? err.message : "Error" });
      }
    },
    [onCues],
  );

  const cancel = useCallback(async () => {
    if (state.phase !== "running") return;
    sourceRef.current?.close();
    sourceRef.current = null;
    await fetch(`/api/subtitles/${state.jobId}`, { method: "DELETE" });
    setState({ phase: "idle" });
  }, [state]);

  return { state, start, cancel };
}
```

- [ ] **Step 5: Tests + typecheck + commit y push**

Run: `npm run test -w @clipforge/client && npm run typecheck -w @clipforge/client`

```bash
git add client/src/stores/projectStore.ts client/src/stores/projectStore.test.ts client/src/stores/uiStore.ts client/src/features/subtitles/useTranscribe.ts
git commit -m "feat(client): acciones de subtítulos en el store y cliente SSE de transcripción"
git push
```

---

### Task 10: Render karaoke en la preview (Konva)

**Files:**
- Create: `client/src/features/preview/SubtitlesLayer.tsx`
- Modify: `client/src/features/preview/OverlayLayer.tsx` (montar la capa)

- [ ] **Step 1: Crear `SubtitlesLayer.tsx`**

```tsx
import { useEffect, useRef } from "react";
import Konva from "konva";
import { Text as KonvaText } from "react-konva";
import { activeWordIndex, cueEnd, cueStart } from "../../lib/subtitles";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

interface SubtitlesLayerProps {
  width: number;
  height: number;
}

/** Pinta la cue activa centrada; resalta la palabra bajo el playhead. Solo lectura. */
export function SubtitlesLayer({ width, height }: SubtitlesLayerProps) {
  const playhead = useUiStore((s) => s.playhead);
  const cues = useProjectStore((s) => s.project.subtitles.cues);
  const style = useProjectStore((s) => s.project.subtitles.style);
  const ref = useRef<Konva.Text>(null);

  const cue = cues.find((c) => playhead >= cueStart(c) && playhead < cueEnd(c));
  const activeIdx = cue ? activeWordIndex(cue, playhead) : -1;

  // centra el bloque de texto horizontalmente tras medir
  useEffect(() => {
    const node = ref.current;
    if (node) node.offsetX(node.width() / 2);
  });

  if (!cue) return null;

  const fontSize = style.fontSize * height;
  // Konva.Text con segmentos de color por palabra usa un solo color; para el
  // resaltado por palabra pintamos cada palabra como su propio Text en fila.
  // Para simplicidad y robustez de medida, usamos un único Text con la palabra
  // activa marcada vía textos individuales posicionados en una fila centrada.
  const words = cue.words.map((w) => (style.uppercase ? w.text.toUpperCase() : w.text));

  return (
    <WordRow
      words={words}
      activeIdx={activeIdx}
      width={width}
      y={style.y * height}
      fontSize={fontSize}
      fontFamily={style.fontFamily}
      fill={style.fill}
      highlight={style.highlight}
      stroke={style.stroke}
      strokeWidth={style.strokeWidth * height}
    />
  );
}
```

Como Konva no resalta una palabra dentro de un `Text` multicolor, se pinta una **fila de `Text` por palabra** y se centra el conjunto midiendo anchos. Añadir el sub-componente `WordRow` en el mismo fichero:

```tsx
function WordRow({
  words, activeIdx, width, y, fontSize, fontFamily, fill, highlight, stroke, strokeWidth,
}: {
  words: string[]; activeIdx: number; width: number; y: number; fontSize: number;
  fontFamily: string; fill: string; highlight: string; stroke: string; strokeWidth: number;
}) {
  // medir cada palabra para colocarlas en fila y centrar el conjunto
  const space = fontSize * 0.3;
  const widths = words.map((w) => measureText(w, fontSize, fontFamily));
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let x = width / 2 - total / 2;
  return (
    <>
      {words.map((w, i) => {
        const node = (
          <KonvaText
            key={i}
            text={w}
            x={x}
            y={y - fontSize / 2}
            fontSize={fontSize}
            fontFamily={fontFamily}
            fontStyle="bold"
            fill={i === activeIdx ? highlight : fill}
            stroke={stroke || undefined}
            strokeWidth={strokeWidth}
            fillAfterStrokeEnabled
            listening={false}
          />
        );
        x += widths[i] + space;
        return node;
      })}
    </>
  );
}

// medida con un canvas offscreen reutilizado
let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, fontSize: number, fontFamily: string): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * fontSize * 0.5;
  measureCtx.font = `bold ${fontSize}px ${fontFamily}`;
  return measureCtx.measureText(text).width;
}
```

(El `ref`/`useEffect` de centrado del esqueleto inicial sobra al usar `WordRow`; eliminarlo: `SubtitlesLayer` solo calcula la cue/activeIdx y delega en `WordRow`.)

- [ ] **Step 2: Montar en `OverlayLayer.tsx`** — dentro del `<Layer>`, tras los textos y antes del cierre, añadir `<SubtitlesLayer width={width} height={height} />` (import correspondiente). Va por encima de overlays para que los subtítulos no queden tapados.

- [ ] **Step 3: Typecheck + verificación manual** — `npm run typecheck -w @clipforge/client`. Con `npm run dev`, tras generar subtítulos (Task 11) se verá la frase activa con la palabra resaltada moviéndose con el playhead. (La verificación visual completa va en la Task 13.)

- [ ] **Step 4: Commit y push**

```bash
git add client/src/features/preview/SubtitlesLayer.tsx client/src/features/preview/OverlayLayer.tsx
git commit -m "feat(client): render karaoke de subtítulos en la preview con Konva"
git push
```

---

### Task 11: Herramienta y panel de Subtítulos

**Files:**
- Create: `client/src/features/subtitles/SubtitlesPanel.tsx`
- Modify: `client/src/components/ToolRail.tsx`, `client/src/components/AppShell.tsx`

- [ ] **Step 1: Crear `SubtitlesPanel.tsx`**

```tsx
import { useState } from "react";
import { videoClipAt } from "../../lib/timeline";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { useTranscribe } from "./useTranscribe";

const LANGS: Array<{ id: string; label: string }> = [
  { id: "auto", label: "Autodetectar" },
  { id: "es", label: "Español" },
  { id: "en", label: "Inglés" },
  { id: "fr", label: "Francés" },
  { id: "pt", label: "Portugués" },
  { id: "de", label: "Alemán" },
];

export function SubtitlesPanel() {
  const cues = useProjectStore((s) => s.project.subtitles.cues);
  const style = useProjectStore((s) => s.project.subtitles.style);
  const setSubtitleCues = useProjectStore((s) => s.setSubtitleCues);
  const updateCueText = useProjectStore((s) => s.updateCueText);
  const removeCue = useProjectStore((s) => s.removeCue);
  const clearSubtitles = useProjectStore((s) => s.clearSubtitles);
  const setSubtitleStyle = useProjectStore((s) => s.setSubtitleStyle);
  const [language, setLanguage] = useState("auto");
  const { state, start, cancel } = useTranscribe(setSubtitleCues);

  const generate = () => {
    const project = useProjectStore.getState().project;
    const playhead = useUiStore.getState().playhead;
    // clip bajo el playhead, o el primero si el playhead está en un hueco
    const clip = videoClipAt(project.tracks.video, playhead) ?? project.tracks.video[0];
    if (!clip) return;
    void start(clip, language);
  };

  const hasClips = useProjectStore((s) => s.project.tracks.video.length > 0);

  return (
    <section aria-label="Subtítulos" className="flex-1 min-w-0 bg-surface-2/50 border-r border-border p-3 flex flex-col gap-3 overflow-y-auto">
      <h2 className="text-xs font-bold tracking-wide">SUBTÍTULOS</h2>
      {!hasClips && (
        <p className="text-[11px] text-danger">Añade un clip a la línea de tiempo antes de generar subtítulos.</p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="sub-lang" className="text-[11px] text-muted">Idioma</label>
        <select
          id="sub-lang"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="bg-surface-2 border border-border-2 rounded-md px-2 py-1 text-xs"
        >
          {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>
      {state.phase === "running" ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-[11px] text-muted">Transcribiendo… (puede tardar)</p>
          <button type="button" onClick={() => void cancel()} className="text-xs text-danger border border-border-2 rounded-md py-1.5">
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={!hasClips}
          onClick={generate}
          className="text-xs font-semibold text-white rounded-md py-1.5 bg-gradient-to-r from-accent to-accent-dark disabled:opacity-50"
        >
          {cues.length > 0 ? "Regenerar subtítulos" : "Generar subtítulos"}
        </button>
      )}
      {state.phase === "error" && (
        <p role="alert" className="text-[11px] text-danger whitespace-pre-wrap max-h-32 overflow-y-auto">{state.message}</p>
      )}

      {cues.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold text-muted tracking-wide">FRASES ({cues.length})</h3>
            <button type="button" onClick={clearSubtitles} className="text-[11px] text-muted hover:text-danger">Borrar todas</button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {cues.map((c) => (
              <li key={c.id} className="flex items-center gap-1">
                <input
                  value={c.words.map((w) => w.text).join(" ")}
                  onChange={(e) => updateCueText(c.id, e.target.value)}
                  aria-label="Texto de la frase"
                  className="flex-1 min-w-0 bg-surface-2 border border-border-2 rounded-md px-2 py-1 text-[11px] focus:outline-none focus:border-accent"
                />
                <button type="button" onClick={() => removeCue(c.id)} aria-label="Borrar frase" className="text-muted hover:text-danger px-1">🗑</button>
              </li>
            ))}
          </ul>

          <h3 className="text-[11px] font-bold text-muted tracking-wide mt-2">ESTILO</h3>
          <label className="text-[11px] text-muted">Color base
            <input type="color" value={style.fill} onChange={(e) => setSubtitleStyle({ fill: e.target.value })} className="ml-2 h-6 w-10 align-middle bg-surface-2 rounded border border-border-2" />
          </label>
          <label className="text-[11px] text-muted">Resaltado
            <input type="color" value={style.highlight} onChange={(e) => setSubtitleStyle({ highlight: e.target.value })} className="ml-2 h-6 w-10 align-middle bg-surface-2 rounded border border-border-2" />
          </label>
          <label className="text-[11px] text-muted flex items-center gap-2">
            <input type="checkbox" checked={style.uppercase} onChange={(e) => setSubtitleStyle({ uppercase: e.target.checked })} className="accent-accent" />
            MAYÚSCULAS
          </label>
          <label htmlFor="sub-size" className="text-[11px] text-muted">Tamaño · {Math.round(style.fontSize * 1000)}</label>
          <input id="sub-size" type="range" min={0.02} max={0.15} step={0.005} value={style.fontSize} onChange={(e) => setSubtitleStyle({ fontSize: parseFloat(e.target.value) })} className="accent-accent h-1.5" />
          <label htmlFor="sub-y" className="text-[11px] text-muted">Posición vertical · {Math.round(style.y * 100)}%</label>
          <input id="sub-y" type="range" min={0} max={1} step={0.01} value={style.y} onChange={(e) => setSubtitleStyle({ y: parseFloat(e.target.value) })} className="accent-accent h-1.5" />
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: `ToolRail.tsx`** — añadir la herramienta `{ id: "subtitles", icon: "💬", label: "Subtítulos", enabled: true }` al array `TOOLS`; es una herramienta de panel (no acción directa), así que entra en el `else` que hace `setActiveTool`. Ampliar la condición de `aria-pressed` para incluir `subtitles` como herramienta de panel normal (igual que media/image/audio).

- [ ] **Step 3: `AppShell.tsx`** — `{activeTool === "subtitles" && <SubtitlesPanel />}` junto a los demás paneles (+ import).

- [ ] **Step 4: Typecheck + commit y push**

Run: `npm run typecheck -w @clipforge/client`

```bash
git add client/src/features/subtitles/SubtitlesPanel.tsx client/src/components/ToolRail.tsx client/src/components/AppShell.tsx
git commit -m "feat(client): herramienta y panel de subtítulos (idioma, generar, editar texto y estilo)"
git push
```

---

### Task 12: Pista de Subtítulos en el timeline

**Files:**
- Modify: `client/src/features/timeline/Timeline.tsx`

Las cues se muestran como bloques en una pista propia; arrastrar/recortar usa `moveCue`/`trimCue` (Task 9). Reutiliza `TrackRow` y `assignLanes` ya existentes. La selección de cue usa `kind: "subtitle"`.

- [ ] **Step 1: Bloques de subtítulos en `Timeline.tsx`**

Importar `cueStart, cueEnd` de `../../lib/subtitles`. Añadir junto a los otros bloques:

```ts
const moveCue = useProjectStore((s) => s.moveCue);
const trimCue = useProjectStore((s) => s.trimCue);
const subtitleCues = useProjectStore((s) => s.project.subtitles.cues);

const subtitleBlocks: BlockDescriptor[] = subtitleCues.map((c) => ({
  id: c.id,
  kind: "subtitle" as const,
  start: cueStart(c),
  end: cueEnd(c),
  label: c.words.map((w) => w.text).join(" "),
  color: "bg-pink-500/20 text-pink-200",
}));
const subtitleLanes = assignLanes(subtitleBlocks);
```

Y la fila, tras la pista de Música:

```tsx
<TrackRow
  title="Subtítulos"
  blocks={subtitleBlocks}
  pxPerSecond={pxPerSecond}
  lanes={subtitleLanes.lanes}
  laneCount={subtitleLanes.count}
  onMove={(id, t, transient) => moveCue(id, t, { transient })}
  onTrim={(id, edge, t, transient) => trimCue(id, edge, t, { transient })}
/>
```

`BlockDescriptor.kind` es `Selection["kind"]`; al haber añadido `"subtitle"` a `ElementKind` (Task 9), encaja. Seleccionar un bloque ya emite `select({ kind: "subtitle", id })` por el `TrackRow` genérico; el panel no necesita reaccionar a la selección (la lista es completa), pero el bloque se resalta como los demás.

- [ ] **Step 2: Typecheck + verificación manual** — `npm run typecheck -w @clipforge/client`. Con subtítulos generados, aparece la pista rosa "Subtítulos"; arrastrar un bloque desplaza la frase (se ve en la preview), recortar la escala, Supr la borra.

- [ ] **Step 3: Commit y push**

```bash
git add client/src/features/timeline/Timeline.tsx
git commit -m "feat(client): pista de subtítulos en la línea de tiempo con arrastre y recorte"
git push
```

---

### Task 13: Verificación integral del hito

**Files:**
- Posibles ajustes menores + `TODO.md` + `README.md` + `Pendiente.txt`

- [ ] **Step 1: Typecheck y tests completos** — `npm run typecheck && npm run test` → limpio y verde en los 3 workspaces.

- [ ] **Step 2: e2e con Playwright + transcripción + export real**
  1. Reiniciar `npm run dev` limpio (evitar HMR corrupto).
  2. Añadir un clip con voz a la línea de tiempo.
  3. Herramienta Subtítulos → Generar (autodetectar) → esperar a que aparezcan las frases (la primera vez descarga whisper+modelo; dar margen amplio).
  4. Verificar en preview que la frase activa se ve con la palabra resaltada al mover el playhead.
  5. Editar el texto de una frase y comprobar que cambia en la preview.
  6. Exportar (TikTok) → con ffprobe, MP4 a la resolución/duración correcta; abrir el MP4 y confirmar que los subtítulos karaoke están quemados.
  7. Cero errores de consola.

- [ ] **Step 3: Checklist manual para el usuario**
  1. Generar subtítulos en español e inglés (forzando idioma)
  2. Karaoke visible en preview y en el MP4
  3. Editar texto, arrastrar y recortar una frase en el timeline
  4. Cambiar color de resaltado, tamaño y posición; ver el efecto
  5. Ctrl+Z deshace generar/editar; "Borrar todas" limpia

- [ ] **Step 4: Actualizar docs** — `TODO.md` (cerrar subtítulos), `Pendiente.txt` (marcar hecho), `README.md` (mencionar subtítulos automáticos y que whisper.cpp se descarga en el primer uso; requisito MSVC redistributable).

- [ ] **Step 5: Commit y push**

```bash
git add -u
git commit -m "docs: cierre de subtítulos automáticos (README, TODO, Pendiente)"
git push
```

---

## Verificación final del hito

- [ ] Tests verdes y typecheck limpio en los 3 workspaces
- [ ] Transcripción real con whisper.cpp produce cues con tiempos
- [ ] Karaoke (palabra activa resaltada) correcto en preview y en el MP4 exportado (libass)
- [ ] Edición de texto, tiempos (arrastre/recorte) y estilo funciona, con undo
- [ ] Idioma autodetectado o forzado; estados de error/vacío cubiertos
- [ ] Todo commiteado y pusheado a `master`
