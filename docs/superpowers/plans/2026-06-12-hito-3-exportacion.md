# Hito 3 — Exportación con FFmpeg — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exportar el proyecto (multi-clip con trim, zoom/encuadre, textos, imágenes y volumen) a un MP4 H.264+AAC idéntico a la preview, con progreso en vivo y cancelación.

**Architecture:** Un builder puro de `filter_complex` (TDD exhaustivo, sin FFmpeg) genera el grafo a partir del `Project`; un servicio de jobs lo ejecuta con execa parseando el progreso de stderr; rutas Fastify exponen POST (crear job), SSE (progreso) y DELETE (cancelar); la UI añade un diálogo de exportación con presets. La geometría replica la de la preview: base contain, `zoom.scale/x/y`, fondo negro.

**Tech Stack:** ffmpeg-static (ya instalado) + execa, SSE nativo de Fastify (`reply.raw`), Zod, Vitest. Sin dependencias nuevas.

**Git:** trabajo DIRECTO en `master`; cada tarea termina con commit (español, Conventional Commits, sin trailers) y `git push`.

---

## Decisiones de diseño del hito (fijadas aquí)

- **Paridad de geometría**: para cada clip, `base = min(W/srcW, H/srcH)`, tamaño = `src·base·zoom.scale` (redondeado a PAR), posición = `zoom.x·(W−w), zoom.y·(H−h)` (redondeada a entero). Misma fórmula que `PreviewCanvas`/`VideoFrameNode`.
- **Composición por segmentos**: cada clip de vídeo se recorta (`trim`), se escala y se incrusta sobre un fondo negro del tamaño del lienzo; los huecos entre clips son segmentos de negro + silencio; todo se une con `concat=v=1:a=1`. Los overlays (imagen, texto) se aplican DESPUÉS del concat con `enable='between(t,start,end)'` en tiempo de línea.
- **Imágenes**: input normal (sin `-loop`), `overlay` con `eof_action=repeat` (mantiene el frame), `format=rgba,colorchannelmixer=aa=op` para opacidad, `rotate=…:c=none` si hay rotación; centradas con `x=CX-overlay_w/2` (overlay_w refleja el tamaño tras rotar).
- **Textos**: `drawtext` con `fontfile` de `C:\Windows\Fonts` (mapa FONT_FAMILIES→TTF), `fontsize = fontSize·H`, color con alpha (`0xRRGGBB@op`), borde (`borderw/bordercolor`), sombra, centrado con `x=CX-text_w/2`. **Limitación documentada: la rotación de textos NO se exporta en este hito** (drawtext no rota; se anota en TODO para el Hito 4).
- **Audio**: por clip `atrim + asetpts + volume=originalAudioVolume`; huecos con `anullsrc` (44100 stereo). La pista de música es del Hito 4.
- **Velocidad y filtros de color**: campos del modelo aún neutros (speed=1); el builder los IGNORA en este hito (los añade el Hito 4). `clipDuration = trimOut − trimIn`.
- **Presets de calidad**: `tiktok` (8 Mbps vídeo, 192k audio), `youtube` (12 Mbps, 192k), `custom` (CRF 18). Siempre libx264 `-preset medium`, `-pix_fmt yuv420p`, `-movflags +faststart`, fps del proyecto.
- **Jobs en memoria** (`Map<jobId, job>`): un solo usuario local; si el server se reinicia, los jobs en curso se pierden (aceptado). El archivo parcial se borra al fallar o cancelar.
- **Progreso**: parseo de `time=HH:MM:SS.cs` del stderr de FFmpeg → porcentaje sobre `projectDuration`; SSE emite `{percent}` y al final `{done, fileName}` o `{error}`. Cap al 99% hasta que el proceso termina con código 0.
- **Nombre de archivo de salida**: saneado con la misma política que los proyectos; por defecto `<nombre-proyecto>-<timestamp>.mp4` en `data/exports/`.
- **Abrir carpeta**: endpoint `POST /api/exports/open` que lanza `explorer.exe` con EXPORTS_DIR (local, sin input del usuario).
- **La lógica de timeline del cliente se duplica mínimamente en el server** (`clipEnd`, `projectDuration`, huecos): son 15 líneas y evita acoplar workspaces con utilidades de UI; viven en el builder.

## Estructura de ficheros (estado final del hito)

```
shared/src/
└── export.ts            # NUEVO: QualityPresetId, ExportRequest/Job + zod
server/src/
├── services/ffmpeg/
│   ├── geometry.ts      # NUEVO: rect de render por clip (TDD)
│   ├── drawtext.ts      # NUEVO: escape + filtro drawtext + mapa de fuentes (TDD)
│   ├── filterGraph.ts   # NUEVO: builder del filter_complex completo (TDD)
│   └── presets.ts       # NUEVO: presets de calidad + args ffmpeg (TDD)
├── services/exportJobs.ts  # NUEVO: jobs execa + parseo de progreso (TDD del parser)
├── routes/export.ts     # NUEVO: POST/SSE/DELETE + abrir carpeta
├── lib/paths.ts         # MOD: EXPORTS_DIR en ensureDataDirs
└── index.ts             # MOD: registra exportRoutes
client/src/features/export/
├── ExportDialog.tsx     # NUEVO: diálogo modal con preset, progreso y cancelar
└── useExport.ts         # NUEVO: estado del export + EventSource SSE
client/src/components/TopBar.tsx  # MOD: botón Exportar habilitado
```

---

### Task 1: Tipos y esquemas de exportación (TDD)

**Files:**
- Create: `shared/src/export.ts`
- Modify: `shared/src/index.ts` (añadir `export * from "./export.js";`)
- Test: `shared/src/export.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`shared/src/export.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createEmptyProject } from "./project.js";
import { exportRequestSchema, QUALITY_PRESET_IDS } from "./export.js";

describe("exportRequestSchema", () => {
  it("acepta una petición válida", () => {
    const req = {
      project: createEmptyProject("demo"),
      preset: "tiktok",
      fileName: "mi-video",
    };
    expect(exportRequestSchema.safeParse(req).success).toBe(true);
  });

  it("acepta fileName ausente (se genera en el servidor)", () => {
    const req = { project: createEmptyProject("demo"), preset: "youtube" };
    expect(exportRequestSchema.safeParse(req).success).toBe(true);
  });

  it("rechaza un preset desconocido", () => {
    const req = { project: createEmptyProject("demo"), preset: "4k-imax" };
    expect(exportRequestSchema.safeParse(req).success).toBe(false);
  });
});

describe("QUALITY_PRESET_IDS", () => {
  it("expone los tres presets aprobados", () => {
    expect(QUALITY_PRESET_IDS).toEqual(["tiktok", "youtube", "custom"]);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -w @clipforge/shared`
Expected: FAIL — `Cannot find module './export.js'`

- [ ] **Step 3: Implementar `shared/src/export.ts`**

```ts
import { z } from "zod";
import { projectSchema } from "./project.js";

export const QUALITY_PRESET_IDS = ["tiktok", "youtube", "custom"] as const;

export const qualityPresetIdSchema = z.enum(QUALITY_PRESET_IDS);

export const exportRequestSchema = z.object({
  project: projectSchema,
  preset: qualityPresetIdSchema,
  fileName: z.string().min(1).max(80).optional(),
});

export type QualityPresetId = z.infer<typeof qualityPresetIdSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;

export type ExportJobState = "running" | "done" | "error" | "cancelled";

export interface ExportJobStatus {
  jobId: string;
  state: ExportJobState;
  percent: number;
  fileName?: string;
  error?: string;
}

/** Evento SSE del progreso de exportación. */
export type ExportEvent =
  | { type: "progress"; percent: number }
  | { type: "done"; fileName: string }
  | { type: "error"; message: string };
```

- [ ] **Step 4: Re-exportar desde `shared/src/index.ts`** — añadir al final: `export * from "./export.js";`

- [ ] **Step 5: Verificar que pasa**

Run: `npm run test -w @clipforge/shared && npm run typecheck -w @clipforge/shared`
Expected: PASS (5 + 4 nuevos), typecheck limpio.

- [ ] **Step 6: Commit y push**

```bash
git add shared/src/export.ts shared/src/export.test.ts shared/src/index.ts
git commit -m "feat(shared): tipos y esquemas de la petición de exportación"
git push
```

---

### Task 2: Geometría de render por clip (TDD)

**Files:**
- Create: `server/src/services/ffmpeg/geometry.ts`
- Test: `server/src/services/ffmpeg/geometry.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`server/src/services/ffmpeg/geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderRect } from "./geometry.js";

describe("renderRect", () => {
  it("contain a 1x: un 16:9 en lienzo 9:16 ocupa todo el ancho, centrado", () => {
    const r = renderRect(1080, 1920, 1920, 1080, { x: 0.5, y: 0.5, scale: 1 });
    expect(r).toEqual({ w: 1080, h: 608, left: 0, top: 656 });
  });

  it("zoom 2x centrado: el doble de tamaño, desplazado a la mitad negativa", () => {
    const r = renderRect(1080, 1920, 1920, 1080, { x: 0.5, y: 0.5, scale: 2 });
    expect(r.w).toBe(2160);
    expect(r.h).toBe(1214); // 1215 → par
    expect(r.left).toBe(-540);
    expect(r.top).toBe(353);
  });

  it("encuadre en una esquina con zoom", () => {
    const r = renderRect(1080, 1920, 1920, 1080, { x: 0, y: 0, scale: 2 });
    expect(r.left).toBe(0);
    expect(r.top).toBe(0);
  });

  it("mismo aspecto que el lienzo a 1x: lo llena exacto", () => {
    const r = renderRect(1920, 1080, 1920, 1080, { x: 0.5, y: 0.5, scale: 1 });
    expect(r).toEqual({ w: 1920, h: 1080, left: 0, top: 0 });
  });

  it("ancho y alto siempre pares (requisito de yuv420p)", () => {
    const r = renderRect(1080, 1920, 1313, 777, { x: 0.5, y: 0.5, scale: 1 });
    expect(r.w % 2).toBe(0);
    expect(r.h % 2).toBe(0);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -w @clipforge/server`
Expected: FAIL — `Cannot find module './geometry.js'`

- [ ] **Step 3: Implementar `server/src/services/ffmpeg/geometry.ts`**

```ts
export interface RenderRect {
  w: number;
  h: number;
  left: number;
  top: number;
}

function toEven(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r - 1;
}

/**
 * Rectángulo del clip dentro del lienzo — misma fórmula que la preview:
 * base contain, tamaño = src·base·scale, esquina = zoom·(lienzo − tamaño).
 * Ancho/alto se redondean a PAR (yuv420p exige dimensiones pares).
 */
export function renderRect(
  canvasW: number,
  canvasH: number,
  srcW: number,
  srcH: number,
  zoom: { x: number; y: number; scale: number },
): RenderRect {
  const base = Math.min(canvasW / srcW, canvasH / srcH);
  const w = toEven(srcW * base * zoom.scale);
  const h = toEven(srcH * base * zoom.scale);
  return {
    w,
    h,
    left: Math.round(zoom.x * (canvasW - w)),
    top: Math.round(zoom.y * (canvasH - h)),
  };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test -w @clipforge/server`
Expected: PASS. Si el caso "zoom 2x" difiere en ±1 por el redondeo a par, ajustar el VALOR ESPERADO del test al resultado real de la fórmula (la propiedad importante es par + simetría), nunca la fórmula.

- [ ] **Step 5: Commit y push**

```bash
git add server/src/services/ffmpeg/geometry.ts server/src/services/ffmpeg/geometry.test.ts
git commit -m "feat(server): geometría de render por clip con paridad preview-export"
git push
```

---

### Task 3: Escape y filtro drawtext con fuentes de Windows (TDD)

**Files:**
- Create: `server/src/services/ffmpeg/drawtext.ts`
- Test: `server/src/services/ffmpeg/drawtext.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`server/src/services/ffmpeg/drawtext.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTextOverlay } from "@clipforge/shared";
import { drawtextFilter, escapeDrawtextText, fontFileFor } from "./drawtext.js";

describe("escapeDrawtextText", () => {
  it("escapa los caracteres especiales de drawtext", () => {
    expect(escapeDrawtextText("a:b")).toBe("a\\:b");
    expect(escapeDrawtextText("it's")).toBe("it\\'s");
    expect(escapeDrawtextText("a\\b")).toBe("a\\\\b");
    expect(escapeDrawtextText("100%")).toBe("100%");
  });

  it("convierte saltos de línea en saltos reales de drawtext", () => {
    expect(escapeDrawtextText("hola\nmundo")).toBe("hola\\nmundo");
  });
});

describe("fontFileFor", () => {
  it("mapea las familias conocidas a TTF de Windows con la ruta escapada", () => {
    expect(fontFileFor("Arial")).toBe("C\\:/Windows/Fonts/arial.ttf");
    expect(fontFileFor("Impact")).toBe("C\\:/Windows/Fonts/impact.ttf");
    expect(fontFileFor("Segoe UI")).toBe("C\\:/Windows/Fonts/segoeui.ttf");
  });

  it("cae a Segoe UI si la familia no está en el mapa", () => {
    expect(fontFileFor("Comic Neue")).toBe("C\\:/Windows/Fonts/segoeui.ttf");
  });
});

describe("drawtextFilter", () => {
  const base = { ...createTextOverlay(2), id: "t1", content: "Hola", x: 0.5, y: 0.25 };

  it("genera el filtro completo centrado con enable", () => {
    const f = drawtextFilter({ ...base, fontFamily: "Arial", fontSize: 0.05, fill: "#ffffff", opacity: 1, strokeWidth: 0, shadow: false, end: 6 }, 1080, 1920);
    expect(f).toContain("fontfile='C\\:/Windows/Fonts/arial.ttf'");
    expect(f).toContain("text='Hola'");
    expect(f).toContain("fontsize=96"); // 0.05·1920
    expect(f).toContain("fontcolor=0xffffff@1");
    expect(f).toContain("x=540-text_w/2");
    expect(f).toContain("y=480-text_h/2");
    expect(f).toContain("enable='between(t,2,6)'");
    expect(f).not.toContain("borderw");
    expect(f).not.toContain("shadowcolor");
  });

  it("añade borde y sombra cuando procede", () => {
    const f = drawtextFilter(
      { ...base, stroke: "#000000", strokeWidth: 0.005, shadow: true, opacity: 0.8 },
      1080,
      1920,
    );
    expect(f).toContain("borderw=10"); // 0.005·1920 redondeado
    expect(f).toContain("bordercolor=0x000000@0.8");
    expect(f).toContain("shadowcolor=black@0.64"); // 0.8·0.8
    expect(f).toContain("shadowx=3");
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -w @clipforge/server`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `server/src/services/ffmpeg/drawtext.ts`**

```ts
import type { TextOverlay } from "@clipforge/shared";

// Mapa de FONT_FAMILIES del cliente → TTF de C:\Windows\Fonts
const FONT_FILES: Record<string, string> = {
  "Segoe UI": "segoeui.ttf",
  Arial: "arial.ttf",
  "Arial Black": "ariblk.ttf",
  Impact: "impact.ttf",
  Georgia: "georgia.ttf",
  Verdana: "verdana.ttf",
  Tahoma: "tahoma.ttf",
  "Trebuchet MS": "trebuc.ttf",
  "Times New Roman": "times.ttf",
  "Courier New": "cour.ttf",
  "Comic Sans MS": "comic.ttf",
};

/** Ruta fontfile con el escape de drawtext para Windows (C\:/...). */
export function fontFileFor(family: string): string {
  const file = FONT_FILES[family] ?? FONT_FILES["Segoe UI"];
  return `C\\:/Windows/Fonts/${file}`;
}

/** Escapa el texto del usuario para el parámetro text de drawtext. */
export function escapeDrawtextText(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n");
}

function hex(color: string): string {
  return `0x${color.replace(/^#/, "")}`;
}

function num(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Filtro drawtext completo para un overlay de texto (sin rotación: limitación H3). */
export function drawtextFilter(t: TextOverlay, canvasW: number, canvasH: number): string {
  const parts = [
    `fontfile='${fontFileFor(t.fontFamily)}'`,
    `text='${escapeDrawtextText(t.content)}'`,
    `fontsize=${Math.round(t.fontSize * canvasH)}`,
    `fontcolor=${hex(t.fill)}@${num(t.opacity)}`,
  ];
  const borderw = Math.round(t.strokeWidth * canvasH);
  if (borderw > 0) {
    parts.push(`borderw=${borderw}`, `bordercolor=${hex(t.stroke || "#000000")}@${num(t.opacity)}`);
  }
  if (t.shadow) {
    const offset = Math.max(1, Math.round(t.fontSize * canvasH * 0.03));
    parts.push(`shadowcolor=black@${num(0.8 * t.opacity)}`, `shadowx=${offset}`, `shadowy=${offset}`);
  }
  parts.push(
    `x=${Math.round(t.x * canvasW)}-text_w/2`,
    `y=${Math.round(t.y * canvasH)}-text_h/2`,
    `enable='between(t,${num(t.start)},${num(t.end)})'`,
  );
  return `drawtext=${parts.join(":")}`;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test -w @clipforge/server`
Expected: PASS. Si `shadowx` difiere (depende del fontSize del caso), ajustar el esperado al cálculo `max(1, round(0.05·1920·0.03)) = 3`.

- [ ] **Step 5: Commit y push**

```bash
git add server/src/services/ffmpeg/drawtext.ts server/src/services/ffmpeg/drawtext.test.ts
git commit -m "feat(server): filtro drawtext con escape seguro y fuentes TTF de Windows"
git push
```

---

### Task 4: Builder del filter_complex (TDD)

**Files:**
- Create: `server/src/services/ffmpeg/filterGraph.ts`
- Test: `server/src/services/ffmpeg/filterGraph.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`server/src/services/ffmpeg/filterGraph.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ClipInfo } from "@clipforge/shared";
import {
  createEmptyProject,
  createImageOverlay,
  createTextOverlay,
  createVideoClip,
} from "@clipforge/shared";
import { buildFilterGraph } from "./filterGraph.js";

const info: ClipInfo = {
  id: "clip-1",
  url: "https://clips.twitch.tv/x",
  title: "demo",
  fileName: "clip-1.mp4",
  duration: 10,
  width: 1920,
  height: 1080,
  createdAt: "2026-06-12T00:00:00.000Z",
};

function projectWithClip() {
  const p = createEmptyProject("demo");
  p.tracks.video.push({ ...createVideoClip("clip-1", 0, 10), trimIn: 2, trimOut: 7 });
  return p;
}

describe("buildFilterGraph — vídeo", () => {
  it("un clip: trim, escala, fondo negro y concat de un segmento", () => {
    const g = buildFilterGraph(projectWithClip(), new Map([["clip-1", info]]));
    expect(g.inputs).toEqual([{ kind: "video", fileName: "clip-1.mp4" }]);
    expect(g.filterComplex).toContain("[0:v]trim=start=2:end=7,setpts=PTS-STARTPTS,scale=1080:608[cv0]");
    expect(g.filterComplex).toContain("color=black:s=1080x1920:d=5:r=30[bg0]");
    expect(g.filterComplex).toContain("[bg0][cv0]overlay=x=0:y=656:shortest=1[seg0]");
    expect(g.filterComplex).toContain("[0:a]atrim=start=2:end=7,asetpts=PTS-STARTPTS,volume=1[sega0]");
    expect(g.filterComplex).toContain("[seg0][sega0]concat=n=1:v=1:a=1[vcat][acat]");
    expect(g.videoLabel).toBe("[vcat]");
    expect(g.audioLabel).toBe("[acat]");
    expect(g.totalDuration).toBe(5); // clip en [0,5): trim de 2 a 7 son 5s de material
  });

  it("hueco inicial entre t=0 y el primer clip: segmento negro con silencio", () => {
    const p = createEmptyProject("demo");
    p.tracks.video.push({ ...createVideoClip("clip-1", 3, 10), trimIn: 0, trimOut: 4 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("color=black:s=1080x1920:d=3:r=30[seg0]");
    expect(g.filterComplex).toContain("anullsrc=r=44100:cl=stereo,atrim=duration=3[sega0]");
    expect(g.filterComplex).toContain("concat=n=2:v=1:a=1");
    expect(g.totalDuration).toBe(7);
  });

  it("dos clips contiguos: dos segmentos y n=2", () => {
    const p = projectWithClip(); // ocupa [0,5)
    p.tracks.video.push({ ...createVideoClip("clip-1", 5, 10), trimIn: 0, trimOut: 2 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.inputs).toHaveLength(2);
    expect(g.filterComplex).toContain("[1:v]trim=start=0:end=2");
    expect(g.filterComplex).toContain("concat=n=2:v=1:a=1");
    expect(g.totalDuration).toBe(7);
  });

  it("el volumen del audio original se aplica a cada clip", () => {
    const p = projectWithClip();
    p.originalAudioVolume = 0.35;
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("volume=0.35");
  });

  it("lanza si el proyecto no tiene clips de vídeo", () => {
    expect(() => buildFilterGraph(createEmptyProject("x"), new Map())).toThrow(
      "El proyecto no tiene clips",
    );
  });

  it("lanza si falta la información de un clip", () => {
    expect(() => buildFilterGraph(projectWithClip(), new Map())).toThrow(
      "Falta la información del clip",
    );
  });
});

describe("buildFilterGraph — overlays", () => {
  it("imagen: input extra, escala+alpha, overlay con enable y eof_action", () => {
    const p = projectWithClip();
    p.tracks.image.push({
      ...createImageOverlay("a1", "a1.png", 1, 0.3, 0.2),
      x: 0.5,
      y: 0.5,
      opacity: 0.9,
      end: 4,
    });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.inputs[1]).toEqual({ kind: "image", fileName: "a1.png" });
    expect(g.filterComplex).toContain("[1:v]scale=324:384,format=rgba,colorchannelmixer=aa=0.9[img0]");
    expect(g.filterComplex).toContain(
      "overlay=x=540-overlay_w/2:y=960-overlay_h/2:eof_action=repeat:enable='between(t,1,4)'",
    );
    expect(g.videoLabel).toBe("[ov0]");
  });

  it("imagen con rotación añade rotate con lienzo transparente", () => {
    const p = projectWithClip();
    p.tracks.image.push({ ...createImageOverlay("a1", "a1.png", 0, 0.3, 0.2), rotation: 45 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("rotate=45*PI/180:c=none:ow=rotw(45*PI/180):oh=roth(45*PI/180)");
  });

  it("texto: drawtext encadenado tras el concat", () => {
    const p = projectWithClip();
    p.tracks.text.push({ ...createTextOverlay(1), content: "Hola" });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("drawtext=");
    expect(g.filterComplex).toContain("text='Hola'");
    expect(g.videoLabel).toBe("[txt0]");
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -w @clipforge/server`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `server/src/services/ffmpeg/filterGraph.ts`**

```ts
import type { ClipInfo, Project, VideoClip } from "@clipforge/shared";
import { drawtextFilter } from "./drawtext.js";
import { renderRect } from "./geometry.js";

export interface GraphInput {
  kind: "video" | "image";
  fileName: string;
}

export interface FilterGraph {
  inputs: GraphInput[];
  filterComplex: string;
  videoLabel: string;
  audioLabel: string;
  totalDuration: number;
}

function clipEnd(c: VideoClip): number {
  return c.timelineStart + (c.trimOut - c.trimIn);
}

function num(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/**
 * Construye el filter_complex completo del proyecto: segmentos de clip sobre
 * fondo negro + huecos en negro/silencio, concat, overlays de imagen y textos.
 * La velocidad y los filtros de color del modelo se ignoran (Hito 4).
 */
export function buildFilterGraph(
  project: Project,
  clipInfos: Map<string, ClipInfo>,
): FilterGraph {
  const { width: W, height: H, fps } = project.settings;
  const clips = [...project.tracks.video].sort((a, b) => a.timelineStart - b.timelineStart);
  if (clips.length === 0) throw new Error("El proyecto no tiene clips de vídeo");

  const inputs: GraphInput[] = [];
  const filters: string[] = [];
  const segLabels: string[] = [];
  let segIdx = 0;
  let cursor = 0;

  const pushGap = (duration: number) => {
    filters.push(`color=black:s=${W}x${H}:d=${num(duration)}:r=${fps}[seg${segIdx}]`);
    filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${num(duration)}[sega${segIdx}]`);
    segLabels.push(`[seg${segIdx}][sega${segIdx}]`);
    segIdx++;
  };

  for (const clip of clips) {
    const info = clipInfos.get(clip.clipId);
    if (!info) throw new Error(`Falta la información del clip ${clip.clipId}`);
    if (clip.timelineStart > cursor + 0.001) pushGap(clip.timelineStart - cursor);

    const inputIdx = inputs.length;
    inputs.push({ kind: "video", fileName: info.fileName });
    const rect = renderRect(W, H, info.width, info.height, clip.zoom);
    const dur = clip.trimOut - clip.trimIn;

    filters.push(
      `[${inputIdx}:v]trim=start=${num(clip.trimIn)}:end=${num(clip.trimOut)},setpts=PTS-STARTPTS,scale=${rect.w}:${rect.h}[cv${segIdx}]`,
    );
    filters.push(`color=black:s=${W}x${H}:d=${num(dur)}:r=${fps}[bg${segIdx}]`);
    filters.push(`[bg${segIdx}][cv${segIdx}]overlay=x=${rect.left}:y=${rect.top}:shortest=1[seg${segIdx}]`);
    filters.push(
      `[${inputIdx}:a]atrim=start=${num(clip.trimIn)}:end=${num(clip.trimOut)},asetpts=PTS-STARTPTS,volume=${num(project.originalAudioVolume)}[sega${segIdx}]`,
    );
    segLabels.push(`[seg${segIdx}][sega${segIdx}]`);
    segIdx++;
    cursor = clipEnd(clip);
  }

  filters.push(`${segLabels.join("")}concat=n=${segLabels.length}:v=1:a=1[vcat][acat]`);
  let videoLabel = "[vcat]";

  // Overlays de imagen (inputs extra, en orden)
  project.tracks.image.forEach((img, j) => {
    const inputIdx = inputs.length;
    inputs.push({ kind: "image", fileName: img.fileName });
    const w = Math.round(img.width * W);
    const h = Math.round(img.height * H);
    const pre = [`scale=${w}:${h}`, "format=rgba", `colorchannelmixer=aa=${num(img.opacity)}`];
    if (img.rotation !== 0) {
      const r = `${num(img.rotation)}*PI/180`;
      pre.push(`rotate=${r}:c=none:ow=rotw(${r}):oh=roth(${r})`);
    }
    filters.push(`[${inputIdx}:v]${pre.join(",")}[img${j}]`);
    filters.push(
      `${videoLabel}[img${j}]overlay=x=${Math.round(img.x * W)}-overlay_w/2:y=${Math.round(img.y * H)}-overlay_h/2:eof_action=repeat:enable='between(t,${num(img.start)},${num(img.end)})'[ov${j}]`,
    );
    videoLabel = `[ov${j}]`;
  });

  // Textos (drawtext encadenados)
  project.tracks.text.forEach((t, k) => {
    filters.push(`${videoLabel}${drawtextFilter(t, W, H)}[txt${k}]`);
    videoLabel = `[txt${k}]`;
  });

  const lastClipEnd = Math.max(...clips.map(clipEnd));
  const overlayEnds = [
    ...project.tracks.text.map((t) => t.end),
    ...project.tracks.image.map((i) => i.end),
  ];
  const totalDuration = Math.max(lastClipEnd, ...(overlayEnds.length ? overlayEnds : [0]));

  return {
    inputs,
    filterComplex: filters.join(";"),
    videoLabel,
    audioLabel: "[acat]",
    totalDuration,
  };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test -w @clipforge/server`
Expected: PASS. Los valores de `scale`/`overlay` de los tests salen de `renderRect` (Task 2): si un esperado difiere en ±1 px por el redondeo a par, ajustar el VALOR ESPERADO del test al real, nunca la fórmula.

- [ ] **Step 5: Commit y push**

```bash
git add server/src/services/ffmpeg/filterGraph.ts server/src/services/ffmpeg/filterGraph.test.ts
git commit -m "feat(server): builder del filter_complex con multi-clip, huecos, imágenes y textos"
git push
```

---

### Task 5: Presets de calidad y args de FFmpeg (TDD)

**Files:**
- Create: `server/src/services/ffmpeg/presets.ts`
- Test: `server/src/services/ffmpeg/presets.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`server/src/services/ffmpeg/presets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFfmpegArgs } from "./presets.js";
import type { FilterGraph } from "./filterGraph.js";

const graph: FilterGraph = {
  inputs: [
    { kind: "video", fileName: "clip-1.mp4" },
    { kind: "image", fileName: "a1.png" },
  ],
  filterComplex: "[0:v]null[vcat]",
  videoLabel: "[vcat]",
  audioLabel: "[acat]",
  totalDuration: 5,
};

describe("buildFfmpegArgs", () => {
  it("monta inputs, filtro, maps y salida en orden", () => {
    const args = buildFfmpegArgs(graph, "tiktok", 30, "C:/data/exports/salida.mp4", {
      videoDir: "C:/data/clips",
      imageDir: "C:/data/assets",
    });
    expect(args.slice(0, 5)).toEqual(["-y", "-i", "C:/data/clips/clip-1.mp4", "-i", "C:/data/assets/a1.png"]);
    expect(args).toContain("-filter_complex");
    expect(args[args.indexOf("-filter_complex") + 1]).toBe("[0:v]null[vcat]");
    expect(args).toContain("-map");
    expect(args[args.indexOf("-map") + 1]).toBe("[vcat]");
    expect(args.at(-1)).toBe("C:/data/exports/salida.mp4");
  });

  it("tiktok usa bitrate 8M; youtube 12M; custom CRF 18", () => {
    const opts = { videoDir: "v", imageDir: "i" };
    const tiktok = buildFfmpegArgs(graph, "tiktok", 30, "out.mp4", opts);
    expect(tiktok[tiktok.indexOf("-b:v") + 1]).toBe("8M");
    const youtube = buildFfmpegArgs(graph, "youtube", 30, "out.mp4", opts);
    expect(youtube[youtube.indexOf("-b:v") + 1]).toBe("12M");
    const custom = buildFfmpegArgs(graph, "custom", 30, "out.mp4", opts);
    expect(custom[custom.indexOf("-crf") + 1]).toBe("18");
    expect(custom).not.toContain("-b:v");
  });

  it("incluye los flags comunes de compatibilidad", () => {
    const args = buildFfmpegArgs(graph, "tiktok", 60, "out.mp4", { videoDir: "v", imageDir: "i" });
    expect(args[args.indexOf("-r") + 1]).toBe("60");
    expect(args[args.indexOf("-c:v") + 1]).toBe("libx264");
    expect(args[args.indexOf("-pix_fmt") + 1]).toBe("yuv420p");
    expect(args[args.indexOf("-movflags") + 1]).toBe("+faststart");
    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -w @clipforge/server`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `server/src/services/ffmpeg/presets.ts`**

```ts
import path from "node:path";
import type { QualityPresetId } from "@clipforge/shared";
import type { FilterGraph } from "./filterGraph.js";

interface PresetSettings {
  videoArgs: string[];
  audioBitrate: string;
}

const PRESETS: Record<QualityPresetId, PresetSettings> = {
  tiktok: { videoArgs: ["-b:v", "8M"], audioBitrate: "192k" },
  youtube: { videoArgs: ["-b:v", "12M"], audioBitrate: "192k" },
  custom: { videoArgs: ["-crf", "18"], audioBitrate: "192k" },
};

interface InputDirs {
  videoDir: string;
  imageDir: string;
}

/** Args completos de FFmpeg para el export (array, nunca shell). */
export function buildFfmpegArgs(
  graph: FilterGraph,
  preset: QualityPresetId,
  fps: number,
  outPath: string,
  dirs: InputDirs,
): string[] {
  const preset_ = PRESETS[preset];
  const args: string[] = ["-y"];
  for (const input of graph.inputs) {
    const dir = input.kind === "video" ? dirs.videoDir : dirs.imageDir;
    args.push("-i", path.join(dir, input.fileName).replaceAll("\\", "/"));
  }
  args.push(
    "-filter_complex", graph.filterComplex,
    "-map", graph.videoLabel,
    "-map", graph.audioLabel,
    "-r", String(fps),
    "-c:v", "libx264",
    "-preset", "medium",
    ...preset_.videoArgs,
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", preset_.audioBitrate,
    "-movflags", "+faststart",
    outPath,
  );
  return args;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test -w @clipforge/server`
Expected: PASS (nota: `path.join("C:/data/clips","clip-1.mp4")` en Windows produce `\` → el `.replaceAll` lo normaliza a `/`, que FFmpeg acepta).

- [ ] **Step 5: Commit y push**

```bash
git add server/src/services/ffmpeg/presets.ts server/src/services/ffmpeg/presets.test.ts
git commit -m "feat(server): presets de calidad y construcción de argumentos de FFmpeg"
git push
```

---

### Task 6: Servicio de jobs de exportación (TDD del parser de progreso)

**Files:**
- Create: `server/src/services/exportJobs.ts`
- Modify: `server/src/lib/paths.ts` (añadir `EXPORTS_DIR` a los exports y a `ensureDataDirs()` — `DATA_DIR/exports`)
- Test: `server/src/services/exportJobs.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`server/src/services/exportJobs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseFfmpegTime, sanitizeFileName } from "./exportJobs.js";

describe("parseFfmpegTime", () => {
  it("extrae los segundos de una línea de progreso de stderr", () => {
    expect(
      parseFfmpegTime("frame=  120 fps= 30 q=28.0 size=512kB time=00:00:04.50 bitrate=900kbits/s"),
    ).toBe(4.5);
  });

  it("soporta horas y minutos", () => {
    expect(parseFfmpegTime("time=01:02:03.25")).toBe(3723.25);
  });

  it("devuelve null si la línea no tiene time=", () => {
    expect(parseFfmpegTime("Stream mapping:")).toBeNull();
    expect(parseFfmpegTime("")).toBeNull();
  });
});

describe("sanitizeFileName", () => {
  it("limpia separadores y fuerza extensión mp4", () => {
    expect(sanitizeFileName("mi vídeo!! (final)")).toBe("mi vídeo final.mp4");
    expect(sanitizeFileName("../../etc/passwd")).toBe("etcpasswd.mp4");
    expect(sanitizeFileName("clip.mp4")).toBe("clip.mp4");
  });

  it("lanza con nombres vacíos tras sanear", () => {
    expect(() => sanitizeFileName("../..")).toThrow();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -w @clipforge/server`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `server/src/services/exportJobs.ts`**

```ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execa, type ResultPromise } from "execa";
import type { ExportJobState, Project, QualityPresetId } from "@clipforge/shared";
import { ASSETS_DIR, CLIPS_DIR, EXPORTS_DIR } from "../lib/paths.js";
import { ffmpegBin } from "./binaries.js";
import { listClips } from "./clipsRegistry.js";
import { buildFilterGraph } from "./ffmpeg/filterGraph.js";
import { buildFfmpegArgs } from "./ffmpeg/presets.js";

const TIME_RE = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/;

/** Segundos transcurridos según una línea de progreso de FFmpeg, o null. */
export function parseFfmpegTime(line: string): number | null {
  const m = TIME_RE.exec(line);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Nombre de salida seguro con extensión .mp4 garantizada. */
export function sanitizeFileName(raw: string): string {
  const clean = raw
    .replace(/\.mp4$/i, "")
    .replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ _-]/g, "")
    .trim();
  if (!clean) throw new Error("Nombre de archivo no válido");
  return `${clean}.mp4`;
}

export interface ExportJob {
  jobId: string;
  state: ExportJobState;
  percent: number;
  fileName: string;
  error?: string;
  proc?: ResultPromise;
  /** Suscriptores SSE: reciben cada cambio de estado/percent. */
  listeners: Set<() => void>;
}

const jobs = new Map<string, ExportJob>();

function notify(job: ExportJob): void {
  for (const fn of job.listeners) fn();
}

export function getJob(jobId: string): ExportJob | undefined {
  return jobs.get(jobId);
}

export function startExport(
  project: Project,
  preset: QualityPresetId,
  rawFileName?: string,
): ExportJob {
  const fileName = sanitizeFileName(
    rawFileName ?? `${project.name}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
  );
  const outPath = path.join(EXPORTS_DIR, fileName);

  const clipInfos = new Map(listClips().map((c) => [c.id, c]));
  const graph = buildFilterGraph(project, clipInfos);
  const args = buildFfmpegArgs(graph, preset, project.settings.fps, outPath, {
    videoDir: CLIPS_DIR,
    imageDir: ASSETS_DIR,
  });

  const job: ExportJob = {
    jobId: crypto.randomUUID(),
    state: "running",
    percent: 0,
    fileName,
    listeners: new Set(),
  };
  jobs.set(job.jobId, job);

  const proc = execa(ffmpegBin, args, { reject: false });
  job.proc = proc;

  proc.stderr?.on("data", (chunk: Buffer) => {
    const t = parseFfmpegTime(chunk.toString());
    if (t !== null && graph.totalDuration > 0) {
      job.percent = Math.min(99, (t / graph.totalDuration) * 100);
      notify(job);
    }
  });

  void proc.then((result) => {
    if (job.state === "cancelled") return;
    if (result.exitCode === 0) {
      job.state = "done";
      job.percent = 100;
    } else {
      job.state = "error";
      job.error = (result.stderr ?? "").split("\n").slice(-8).join("\n");
      fs.rmSync(outPath, { force: true });
    }
    notify(job);
  });

  return job;
}

export function cancelExport(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job || job.state !== "running") return false;
  job.state = "cancelled";
  job.proc?.kill();
  fs.rmSync(path.join(EXPORTS_DIR, job.fileName), { force: true });
  notify(job);
  return true;
}
```

- [ ] **Step 4: Verificar tests y typecheck**

Run: `npm run test -w @clipforge/server && npm run typecheck -w @clipforge/server`
Expected: PASS y limpio. Recordar el cambio de `paths.ts` (EXPORTS_DIR ya existe como carpeta gitignorada `data/exports/`; solo falta exportar la constante e incluirla en `ensureDataDirs`).

- [ ] **Step 5: Commit y push**

```bash
git add server/src/services/exportJobs.ts server/src/services/exportJobs.test.ts server/src/lib/paths.ts
git commit -m "feat(server): jobs de exportación con FFmpeg, progreso parseado y cancelación"
git push
```

---

### Task 7: Rutas de exportación con SSE

**Files:**
- Create: `server/src/routes/export.ts`
- Modify: `server/src/index.ts` (registrar `exportRoutes(app);` + import)

- [ ] **Step 1: Implementar `server/src/routes/export.ts`**

```ts
import { execa } from "execa";
import type { FastifyInstance } from "fastify";
import { exportRequestSchema, type ExportEvent } from "@clipforge/shared";
import { EXPORTS_DIR } from "../lib/paths.js";
import { cancelExport, getJob, startExport } from "../services/exportJobs.js";

export function exportRoutes(app: FastifyInstance): void {
  app.post("/api/export", async (req, reply) => {
    const parsed = exportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Petición de exportación no válida" });
    }
    try {
      const job = startExport(parsed.data.project, parsed.data.preset, parsed.data.fileName);
      return { jobId: job.jobId, fileName: job.fileName };
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : "No se pudo iniciar la exportación" });
    }
  });

  app.get<{ Params: { jobId: string } }>("/api/export/:jobId/progress", (req, reply) => {
    const job = getJob(req.params.jobId);
    if (!job) return reply.code(404).send({ error: "Job no encontrado" });

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const send = (event: ExportEvent) =>
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

    const push = () => {
      if (job.state === "running") send({ type: "progress", percent: job.percent });
      else if (job.state === "done") {
        send({ type: "done", fileName: job.fileName });
        cleanup();
      } else {
        send({ type: "error", message: job.error ?? "Exportación cancelada" });
        cleanup();
      }
    };
    const cleanup = () => {
      job.listeners.delete(push);
      reply.raw.end();
    };

    job.listeners.add(push);
    req.raw.on("close", () => job.listeners.delete(push));
    push(); // estado actual inmediato
  });

  app.delete<{ Params: { jobId: string } }>("/api/export/:jobId", async (req, reply) => {
    if (!cancelExport(req.params.jobId)) {
      return reply.code(404).send({ error: "Job no encontrado o ya terminado" });
    }
    return reply.code(204).send();
  });

  // Abre la carpeta de exports en el Explorador (app local de un solo usuario)
  app.post("/api/exports/open", async () => {
    void execa("explorer.exe", [EXPORTS_DIR]).catch(() => {});
    return { opened: true };
  });
}
```

- [ ] **Step 2: Registrar en `server/src/index.ts`** — `import { exportRoutes } from "./routes/export.js";` y `exportRoutes(app);` junto al resto.

- [ ] **Step 3: Typecheck + tests**

Run: `npm run typecheck -w @clipforge/server && npm run test -w @clipforge/server`
Expected: limpio y verde.

- [ ] **Step 4: Verificación manual con un export real**

Con `npm run dev` en background y al menos 1 clip descargado:

```powershell
# construir una petición mínima con el primer clip del registro (2s de material)
$clip = (Invoke-WebRequest -Uri http://127.0.0.1:3001/api/clips -UseBasicParsing).Content | ConvertFrom-Json | Select-Object -First 1
$project = @{ id="x"; name="prueba-export"; version=1; settings=@{aspect="9:16"; width=1080; height=1920; fps=30}; tracks=@{ video=@(@{ id="v1"; clipId=$clip.id; timelineStart=0; trimIn=0; trimOut=2; speed=1; zoom=@{x=0.5;y=0.5;scale=1}; filters=@{brightness=0;contrast=1;saturation=1;hue=0;grayscale=0} }); text=@(@{ id="t1"; content="Prueba"; fontFamily="Impact"; fontSize=0.06; fill="#ffffff"; stroke="#000000"; strokeWidth=0.004; shadow=$true; x=0.5; y=0.2; rotation=0; opacity=1; start=0; end=2 }); image=@(); audio=@() }; originalAudioVolume=1 }
$body = @{ project=$project; preset="tiktok" } | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText("$env:TEMP\export-req.json", $body)
curl.exe -s -X POST http://127.0.0.1:3001/api/export -H "content-type: application/json" -d "@$env:TEMP\export-req.json"
# → {"jobId":"...","fileName":"prueba-export....mp4"}
curl.exe -N -s http://127.0.0.1:3001/api/export/<jobId>/progress   # eventos SSE hasta done
```

Expected: eventos `data: {"type":"progress",...}` y `data: {"type":"done",...}`; el MP4 existe en `data/exports/` y `ffprobe` (data/bin no — usar el de ffprobe-static vía node) confirma 1080x1920 y ~2s. Verificación rápida de dimensiones:

```powershell
node -e "const f=require('ffprobe-static').path;const{execa}=require('execa');execa(f,['-v','error','-select_streams','v:0','-show_entries','stream=width,height,duration','-of','json','data/exports/<fileName>']).then(r=>console.log(r.stdout))"
```

(Si `require` falla por ESM, usar `node --input-type=module -e` con `import`.) Probar también DELETE a mitad de un export y comprobar que el parcial desaparece. Parar el servidor.

- [ ] **Step 5: Commit y push**

```bash
git add server/src/routes/export.ts server/src/index.ts
git commit -m "feat(server): rutas de exportación con progreso SSE, cancelación y abrir carpeta"
git push
```

---

### Task 8: Diálogo de exportación en la UI

**Files:**
- Create: `client/src/features/export/useExport.ts`
- Create: `client/src/features/export/ExportDialog.tsx`
- Modify: `client/src/components/TopBar.tsx` (habilitar Exportar y montar el diálogo)

- [ ] **Step 1: Crear `client/src/features/export/useExport.ts`**

```ts
import { useCallback, useRef, useState } from "react";
import type { ExportEvent, QualityPresetId } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";

export type ExportPhase =
  | { phase: "idle" }
  | { phase: "running"; jobId: string; percent: number }
  | { phase: "done"; fileName: string }
  | { phase: "error"; message: string };

export function useExport() {
  const [state, setState] = useState<ExportPhase>({ phase: "idle" });
  const sourceRef = useRef<EventSource | null>(null);

  const start = useCallback(async (preset: QualityPresetId, fileName: string) => {
    const project = useProjectStore.getState().project;
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, preset, fileName: fileName.trim() || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        throw new Error(body.error);
      }
      const { jobId } = (await res.json()) as { jobId: string };
      setState({ phase: "running", jobId, percent: 0 });

      const source = new EventSource(`/api/export/${jobId}/progress`);
      sourceRef.current = source;
      source.onmessage = (e) => {
        const event = JSON.parse(e.data) as ExportEvent;
        if (event.type === "progress") {
          setState({ phase: "running", jobId, percent: event.percent });
        } else {
          source.close();
          sourceRef.current = null;
          setState(
            event.type === "done"
              ? { phase: "done", fileName: event.fileName }
              : { phase: "error", message: event.message },
          );
        }
      };
      source.onerror = () => {
        source.close();
        sourceRef.current = null;
        setState((s) =>
          s.phase === "running" ? { phase: "error", message: "Se perdió la conexión" } : s,
        );
      };
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : "Error" });
    }
  }, []);

  const cancel = useCallback(async () => {
    if (state.phase !== "running") return;
    sourceRef.current?.close();
    sourceRef.current = null;
    await fetch(`/api/export/${state.jobId}`, { method: "DELETE" });
    setState({ phase: "idle" });
  }, [state]);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  const openFolder = useCallback(() => {
    void fetch("/api/exports/open", { method: "POST" });
  }, []);

  return { state, start, cancel, reset, openFolder };
}
```

- [ ] **Step 2: Crear `client/src/features/export/ExportDialog.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import type { QualityPresetId } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";
import { useExport } from "./useExport";

const PRESET_LABELS: Record<QualityPresetId, string> = {
  tiktok: "TikTok / Reels · 8 Mbps",
  youtube: "YouTube · 12 Mbps",
  custom: "Máxima calidad · CRF 18",
};

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const projectName = useProjectStore((s) => s.project.name);
  const hasClips = useProjectStore((s) => s.project.tracks.video.length > 0);
  const { state, start, cancel, reset, openFolder } = useExport();
  const [preset, setPreset] = useState<QualityPresetId>("tiktok");
  const [fileName, setFileName] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && state.phase !== "running") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, state.phase, onClose]);

  if (!open) return null;

  const close = () => {
    if (state.phase === "running") return; // cancelar primero
    reset();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 grid place-items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Exportar vídeo"
        className="w-96 bg-surface-2 border border-border-2 rounded-xl p-4 flex flex-col gap-3 shadow-2xl"
      >
        <h2 className="text-sm font-bold">Exportar vídeo</h2>

        {!hasClips && (
          <p className="text-[11px] text-danger">
            Añade al menos un clip a la línea de tiempo antes de exportar.
          </p>
        )}

        {state.phase === "idle" && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="export-name" className="text-[11px] text-muted">
                Nombre del archivo
              </label>
              <input
                id="export-name"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder={projectName}
                className="bg-surface border border-border-2 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
              />
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-[11px] text-muted mb-1">Calidad</legend>
              {(Object.keys(PRESET_LABELS) as QualityPresetId[]).map((id) => (
                <label key={id} className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="export-preset"
                    value={id}
                    checked={preset === id}
                    onChange={() => setPreset(id)}
                    className="accent-accent"
                  />
                  {PRESET_LABELS[id]}
                </label>
              ))}
            </fieldset>
            <div className="flex justify-end gap-2 mt-1">
              <button type="button" onClick={close} className="text-xs text-muted border border-border-2 rounded-full px-3 py-1.5 hover:text-text">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!hasClips}
                onClick={() => void start(preset, fileName)}
                className="text-xs font-semibold text-white rounded-full px-4 py-1.5 bg-gradient-to-r from-accent to-accent-dark disabled:opacity-50"
              >
                Exportar
              </button>
            </div>
          </>
        )}

        {state.phase === "running" && (
          <>
            <div
              role="progressbar"
              aria-valuenow={Math.round(state.percent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progreso de exportación"
              className="h-2 bg-surface-3 rounded-full overflow-hidden"
            >
              <div className="h-full bg-accent transition-[width]" style={{ width: `${state.percent}%` }} />
            </div>
            <p role="status" className="text-[11px] text-muted">
              Exportando… {Math.round(state.percent)}%
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={() => void cancel()} className="text-xs text-danger border border-border-2 rounded-full px-3 py-1.5">
                Cancelar exportación
              </button>
            </div>
          </>
        )}

        {state.phase === "done" && (
          <>
            <p role="status" className="text-xs">
              ✅ Exportado como <span className="font-mono text-accent-soft">{state.fileName}</span>
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={openFolder} className="text-xs text-accent-soft border border-border-2 rounded-full px-3 py-1.5 hover:border-accent">
                📂 Abrir carpeta
              </button>
              <button type="button" onClick={close} className="text-xs text-muted border border-border-2 rounded-full px-3 py-1.5 hover:text-text">
                Cerrar
              </button>
            </div>
          </>
        )}

        {state.phase === "error" && (
          <>
            <p role="alert" className="text-[11px] text-danger whitespace-pre-wrap max-h-40 overflow-y-auto">
              {state.message}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={reset} className="text-xs text-accent-soft border border-border-2 rounded-full px-3 py-1.5 hover:border-accent">
                Reintentar
              </button>
              <button type="button" onClick={close} className="text-xs text-muted border border-border-2 rounded-full px-3 py-1.5 hover:text-text">
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Habilitar Exportar en `client/src/components/TopBar.tsx`**

Añadir estado y montar el diálogo (leer el fichero actual y preservar todo lo demás):

```tsx
const [exportOpen, setExportOpen] = useState(false);
```

Sustituir el botón Exportar deshabilitado por:

```tsx
<button
  type="button"
  onClick={() => setExportOpen(true)}
  title="Exportar vídeo"
  className="text-xs font-semibold text-white rounded-full px-4 py-1.5 bg-gradient-to-r from-accent to-accent-dark"
>
  Exportar
</button>
```

y montar `<ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />` al final del header (con los imports de `useState` y `ExportDialog`).

- [ ] **Step 4: Typecheck + tests**

Run: `npm run typecheck -w @clipforge/client && npm run test -w @clipforge/client`
Expected: limpio y verde.

- [ ] **Step 5: Commit y push**

```bash
git add client/src/features/export/useExport.ts client/src/features/export/ExportDialog.tsx client/src/components/TopBar.tsx
git commit -m "feat(client): diálogo de exportación con presets, progreso SSE y cancelación"
git push
```

---

### Task 9: Verificación integral del Hito 3

**Files:**
- Posibles ajustes menores (sin features nuevas)
- Modify: `TODO.md`

- [ ] **Step 1: Typecheck y tests completos**

Run: `npm run typecheck && npm run test`
Expected: limpio y verde en los 3 workspaces.

- [ ] **Step 2: Verificación end-to-end con Playwright + ffprobe**

Con `npm run dev` en background, script Playwright temporal (patrón de los checkui anteriores, borrar tras usar):
1. Cargar la app, añadir un clip a la línea de tiempo, recortarlo a ~3s vía store o aceptar la duración completa
2. Añadir un texto
3. Abrir Exportar → elegir TikTok → Exportar → esperar el `done` (puede tardar)
4. Verificar con ffprobe (vía ffprobe-static) que el MP4 de `data/exports/` mide exactamente el formato del proyecto (1080x1920) y la duración esperada (±0.2s)
5. Capturar pantalla del diálogo en "done" y comprobar 0 errores de consola

- [ ] **Step 3: Lista manual para el usuario (smoke test)**

1. Exportar un proyecto real con 2 clips recortados + texto + imagen + zoom en un clip
2. El progreso avanza y se puede cancelar a mitad (el archivo parcial desaparece)
3. El MP4 resultante se ve IGUAL que la preview (encuadre, texto, imagen, tiempos)
4. "Abrir carpeta" abre el Explorador en data/exports
5. Proyecto sin clips → el diálogo avisa y no deja exportar

- [ ] **Step 4: Actualizar TODO.md** — cerrar TASK-003 con resumen, registrar la limitación "rotación de texto no se exporta (drawtext)" en el backlog del Hito 4, Up Next = Hito 4.

- [ ] **Step 5: Commit final y push**

```bash
git add -u
git commit -m "docs(todo): cierra el Hito 3 de exportación"
git push
```

---

## Verificación final del Hito 3

- [ ] `npm run test` verde y typecheck limpio en los 3 workspaces
- [ ] Export real verificado con ffprobe: resolución del formato y duración correcta
- [ ] Progreso SSE en vivo, cancelación limpia el parcial, errores legibles con stderr expandible
- [ ] Paridad visual preview ↔ MP4 (geometría contain+zoom, textos, imágenes, tiempos)
- [ ] Todo commiteado y pusheado a `master`

