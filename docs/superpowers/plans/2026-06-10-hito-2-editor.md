# Hito 2 — Editor: timeline, overlays y proyectos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el reproductor del Hito 1 en un editor: timeline multipista a medida, overlays de texto/imagen con Konva (drag/resize/rotación), trim/split, panel de propiedades, undo/redo, autoguardado y proyectos.

**Architecture:** El modelo `Project` (JSON serializable, coordenadas normalizadas 0–1) vive en `shared/` con esquemas Zod y se valida en ambos lados. En el cliente, un `projectStore` Zustand con historial por snapshots inmutables (immer) es la única fuente de verdad; la preview es 100% cliente (`<video>` + capa Konva encima). El servidor solo añade CRUD de proyectos (JSON atómico con `.bak`) y subida de assets de imagen con verificación de magic bytes.

**Tech Stack:** React 19 + Zustand 5 + immer, Konva 10 + react-konva 19, Fastify 5 + @fastify/multipart 10, Zod, Vitest.

**Rama:** `feat/hito-2-editor` (desde `master`). **Cada tarea termina con commit (español, Conventional Commits, sin trailers) y `git push`.**

---

## Decisiones de diseño del hito (fijadas aquí, no relitigarlas en tareas)

- **Pista de vídeo**: bloques con `timelineStart` libre, **sin solaparse**; los huecos se ven en negro en la preview. Multi-clip = varios bloques en secuencia.
- **Velocidad, zoom/pan, filtros y pista de audio**: los campos existen en el modelo desde ya (con valores neutros por defecto) pero **su UI es del Hito 4**. La pista "Música" no se pinta en el timeline en este hito.
- **Fuentes**: lista curada de fuentes del sistema Windows (`FONT_FAMILIES` en Task 11). La API `/api/fonts` con TTF se hace en el Hito 3 (paridad con drawtext). En Windows las TTF correspondientes están en `C:\Windows\Fonts`.
- **Tamaños normalizados**: `x`,`y` (centro del elemento), `width`,`height` ∈ 0–1 relativos al lienzo; `fontSize` y `strokeWidth` de texto son fracción de la **altura** del lienzo. Cambiar de formato no recalcula nada.
- **Historial**: snapshots inmutables del `Project` (límite 100). Los arrastres usan `beginTransaction()` (un snapshot al empezar) + updates transitorias, para no generar 60 entradas por segundo.
- **Identidad de proyecto**: el nombre saneado es el nombre de archivo en `data/projects/`. Guardado atómico (`.tmp` → rename) conservando el anterior como `.bak`; la carga intenta el principal y cae al `.bak` si está corrupto.
- **Selección**: un único elemento seleccionado a la vez (`{ kind: "video"|"text"|"image", id }` en `uiStore`), compartido por lienzo, timeline y panel de propiedades.

## Estructura de ficheros (estado final del hito)

```
shared/src/
├── index.ts            # tipos Hito 1 + re-export de project.ts
└── project.ts          # NUEVO: modelo Project + esquemas Zod + factorías
server/src/
├── routes/projects.ts  # NUEVO: CRUD de proyectos
├── routes/assets.ts    # NUEVO: subida de imágenes
├── services/projectsRepo.ts  # NUEVO
├── services/assetsRepo.ts    # NUEVO (guardado + extensión)
├── lib/imageSniff.ts   # NUEVO: magic bytes (TDD)
├── lib/paths.ts        # MOD: añade ASSETS_DIR, PROJECTS_DIR
└── index.ts            # MOD: registra rutas y /assets/ estático
client/src/
├── features/
│   ├── media/MediaPanel.tsx          # MOVIDO desde components/ + botón "Añadir"
│   ├── preview/PreviewCanvas.tsx     # NUEVO: lienzo con marco de aspecto
│   ├── preview/OverlayLayer.tsx      # NUEVO: Konva Stage + Transformer
│   ├── preview/TransportBar.tsx      # NUEVO: transporte B+C sobre tiempo de línea
│   ├── preview/usePlaybackEngine.ts  # NUEVO: motor multi-clip
│   ├── preview/useElementSize.ts     # NUEVO: ResizeObserver
│   ├── image/ImagePanel.tsx          # NUEVO: subir/insertar imágenes
│   ├── timeline/Timeline.tsx         # NUEVO
│   ├── timeline/TimeRuler.tsx        # NUEVO
│   ├── timeline/TrackRow.tsx         # NUEVO (bloques drag/trim)
│   └── properties/PropertiesPanel.tsx # NUEVO
├── components/   # TopBar (MOD), ToolRail (MOD), SetupGate, AppShell (MOD)
├── stores/
│   ├── projectStore.ts  # NUEVO: Project + historial
│   ├── uiStore.ts       # NUEVO: selección, playhead, zoom, herramienta
│   ├── clipsStore.ts    # Hito 1 (sin cambios)
│   └── playerStore.ts   # Hito 1 (sin cambios)
└── lib/
    ├── normalized.ts    # NUEVO (TDD)
    ├── timeline.ts      # NUEVO: lógica pura de timeline (TDD)
    ├── shortcuts.ts     # NUEVO: atajos globales
    └── time.ts          # Hito 1
```

---

### Task 0: Rama e instalación de dependencias

**Files:**
- Modify: `client/package.json`, `server/package.json` (vía npm install)

- [ ] **Step 1: Crear la rama**

```bash
git checkout -b feat/hito-2-editor
```

- [ ] **Step 2: Instalar dependencias nuevas**

```bash
npm install -w @clipforge/client konva@^10.3.0 react-konva@^19.0.0 immer@^10.1.0
npm install -w @clipforge/client -D vitest@^3.0.0
npm install -w @clipforge/server @fastify/multipart@^10.0.0
npm install -w @clipforge/shared zod@^3.24.0
npm install -w @clipforge/shared -D vitest@^3.0.0 typescript@^5.8.0
```

- [ ] **Step 3: Añadir scripts de test**

En `client/package.json`, dentro de `"scripts"`, añadir: `"test": "vitest run"`.
En `shared/package.json`, añadir: `"scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" }` y un `tsconfig.json` (Step 4).

- [ ] **Step 4: Crear `shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Verificar instalación**

Run: `npm run typecheck -w @clipforge/client` y `npm run typecheck -w @clipforge/server`
Expected: sin errores.

- [ ] **Step 6: Commit y push**

```bash
git add package-lock.json client/package.json server/package.json shared/package.json shared/tsconfig.json
git commit -m "chore(hito-2): dependencias konva, immer y multipart con rama del editor"
git push -u origin feat/hito-2-editor
```

---

### Task 1: Modelo de datos Project con esquemas Zod (TDD)

**Files:**
- Create: `shared/src/project.ts`
- Modify: `shared/src/index.ts` (añadir `export * from "./project.js";` al final)
- Test: `shared/src/project.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`shared/src/project.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ASPECT_PRESETS,
  createEmptyProject,
  createTextOverlay,
  projectSchema,
} from "./project.js";

describe("createEmptyProject", () => {
  it("crea un proyecto 9:16 válido según el esquema", () => {
    const p = createEmptyProject("mi proyecto");
    expect(p.name).toBe("mi proyecto");
    expect(p.settings).toEqual({ aspect: "9:16", width: 1080, height: 1920, fps: 30 });
    expect(p.tracks).toEqual({ video: [], text: [], image: [], audio: [] });
    expect(projectSchema.safeParse(p).success).toBe(true);
  });
});

describe("projectSchema", () => {
  it("rechaza un aspect desconocido", () => {
    const p = { ...createEmptyProject("x"), settings: { aspect: "21:9", width: 100, height: 100, fps: 30 } };
    expect(projectSchema.safeParse(p).success).toBe(false);
  });

  it("rechaza coordenadas normalizadas fuera de 0–1", () => {
    const p = createEmptyProject("x");
    p.tracks.text.push({ ...createTextOverlay(0), x: 1.5 });
    expect(projectSchema.safeParse(p).success).toBe(false);
  });

  it("rechaza trimOut anterior a trimIn en un clip de vídeo", () => {
    const p = createEmptyProject("x");
    p.tracks.video.push({
      id: "v1", clipId: "c1", timelineStart: 0, trimIn: 5, trimOut: 2, speed: 1,
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
    });
    expect(projectSchema.safeParse(p).success).toBe(false);
  });
});

describe("ASPECT_PRESETS", () => {
  it("tiene los cuatro formatos aprobados", () => {
    expect(ASPECT_PRESETS["9:16"]).toEqual({ width: 1080, height: 1920 });
    expect(ASPECT_PRESETS["16:9"]).toEqual({ width: 1920, height: 1080 });
    expect(ASPECT_PRESETS["1:1"]).toEqual({ width: 1080, height: 1080 });
    expect(ASPECT_PRESETS["4:5"]).toEqual({ width: 1080, height: 1350 });
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -w @clipforge/shared`
Expected: FAIL — `Cannot find module './project.js'`

- [ ] **Step 3: Implementar `shared/src/project.ts`**

```ts
import { z } from "zod";

export const ASPECT_PRESETS = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
} as const;

const norm = z.number().min(0).max(1);

export const projectSettingsSchema = z.object({
  aspect: z.enum(["9:16", "16:9", "1:1", "4:5", "custom"]),
  width: z.number().int().min(16).max(7680),
  height: z.number().int().min(16).max(7680),
  fps: z.number().int().min(1).max(120),
});

export const videoClipSchema = z
  .object({
    id: z.string().min(1),
    clipId: z.string().min(1),
    timelineStart: z.number().min(0),
    trimIn: z.number().min(0),
    trimOut: z.number().min(0),
    speed: z.number().min(0.25).max(4),
    zoom: z.object({ x: norm, y: norm, scale: z.number().min(1).max(10) }),
    filters: z.object({
      brightness: z.number().min(-1).max(1),
      contrast: z.number().min(0).max(2),
      saturation: z.number().min(0).max(3),
      hue: z.number().min(-180).max(180),
      grayscale: z.number().min(0).max(1),
    }),
  })
  .refine((c) => c.trimOut > c.trimIn, { message: "trimOut debe ser mayor que trimIn" });

const overlayWindow = {
  start: z.number().min(0),
  end: z.number().min(0),
  rotation: z.number().min(-360).max(360),
  opacity: norm,
};

export const textOverlaySchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  fontFamily: z.string().min(1),
  fontSize: z.number().min(0.005).max(1),
  fill: z.string().min(1),
  stroke: z.string(),
  strokeWidth: z.number().min(0).max(0.1),
  shadow: z.boolean(),
  x: norm,
  y: norm,
  ...overlayWindow,
});

export const imageOverlaySchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  fileName: z.string().min(1),
  x: norm,
  y: norm,
  width: norm,
  height: norm,
  ...overlayWindow,
});

export const audioTrackSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  fileName: z.string().min(1),
  volume: norm,
  start: z.number().min(0),
  end: z.number().min(0),
  trimIn: z.number().min(0),
  trimOut: z.number().min(0),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  version: z.literal(1),
  settings: projectSettingsSchema,
  tracks: z.object({
    video: z.array(videoClipSchema),
    text: z.array(textOverlaySchema),
    image: z.array(imageOverlaySchema),
    audio: z.array(audioTrackSchema),
  }),
  originalAudioVolume: norm,
});

export type ProjectSettings = z.infer<typeof projectSettingsSchema>;
export type VideoClip = z.infer<typeof videoClipSchema>;
export type TextOverlay = z.infer<typeof textOverlaySchema>;
export type ImageOverlay = z.infer<typeof imageOverlaySchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type Project = z.infer<typeof projectSchema>;

export function createEmptyProject(name: string): Project {
  return {
    id: globalThis.crypto.randomUUID(),
    name,
    version: 1,
    settings: { aspect: "9:16", ...ASPECT_PRESETS["9:16"], fps: 30 },
    tracks: { video: [], text: [], image: [], audio: [] },
    originalAudioVolume: 1,
  };
}

export function createTextOverlay(start: number): TextOverlay {
  return {
    id: globalThis.crypto.randomUUID(),
    content: "Texto",
    fontFamily: "Segoe UI",
    fontSize: 0.06,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 0,
    shadow: true,
    x: 0.5,
    y: 0.5,
    rotation: 0,
    opacity: 1,
    start,
    end: start + 4,
  };
}

export function createImageOverlay(
  assetId: string,
  fileName: string,
  start: number,
  width: number,
  height: number,
): ImageOverlay {
  return {
    id: globalThis.crypto.randomUUID(),
    assetId,
    fileName,
    x: 0.5,
    y: 0.5,
    width,
    height,
    rotation: 0,
    opacity: 1,
    start,
    end: start + 4,
  };
}

export function createVideoClip(
  clipId: string,
  timelineStart: number,
  duration: number,
): VideoClip {
  return {
    id: globalThis.crypto.randomUUID(),
    clipId,
    timelineStart,
    trimIn: 0,
    trimOut: duration,
    speed: 1,
    zoom: { x: 0.5, y: 0.5, scale: 1 },
    filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
  };
}
```

Nota: `shared` necesita `zod` como dependencia: `npm install -w @clipforge/shared zod@^3.24.0`.

- [ ] **Step 4: Re-exportar desde `shared/src/index.ts`**

Añadir al final del fichero: `export * from "./project.js";`

- [ ] **Step 5: Verificar que pasa**

Run: `npm run test -w @clipforge/shared && npm run typecheck -w @clipforge/shared`
Expected: PASS (5 tests), typecheck limpio. También `npm run typecheck -w @clipforge/server` y `-w @clipforge/client` deben seguir limpios.

- [ ] **Step 6: Commit y push**

```bash
git add shared/src/project.ts shared/src/project.test.ts shared/src/index.ts shared/package.json package-lock.json
git commit -m "feat(shared): modelo Project con esquemas Zod y factorías"
git push
```

---

### Task 2: Repositorio y rutas de proyectos (TDD)

**Files:**
- Create: `server/src/services/projectsRepo.ts`
- Create: `server/src/routes/projects.ts`
- Modify: `server/src/lib/paths.ts` (añadir PROJECTS_DIR y ASSETS_DIR)
- Modify: `server/src/index.ts` (registrar rutas)
- Test: `server/src/services/projectsRepo.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`server/src/services/projectsRepo.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "@clipforge/shared";
import {
  deleteProject,
  listProjects,
  loadProject,
  sanitizeProjectName,
  saveProject,
} from "./projectsRepo.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-projects-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("sanitizeProjectName", () => {
  it("elimina separadores de ruta y caracteres peligrosos", () => {
    expect(sanitizeProjectName("../../etc/passwd")).toBe("etcpasswd");
    expect(sanitizeProjectName("mi proyecto (v2)")).toBe("mi proyecto v2");
  });

  it("rechaza nombres vacíos tras sanear", () => {
    expect(() => sanitizeProjectName("../..")).toThrow();
  });
});

describe("projectsRepo", () => {
  it("guarda y recarga un proyecto", () => {
    const p = createEmptyProject("demo");
    saveProject("demo", p, dir);
    expect(loadProject("demo", dir)).toEqual(p);
  });

  it("lista los proyectos guardados", () => {
    saveProject("uno", createEmptyProject("uno"), dir);
    saveProject("dos", createEmptyProject("dos"), dir);
    expect(listProjects(dir).map((e) => e.name).sort()).toEqual(["dos", "uno"]);
  });

  it("recupera el .bak si el principal está corrupto", () => {
    const p = createEmptyProject("demo");
    saveProject("demo", p, dir);
    const p2 = { ...p, name: "demo-v2" };
    saveProject("demo", p2, dir); // el guardado anterior pasa a .bak
    fs.writeFileSync(path.join(dir, "demo.json"), "{corrupto");
    expect(loadProject("demo", dir)?.name).toBe("demo");
  });

  it("borra un proyecto y su .bak", () => {
    saveProject("demo", createEmptyProject("demo"), dir);
    saveProject("demo", createEmptyProject("demo"), dir);
    deleteProject("demo", dir);
    expect(listProjects(dir)).toEqual([]);
    expect(fs.existsSync(path.join(dir, "demo.json.bak"))).toBe(false);
  });

  it("devuelve null si no existe", () => {
    expect(loadProject("nada", dir)).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -w @clipforge/server`
Expected: FAIL — `Cannot find module './projectsRepo.js'`

- [ ] **Step 3: Añadir directorios a `server/src/lib/paths.ts`**

El fichero actual exporta `DATA_DIR`, `BIN_DIR`, `CLIPS_DIR` y `ensureDataDirs()`. Añadir:

```ts
export const PROJECTS_DIR = path.join(DATA_DIR, "projects");
export const ASSETS_DIR = path.join(DATA_DIR, "assets");
```

y añadir ambos a la lista de directorios que crea `ensureDataDirs()`.

- [ ] **Step 4: Implementar `server/src/services/projectsRepo.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import type { Project } from "@clipforge/shared";
import { projectSchema } from "@clipforge/shared";
import { PROJECTS_DIR } from "../lib/paths.js";

/** Nombre de proyecto → nombre de archivo seguro (sin path traversal). */
export function sanitizeProjectName(raw: string): string {
  const clean = raw.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ _-]/g, "").trim();
  if (!clean) throw new Error("Nombre de proyecto no válido");
  return clean;
}

function fileFor(name: string, dir: string): string {
  return path.join(dir, `${sanitizeProjectName(name)}.json`);
}

export interface ProjectListEntry {
  name: string;
  updatedAt: string;
}

export function listProjects(dir: string = PROJECTS_DIR): ProjectListEntry[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: f.replace(/\.json$/, ""),
      updatedAt: fs.statSync(path.join(dir, f)).mtime.toISOString(),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveProject(name: string, project: Project, dir: string = PROJECTS_DIR): void {
  const file = fileFor(name, dir);
  const tmp = `${file}.tmp`;
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.writeFileSync(tmp, JSON.stringify(project, null, 2));
  fs.renameSync(tmp, file);
}

function tryRead(file: string): Project | null {
  try {
    const parsed = projectSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Carga el proyecto; si el principal está corrupto cae al .bak. */
export function loadProject(name: string, dir: string = PROJECTS_DIR): Project | null {
  const file = fileFor(name, dir);
  return tryRead(file) ?? tryRead(`${file}.bak`);
}

export function deleteProject(name: string, dir: string = PROJECTS_DIR): void {
  const file = fileFor(name, dir);
  fs.rmSync(file, { force: true });
  fs.rmSync(`${file}.bak`, { force: true });
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npm run test -w @clipforge/server`
Expected: PASS (los 20 del Hito 1 + 6 nuevos).

- [ ] **Step 6: Crear `server/src/routes/projects.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { projectSchema } from "@clipforge/shared";
import {
  deleteProject,
  listProjects,
  loadProject,
  saveProject,
  sanitizeProjectName,
} from "../services/projectsRepo.js";

export function projectRoutes(app: FastifyInstance): void {
  app.get("/api/projects", async () => listProjects());

  app.get<{ Params: { name: string } }>("/api/projects/:name", async (req, reply) => {
    const project = loadProject(req.params.name);
    if (!project) return reply.code(404).send({ error: "Proyecto no encontrado" });
    return project;
  });

  app.put<{ Params: { name: string } }>("/api/projects/:name", async (req, reply) => {
    const parsed = projectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Proyecto no válido", detail: parsed.error.issues });
    }
    try {
      saveProject(req.params.name, parsed.data);
    } catch {
      return reply.code(400).send({ error: "Nombre de proyecto no válido" });
    }
    return { saved: sanitizeProjectName(req.params.name) };
  });

  app.delete<{ Params: { name: string } }>("/api/projects/:name", async (req, reply) => {
    try {
      deleteProject(req.params.name);
    } catch {
      return reply.code(400).send({ error: "Nombre de proyecto no válido" });
    }
    return reply.code(204).send();
  });
}
```

- [ ] **Step 7: Registrar en `server/src/index.ts`**

Añadir `import { projectRoutes } from "./routes/projects.js";` y la llamada `projectRoutes(app);` junto a `clipRoutes(app);`.

- [ ] **Step 8: Verificar typecheck + tests y commit**

Run: `npm run typecheck -w @clipforge/server && npm run test -w @clipforge/server`
Expected: limpio y verde.

```bash
git add server/src/services/projectsRepo.ts server/src/services/projectsRepo.test.ts server/src/routes/projects.ts server/src/lib/paths.ts server/src/index.ts
git commit -m "feat(server): CRUD de proyectos con guardado atómico y recuperación desde .bak"
git push
```

---

### Task 3: Sniffer de imágenes y subida de assets (TDD)

**Files:**
- Create: `server/src/lib/imageSniff.ts`
- Create: `server/src/services/assetsRepo.ts`
- Create: `server/src/routes/assets.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/lib/imageSniff.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`server/src/lib/imageSniff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sniffImageExt } from "./imageSniff.js";

function bytes(...nums: number[]): Buffer {
  return Buffer.from(nums);
}

describe("sniffImageExt", () => {
  it("detecta PNG por su cabecera", () => {
    expect(sniffImageExt(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0))).toBe("png");
  });

  it("detecta JPEG", () => {
    expect(sniffImageExt(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe("jpg");
  });

  it("detecta GIF87a y GIF89a", () => {
    expect(sniffImageExt(Buffer.from("GIF87a000000"))).toBe("gif");
    expect(sniffImageExt(Buffer.from("GIF89a000000"))).toBe("gif");
  });

  it("detecta WebP (RIFF....WEBP)", () => {
    const b = Buffer.alloc(12);
    b.write("RIFF", 0);
    b.write("WEBP", 8);
    expect(sniffImageExt(b)).toBe("webp");
  });

  it("devuelve null para contenido no soportado (svg, exe, texto)", () => {
    expect(sniffImageExt(Buffer.from("<svg xmlns='x'/>"))).toBeNull();
    expect(sniffImageExt(bytes(0x4d, 0x5a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBeNull();
    expect(sniffImageExt(Buffer.from("hola mundo!!"))).toBeNull();
  });

  it("devuelve null si el buffer es demasiado corto", () => {
    expect(sniffImageExt(bytes(0x89, 0x50))).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -w @clipforge/server`
Expected: FAIL — `Cannot find module './imageSniff.js'`

- [ ] **Step 3: Implementar `server/src/lib/imageSniff.ts`**

```ts
export type ImageExt = "png" | "jpg" | "gif" | "webp";

/** Detecta el tipo real de imagen por magic bytes. SVG queda excluido a propósito (XSS). */
export function sniffImageExt(buf: Buffer): ImageExt | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  const ascii = buf.subarray(0, 12).toString("latin1");
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "webp";
  return null;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test -w @clipforge/server`
Expected: PASS.

- [ ] **Step 5: Implementar `server/src/services/assetsRepo.ts`**

```ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sniffImageExt } from "../lib/imageSniff.js";
import { ASSETS_DIR } from "../lib/paths.js";

export interface SavedAsset {
  assetId: string;
  fileName: string;
}

/** Guarda una imagen subida tras verificar su tipo real. Lanza si no es png/jpg/gif/webp. */
export function saveImageAsset(buf: Buffer, dir: string = ASSETS_DIR): SavedAsset {
  const ext = sniffImageExt(buf);
  if (!ext) throw new Error("El archivo no es una imagen soportada (png, jpg, gif, webp)");
  const assetId = crypto.randomUUID();
  const fileName = `${assetId}.${ext}`;
  fs.writeFileSync(path.join(dir, fileName), buf);
  return { assetId, fileName };
}
```

- [ ] **Step 6: Implementar `server/src/routes/assets.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { saveImageAsset } from "../services/assetsRepo.js";

export function assetRoutes(app: FastifyInstance): void {
  app.post("/api/assets", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "No se recibió ningún archivo" });
    let buf: Buffer;
    try {
      buf = await file.toBuffer(); // respeta el límite global de tamaño
    } catch {
      return reply.code(413).send({ error: "El archivo supera el límite de 100MB" });
    }
    try {
      return saveImageAsset(buf);
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Archivo no válido",
      });
    }
  });
}
```

- [ ] **Step 7: Registrar multipart y estáticos en `server/src/index.ts`**

Tras los imports, añadir:

```ts
import fastifyMultipart from "@fastify/multipart";
import { ASSETS_DIR, CLIPS_DIR, ensureDataDirs } from "./lib/paths.js"; // CLIPS_DIR ya estaba
import { assetRoutes } from "./routes/assets.js";
```

Tras el registro existente de `fastifyStatic` para clips, añadir:

```ts
await app.register(fastifyStatic, {
  root: ASSETS_DIR,
  prefix: "/assets/",
  decorateReply: false,
});
await app.register(fastifyMultipart, {
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});
```

y `assetRoutes(app);` junto al resto de rutas.

- [ ] **Step 8: Verificación manual**

Run: `npm run dev -w @clipforge/server` (background)

```bash
# crear una imagen png mínima de prueba y subirla
curl.exe -s -X POST http://127.0.0.1:3001/api/assets -F "file=@client/index.html"   # → 400 (no es imagen)
```

Para la prueba positiva usar cualquier PNG real del sistema, p. ej. un screenshot:
`curl.exe -s -X POST http://127.0.0.1:3001/api/assets -F "file=@<ruta a un .png real>"`
Expected: `{"assetId":"<uuid>","fileName":"<uuid>.png"}` y `curl.exe -I http://127.0.0.1:3001/assets/<fileName>` → 200. Parar el servidor.

- [ ] **Step 9: Typecheck, tests, commit y push**

Run: `npm run typecheck -w @clipforge/server && npm run test -w @clipforge/server`

```bash
git add server/src/lib/imageSniff.ts server/src/lib/imageSniff.test.ts server/src/services/assetsRepo.ts server/src/routes/assets.ts server/src/index.ts
git commit -m "feat(server): subida de imágenes con verificación de magic bytes y servicio estático"
git push
```

---

### Task 4: Conversión normalizada y lógica pura de timeline (TDD)

**Files:**
- Create: `client/src/lib/normalized.ts`
- Create: `client/src/lib/timeline.ts`
- Test: `client/src/lib/normalized.test.ts`, `client/src/lib/timeline.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

`client/src/lib/normalized.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clamp01, toNorm, toPx } from "./normalized";

describe("normalized", () => {
  it("convierte de normalizado a píxeles y vuelta", () => {
    expect(toPx(0.5, 1080)).toBe(540);
    expect(toNorm(540, 1080)).toBe(0.5);
  });

  it("toNorm devuelve 0 si la dimensión es 0", () => {
    expect(toNorm(100, 0)).toBe(0);
  });

  it("clamp01 limita a 0–1", () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(1.7)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });
});
```

`client/src/lib/timeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createEmptyProject, createVideoClip, createTextOverlay } from "@clipforge/shared";
import {
  clipDuration,
  clipEnd,
  findSnapPoints,
  hasOverlap,
  projectDuration,
  snapTime,
  sourceTimeFor,
  splitVideoClip,
  videoClipAt,
} from "./timeline";

function clip(start: number, trimIn: number, trimOut: number) {
  const c = createVideoClip("c1", start, trimOut);
  return { ...c, trimIn, trimOut };
}

describe("duraciones", () => {
  it("clipDuration y clipEnd respetan el recorte", () => {
    const c = clip(2, 1, 5); // 4s de material desde t=2
    expect(clipDuration(c)).toBe(4);
    expect(clipEnd(c)).toBe(6);
  });

  it("projectDuration es el final más tardío de cualquier pista", () => {
    const p = createEmptyProject("x");
    p.tracks.video.push(clip(0, 0, 10));
    p.tracks.text.push({ ...createTextOverlay(8), end: 15 });
    expect(projectDuration(p)).toBe(15);
  });

  it("projectDuration de un proyecto vacío es 0", () => {
    expect(projectDuration(createEmptyProject("x"))).toBe(0);
  });
});

describe("videoClipAt y sourceTimeFor", () => {
  const a = clip(0, 0, 5);
  const b = clip(7, 2, 6); // hueco entre t=5 y t=7

  it("encuentra el clip activo en un instante", () => {
    expect(videoClipAt([a, b], 3)?.id).toBe(a.id);
    expect(videoClipAt([a, b], 8)?.id).toBe(b.id);
  });

  it("devuelve null en un hueco y al final", () => {
    expect(videoClipAt([a, b], 6)).toBeNull();
    expect(videoClipAt([a, b], 99)).toBeNull();
  });

  it("mapea tiempo de línea a tiempo de archivo fuente", () => {
    expect(sourceTimeFor(b, 8)).toBe(3); // trimIn 2 + (8-7)
  });
});

describe("hasOverlap", () => {
  const a = clip(0, 0, 5);
  it("detecta solapamiento y respeta excludeId", () => {
    expect(hasOverlap([a], 3, 4)).toBe(true);
    expect(hasOverlap([a], 5, 4)).toBe(false); // contiguo no solapa
    expect(hasOverlap([a], 3, 4, a.id)).toBe(false);
  });
});

describe("snapping", () => {
  it("findSnapPoints incluye 0 y los bordes de todos los bloques", () => {
    const p = createEmptyProject("x");
    const a = clip(2, 0, 5);
    p.tracks.video.push(a);
    const points = findSnapPoints(p, a.id);
    expect(points).toContain(0);
    expect(points).not.toContain(2); // los bordes del propio bloque excluido no cuentan
  });

  it("snapTime ajusta dentro del umbral y respeta fuera de él", () => {
    expect(snapTime(4.93, [5], 0.1)).toBe(5);
    expect(snapTime(4.7, [5], 0.1)).toBe(4.7);
  });
});

describe("splitVideoClip", () => {
  it("divide en dos clips contiguos que conservan el material", () => {
    const c = clip(2, 1, 9); // 8s desde t=2 hasta t=10
    const [left, right] = splitVideoClip(c, 5); // corte a 3s del inicio del bloque
    expect(left.trimIn).toBe(1);
    expect(left.trimOut).toBe(4);
    expect(left.timelineStart).toBe(2);
    expect(right.trimIn).toBe(4);
    expect(right.trimOut).toBe(9);
    expect(right.timelineStart).toBe(5);
    expect(right.id).not.toBe(left.id);
  });

  it("lanza si el corte cae fuera del bloque", () => {
    const c = clip(2, 1, 9);
    expect(() => splitVideoClip(c, 1)).toThrow();
    expect(() => splitVideoClip(c, 10)).toThrow();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm run test -w @clipforge/client`
Expected: FAIL — módulos no encontrados.

- [ ] **Step 3: Implementar `client/src/lib/normalized.ts`**

```ts
export function toPx(norm: number, dimension: number): number {
  return norm * dimension;
}

export function toNorm(px: number, dimension: number): number {
  return dimension === 0 ? 0 : px / dimension;
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
```

- [ ] **Step 4: Implementar `client/src/lib/timeline.ts`**

```ts
import type { Project, VideoClip } from "@clipforge/shared";

export function clipDuration(c: VideoClip): number {
  return (c.trimOut - c.trimIn) / c.speed;
}

export function clipEnd(c: VideoClip): number {
  return c.timelineStart + clipDuration(c);
}

export function projectDuration(p: Project): number {
  const ends = [
    ...p.tracks.video.map(clipEnd),
    ...p.tracks.text.map((t) => t.end),
    ...p.tracks.image.map((i) => i.end),
    ...p.tracks.audio.map((a) => a.end),
  ];
  return ends.length ? Math.max(...ends) : 0;
}

/** Clip activo en el instante t (intervalo [start, end)). */
export function videoClipAt(track: VideoClip[], t: number): VideoClip | null {
  return track.find((c) => t >= c.timelineStart && t < clipEnd(c)) ?? null;
}

/** Tiempo del archivo fuente que corresponde al instante t de la línea. */
export function sourceTimeFor(c: VideoClip, t: number): number {
  return c.trimIn + (t - c.timelineStart) * c.speed;
}

export function hasOverlap(
  track: VideoClip[],
  start: number,
  duration: number,
  excludeId?: string,
): boolean {
  const end = start + duration;
  return track.some(
    (c) => c.id !== excludeId && start < clipEnd(c) && end > c.timelineStart,
  );
}

/** Puntos de imán: 0 y los bordes de todos los bloques de todas las pistas. */
export function findSnapPoints(p: Project, excludeId?: string): number[] {
  const points = new Set<number>([0]);
  for (const c of p.tracks.video) {
    if (c.id === excludeId) continue;
    points.add(c.timelineStart);
    points.add(clipEnd(c));
  }
  for (const list of [p.tracks.text, p.tracks.image, p.tracks.audio]) {
    for (const o of list) {
      if (o.id === excludeId) continue;
      points.add(o.start);
      points.add(o.end);
    }
  }
  return [...points];
}

export function snapTime(t: number, points: number[], threshold: number): number {
  let best = t;
  let bestDist = threshold;
  for (const point of points) {
    const dist = Math.abs(point - t);
    if (dist < bestDist) {
      best = point;
      bestDist = dist;
    }
  }
  return best;
}

/** Divide un clip en el instante t de la línea de tiempo. */
export function splitVideoClip(c: VideoClip, t: number): [VideoClip, VideoClip] {
  if (t <= c.timelineStart || t >= clipEnd(c)) {
    throw new Error("El punto de corte cae fuera del bloque");
  }
  const cutSource = sourceTimeFor(c, t);
  const left: VideoClip = { ...c, trimOut: cutSource };
  const right: VideoClip = {
    ...c,
    id: globalThis.crypto.randomUUID(),
    timelineStart: t,
    trimIn: cutSource,
  };
  return [left, right];
}
```

- [ ] **Step 5: Verificar que pasan**

Run: `npm run test -w @clipforge/client && npm run typecheck -w @clipforge/client`
Expected: PASS, typecheck limpio.

- [ ] **Step 6: Commit y push**

```bash
git add client/src/lib/normalized.ts client/src/lib/normalized.test.ts client/src/lib/timeline.ts client/src/lib/timeline.test.ts
git commit -m "feat(client): conversión de coordenadas normalizadas y lógica pura de timeline"
git push
```

---

### Task 5: projectStore con historial undo/redo (TDD)

**Files:**
- Create: `client/src/stores/projectStore.ts`
- Test: `client/src/stores/projectStore.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`client/src/stores/projectStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "@clipforge/shared";
import type { ClipInfo } from "@clipforge/shared";
import { useProjectStore } from "./projectStore";

const clipInfo: ClipInfo = {
  id: "clip-1",
  url: "https://clips.twitch.tv/x",
  title: "demo",
  fileName: "clip-1.mp4",
  duration: 10,
  width: 1920,
  height: 1080,
  createdAt: "2026-06-10T00:00:00.000Z",
};

beforeEach(() => {
  useProjectStore.getState().loadProject(createEmptyProject("test"));
});

describe("addVideoClip", () => {
  it("añade el clip al final de la secuencia", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    s.addVideoClip(clipInfo);
    const [a, b] = useProjectStore.getState().project.tracks.video;
    expect(a.timelineStart).toBe(0);
    expect(b.timelineStart).toBe(10);
  });
});

describe("moveVideoClip", () => {
  it("mueve el bloque si no hay solapamiento y lo rechaza si lo hay", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    s.addVideoClip(clipInfo);
    const [a, b] = useProjectStore.getState().project.tracks.video;
    s.moveVideoClip(b.id, 25);
    expect(useProjectStore.getState().project.tracks.video[1].timelineStart).toBe(25);
    s.moveVideoClip(b.id, 3); // solaparía con a
    expect(useProjectStore.getState().project.tracks.video[1].timelineStart).toBe(25);
    expect(a.timelineStart).toBe(0);
  });
});

describe("trimVideoClip", () => {
  it("recorta por el borde izquierdo ajustando trimIn y timelineStart", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = useProjectStore.getState().project.tracks.video[0].id;
    s.trimVideoClip(id, "start", 2);
    const c = useProjectStore.getState().project.tracks.video[0];
    expect(c.timelineStart).toBe(2);
    expect(c.trimIn).toBe(2);
    expect(c.trimOut).toBe(10);
  });

  it("recorta por el borde derecho ajustando trimOut", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = useProjectStore.getState().project.tracks.video[0].id;
    s.trimVideoClip(id, "end", 7);
    const c = useProjectStore.getState().project.tracks.video[0];
    expect(c.trimOut).toBeCloseTo(7);
    expect(c.timelineStart).toBe(0);
  });

  it("impone una duración mínima de 0.1s", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = useProjectStore.getState().project.tracks.video[0].id;
    s.trimVideoClip(id, "end", 0.01);
    expect(useProjectStore.getState().project.tracks.video[0].trimOut).toBeCloseTo(0.1);
  });
});

describe("splitVideoAt y removeElement", () => {
  it("divide el clip bajo el instante dado", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    s.splitVideoAt(4);
    const track = useProjectStore.getState().project.tracks.video;
    expect(track).toHaveLength(2);
    expect(track[0].trimOut).toBe(4);
    expect(track[1].timelineStart).toBe(4);
  });

  it("elimina un overlay de texto", () => {
    const s = useProjectStore.getState();
    s.addText(0);
    const id = useProjectStore.getState().project.tracks.text[0].id;
    s.removeElement("text", id);
    expect(useProjectStore.getState().project.tracks.text).toHaveLength(0);
  });
});

describe("historial", () => {
  it("undo/redo restauran snapshots", () => {
    const s = useProjectStore.getState();
    s.addText(0);
    s.addText(2);
    expect(useProjectStore.getState().project.tracks.text).toHaveLength(2);
    s.undo();
    expect(useProjectStore.getState().project.tracks.text).toHaveLength(1);
    s.undo();
    expect(useProjectStore.getState().project.tracks.text).toHaveLength(0);
    expect(useProjectStore.getState().canUndo()).toBe(false);
    s.redo();
    expect(useProjectStore.getState().project.tracks.text).toHaveLength(1);
  });

  it("una mutación nueva vacía el futuro", () => {
    const s = useProjectStore.getState();
    s.addText(0);
    s.undo();
    s.addText(5);
    expect(useProjectStore.getState().canRedo()).toBe(false);
  });

  it("beginTransaction agrupa updates transitorias en una sola entrada", () => {
    const s = useProjectStore.getState();
    s.addText(0);
    const id = useProjectStore.getState().project.tracks.text[0].id;
    s.beginTransaction();
    s.updateText(id, { x: 0.1 }, { transient: true });
    s.updateText(id, { x: 0.2 }, { transient: true });
    s.updateText(id, { x: 0.3 }, { transient: true });
    expect(useProjectStore.getState().project.tracks.text[0].x).toBe(0.3);
    s.undo(); // una sola entrada para todo el arrastre
    expect(useProjectStore.getState().project.tracks.text[0].x).toBe(0.5);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -w @clipforge/client`
Expected: FAIL — `Cannot find module './projectStore'`

- [ ] **Step 3: Implementar `client/src/stores/projectStore.ts`**

```ts
import { create } from "zustand";
import { produce } from "immer";
import type { ClipInfo, ImageOverlay, Project, TextOverlay, VideoClip } from "@clipforge/shared";
import {
  createEmptyProject,
  createImageOverlay,
  createTextOverlay,
  createVideoClip,
} from "@clipforge/shared";
import { clipDuration, clipEnd, hasOverlap, splitVideoClip, videoClipAt } from "../lib/timeline";

const HISTORY_LIMIT = 100;
const MIN_CLIP_DURATION = 0.1;

export type ElementKind = "video" | "text" | "image";

interface MutateOptions {
  transient?: boolean;
}

interface ProjectState {
  project: Project;
  past: Project[];
  future: Project[];
  dirty: boolean;
  loadProject: (p: Project) => void;
  renameProject: (name: string) => void;
  setAspect: (aspect: Project["settings"]["aspect"], width: number, height: number) => void;
  addVideoClip: (clip: ClipInfo) => void;
  moveVideoClip: (id: string, newStart: number, opts?: MutateOptions) => void;
  trimVideoClip: (id: string, edge: "start" | "end", t: number, opts?: MutateOptions) => void;
  splitVideoAt: (t: number) => void;
  addText: (start: number) => string;
  addImage: (assetId: string, fileName: string, start: number, w: number, h: number) => string;
  updateText: (id: string, patch: Partial<TextOverlay>, opts?: MutateOptions) => void;
  updateImage: (id: string, patch: Partial<ImageOverlay>, opts?: MutateOptions) => void;
  moveOverlay: (kind: "text" | "image", id: string, newStart: number, opts?: MutateOptions) => void;
  trimOverlay: (kind: "text" | "image", id: string, edge: "start" | "end", t: number, opts?: MutateOptions) => void;
  removeElement: (kind: ElementKind, id: string) => void;
  setOriginalAudioVolume: (v: number) => void;
  beginTransaction: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  markSaved: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const mutate = (fn: (draft: Project) => void, opts?: MutateOptions) =>
    set((s) => ({
      project: produce(s.project, fn),
      past: opts?.transient ? s.past : [...s.past.slice(-(HISTORY_LIMIT - 1)), s.project],
      future: opts?.transient ? s.future : [],
      dirty: true,
    }));

  return {
    project: createEmptyProject("proyecto-sin-titulo"),
    past: [],
    future: [],
    dirty: false,

    loadProject: (p) => set({ project: p, past: [], future: [], dirty: false }),

    renameProject: (name) => mutate((d) => void (d.name = name)),

    setAspect: (aspect, width, height) =>
      mutate((d) => {
        d.settings.aspect = aspect;
        d.settings.width = width;
        d.settings.height = height;
      }),

    addVideoClip: (clip) =>
      mutate((d) => {
        const lastEnd = d.tracks.video.length
          ? Math.max(...d.tracks.video.map(clipEnd))
          : 0;
        d.tracks.video.push(createVideoClip(clip.id, lastEnd, clip.duration));
      }),

    moveVideoClip: (id, newStart, opts) =>
      mutate((d) => {
        const c = d.tracks.video.find((v) => v.id === id);
        if (!c) return;
        const start = Math.max(0, newStart);
        if (hasOverlap(d.tracks.video, start, clipDuration(c), id)) return;
        c.timelineStart = start;
      }, opts),

    trimVideoClip: (id, edge, t, opts) =>
      mutate((d) => {
        const c = d.tracks.video.find((v) => v.id === id);
        if (!c) return;
        if (edge === "start") {
          const maxStart = clipEnd(c) - MIN_CLIP_DURATION;
          const newTimelineStart = Math.min(Math.max(0, t), maxStart);
          const delta = (newTimelineStart - c.timelineStart) * c.speed;
          const newTrimIn = Math.max(0, c.trimIn + delta);
          c.timelineStart = newTimelineStart;
          c.trimIn = Math.min(newTrimIn, c.trimOut - MIN_CLIP_DURATION);
        } else {
          const cutSource = c.trimIn + Math.max(MIN_CLIP_DURATION, t - c.timelineStart) * c.speed;
          c.trimOut = Math.max(c.trimIn + MIN_CLIP_DURATION, cutSource);
        }
      }, opts),

    splitVideoAt: (t) =>
      mutate((d) => {
        const c = videoClipAt(d.tracks.video, t);
        if (!c || t <= c.timelineStart || t >= clipEnd(c)) return;
        const [left, right] = splitVideoClip(c, t);
        const idx = d.tracks.video.findIndex((v) => v.id === c.id);
        d.tracks.video.splice(idx, 1, left, right);
      }),

    addText: (start) => {
      const overlay = createTextOverlay(start);
      mutate((d) => void d.tracks.text.push(overlay));
      return overlay.id;
    },

    addImage: (assetId, fileName, start, w, h) => {
      const overlay = createImageOverlay(assetId, fileName, start, w, h);
      mutate((d) => void d.tracks.image.push(overlay));
      return overlay.id;
    },

    updateText: (id, patch, opts) =>
      mutate((d) => {
        const o = d.tracks.text.find((t) => t.id === id);
        if (o) Object.assign(o, patch);
      }, opts),

    updateImage: (id, patch, opts) =>
      mutate((d) => {
        const o = d.tracks.image.find((i) => i.id === id);
        if (o) Object.assign(o, patch);
      }, opts),

    moveOverlay: (kind, id, newStart, opts) =>
      mutate((d) => {
        const o = d.tracks[kind].find((x) => x.id === id);
        if (!o) return;
        const dur = o.end - o.start;
        o.start = Math.max(0, newStart);
        o.end = o.start + dur;
      }, opts),

    trimOverlay: (kind, id, edge, t, opts) =>
      mutate((d) => {
        const o = d.tracks[kind].find((x) => x.id === id);
        if (!o) return;
        if (edge === "start") o.start = Math.min(Math.max(0, t), o.end - MIN_CLIP_DURATION);
        else o.end = Math.max(o.start + MIN_CLIP_DURATION, t);
      }, opts),

    removeElement: (kind, id) =>
      mutate((d) => {
        const track = d.tracks[kind] as Array<{ id: string }>;
        const idx = track.findIndex((x) => x.id === id);
        if (idx !== -1) track.splice(idx, 1);
      }),

    setOriginalAudioVolume: (v) => mutate((d) => void (d.originalAudioVolume = v)),

    beginTransaction: () =>
      set((s) => ({
        past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.project],
        future: [],
      })),

    undo: () =>
      set((s) => {
        const prev = s.past.at(-1);
        if (!prev) return s;
        return {
          project: prev,
          past: s.past.slice(0, -1),
          future: [s.project, ...s.future],
          dirty: true,
        };
      }),

    redo: () =>
      set((s) => {
        const next = s.future[0];
        if (!next) return s;
        return {
          project: next,
          past: [...s.past, s.project],
          future: s.future.slice(1),
          dirty: true,
        };
      }),

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
    markSaved: () => set({ dirty: false }),
  };
});
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test -w @clipforge/client && npm run typecheck -w @clipforge/client`
Expected: PASS (todos), typecheck limpio.

- [ ] **Step 5: Commit y push**

```bash
git add client/src/stores/projectStore.ts client/src/stores/projectStore.test.ts
git commit -m "feat(client): projectStore con acciones de edición e historial undo/redo por snapshots"
git push
```

---

### Task 6: uiStore, reestructuración a features/ y lienzo con marco de aspecto

**Files:**
- Create: `client/src/stores/uiStore.ts`
- Create: `client/src/features/preview/useElementSize.ts`
- Create: `client/src/features/preview/PreviewCanvas.tsx`
- Move: `client/src/components/MediaPanel.tsx` → `client/src/features/media/MediaPanel.tsx`
- Modify: `client/src/components/AppShell.tsx`, `client/src/components/TopBar.tsx`
- Delete: `client/src/components/PreviewPlayer.tsx` (sustituido por PreviewCanvas + TransportBar en Task 7)

- [ ] **Step 1: Crear `client/src/stores/uiStore.ts`**

```ts
import { create } from "zustand";
import type { ElementKind } from "./projectStore";

export type Tool = "media" | "text" | "image";

export interface Selection {
  kind: ElementKind;
  id: string;
}

interface UiState {
  selection: Selection | null;
  playhead: number;
  playing: boolean;
  pxPerSecond: number;
  activeTool: Tool;
  select: (sel: Selection | null) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setZoom: (px: number) => void;
  setActiveTool: (t: Tool) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selection: null,
  playhead: 0,
  playing: false,
  pxPerSecond: 40,
  activeTool: "media",
  select: (selection) => set({ selection }),
  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (playing) => set({ playing }),
  setZoom: (pxPerSecond) => set({ pxPerSecond: Math.min(400, Math.max(5, pxPerSecond)) }),
  setActiveTool: (activeTool) => set({ activeTool }),
}));
```

- [ ] **Step 2: Crear `client/src/features/preview/useElementSize.ts`**

```ts
import { useEffect, useState, type RefObject } from "react";

export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
```

- [ ] **Step 3: Crear `client/src/features/preview/PreviewCanvas.tsx`**

El lienzo calcula el rectángulo máximo con el aspect del proyecto que cabe en el contenedor, pinta el `<video>` dentro (object-fit: fill, porque el rect ya tiene el aspect correcto) y deja un hueco para la capa Konva (Task 8). Incluye el selector de formato encima.

```tsx
import { useMemo, useRef, type ReactNode, type RefObject } from "react";
import { ASPECT_PRESETS } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";
import { useElementSize } from "./useElementSize";

interface PreviewCanvasProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Capa de overlays (Konva) que se monta encima del vídeo, mismo tamaño. */
  children?: (canvasSize: { width: number; height: number }) => ReactNode;
  inGap: boolean;
}

const ASPECT_OPTIONS = ["9:16", "16:9", "1:1", "4:5"] as const;

export function PreviewCanvas({ videoRef, children, inGap }: PreviewCanvasProps) {
  const settings = useProjectStore((s) => s.project.settings);
  const setAspect = useProjectStore((s) => s.setAspect);
  const containerRef = useRef<HTMLDivElement>(null);
  const container = useElementSize(containerRef);

  const canvas = useMemo(() => {
    if (!container.width || !container.height) return { width: 0, height: 0 };
    const scale = Math.min(
      container.width / settings.width,
      container.height / settings.height,
    );
    return {
      width: Math.floor(settings.width * scale),
      height: Math.floor(settings.height * scale),
    };
  }, [container, settings.width, settings.height]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-canvas">
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border">
        <label htmlFor="aspect" className="text-[11px] text-muted">
          Formato
        </label>
        <select
          id="aspect"
          value={settings.aspect}
          onChange={(e) => {
            const aspect = e.target.value as keyof typeof ASPECT_PRESETS;
            setAspect(aspect, ASPECT_PRESETS[aspect].width, ASPECT_PRESETS[aspect].height);
          }}
          className="bg-surface-2 border border-border-2 rounded-md px-2 py-0.5 text-xs"
        >
          {ASPECT_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {a} · {ASPECT_PRESETS[a].width}x{ASPECT_PRESETS[a].height}
            </option>
          ))}
        </select>
      </div>

      <div ref={containerRef} className="flex-1 min-h-0 grid place-items-center p-4 overflow-hidden">
        {canvas.width > 0 && (
          <div
            className="relative bg-black rounded-sm shadow-[0_4px_24px_rgba(145,70,255,.15)]"
            style={{ width: canvas.width, height: canvas.height }}
          >
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full"
              style={{ objectFit: "cover", visibility: inGap ? "hidden" : "visible" }}
            />
            {children?.(canvas)}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Mover MediaPanel a features y añadir "Añadir a la línea de tiempo"**

Mover `client/src/components/MediaPanel.tsx` → `client/src/features/media/MediaPanel.tsx` (ajustar imports relativos: `../stores/clipsStore` → `../../stores/clipsStore`). Dentro del botón de cada clip de la lista, debajo de la información existente, NO se cambia nada; en su lugar, añadir un botón secundario tras el botón del clip, dentro del mismo `<li>`:

```tsx
<button
  type="button"
  onClick={() => {
    useProjectStore.getState().addVideoClip(clip);
    useUiStore.getState().select(null);
  }}
  className="mt-1 w-full text-[11px] text-accent-soft border border-border-2 rounded-md py-1 hover:border-accent"
>
  + Añadir a la línea de tiempo
</button>
```

con los imports `import { useProjectStore } from "../../stores/projectStore";` y `import { useUiStore } from "../../stores/uiStore";`.

- [ ] **Step 5: Actualizar `AppShell.tsx` (transitorio hasta Task 7)**

Sustituir el import de `MediaPanel` por `import { MediaPanel } from "../features/media/MediaPanel";`. Sustituir `<PreviewPlayer />` por un placeholder `<div className="flex-1 grid place-items-center text-muted text-sm bg-canvas">Lienzo (Task 7)</div>` y eliminar el import y el fichero `PreviewPlayer.tsx` (`git rm client/src/components/PreviewPlayer.tsx`). `playerStore.ts` se conserva (lo usa TransportBar en Task 7).

- [ ] **Step 6: TopBar — nombre del proyecto y undo/redo (botones, lógica ya existe)**

Reemplazar `client/src/components/TopBar.tsx` por:

```tsx
import { useProjectStore } from "../stores/projectStore";

export function TopBar() {
  const name = useProjectStore((s) => s.project.name);
  const renameProject = useProjectStore((s) => s.renameProject);
  const dirty = useProjectStore((s) => s.dirty);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  return (
    <header className="flex items-center gap-3 bg-surface border-b border-border px-4 py-2">
      <h1 className="text-base font-bold">
        Clip<span className="text-accent">Forge</span>
      </h1>
      <input
        value={name}
        onChange={(e) => renameProject(e.target.value)}
        aria-label="Nombre del proyecto"
        className="bg-transparent border border-transparent hover:border-border-2 focus:border-accent rounded-md px-2 py-0.5 text-xs text-muted focus:text-text outline-none w-48"
      />
      {dirty && (
        <span className="text-[10px] text-muted" title="Cambios sin guardar">
          ●
        </span>
      )}
      <div className="flex items-center gap-1 ml-2">
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Deshacer (Ctrl+Z)"
          title="Deshacer (Ctrl+Z)"
          className="text-muted hover:text-text disabled:opacity-40 px-1.5 text-sm"
        >
          ↩
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          aria-label="Rehacer (Ctrl+Y)"
          title="Rehacer (Ctrl+Y)"
          className="text-muted hover:text-text disabled:opacity-40 px-1.5 text-sm"
        >
          ↪
        </button>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled
          title="Disponible en breve (esta misma rama, Task 12)"
          className="text-xs text-muted border border-border-2 rounded-full px-3 py-1.5 disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          disabled
          title="Disponible en el Hito 3"
          className="text-xs font-semibold text-white rounded-full px-4 py-1.5 bg-gradient-to-r from-accent to-accent-dark disabled:opacity-50"
        >
          Exportar
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 7: Typecheck, tests, commit y push**

Run: `npm run typecheck -w @clipforge/client && npm run test -w @clipforge/client`
Expected: limpio (PreviewPlayer eliminado sin referencias rotas).

```bash
git add client/src/stores/uiStore.ts client/src/features/preview/useElementSize.ts client/src/features/preview/PreviewCanvas.tsx client/src/features/media/MediaPanel.tsx client/src/components/AppShell.tsx client/src/components/TopBar.tsx
git rm client/src/components/MediaPanel.tsx client/src/components/PreviewPlayer.tsx
git commit -m "feat(client): uiStore, lienzo con marco de aspecto y barra superior con proyecto y deshacer"
git push
```

---

### Task 7: Motor de reproducción multi-clip y transporte sobre la línea de tiempo

**Files:**
- Create: `client/src/features/preview/usePlaybackEngine.ts`
- Create: `client/src/features/preview/TransportBar.tsx`
- Create: `client/src/features/preview/PreviewArea.tsx`
- Modify: `client/src/components/AppShell.tsx`

- [ ] **Step 1: Crear `client/src/features/preview/usePlaybackEngine.ts`**

Contrato: el playhead (uiStore) es la fuente de verdad del tiempo. Dentro de un clip, el `<video>` manda (timeupdate → playhead). En huecos, un rAF avanza el playhead hasta el siguiente clip. Al llegar al final del proyecto se detiene.

```ts
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useClipsStore } from "../../stores/clipsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { clipEnd, projectDuration, sourceTimeFor, videoClipAt } from "../../lib/timeline";

const SYNC_TOLERANCE = 0.15; // s de deriva admitida antes de re-sincronizar

export function usePlaybackEngine(videoRef: RefObject<HTMLVideoElement | null>) {
  const rafRef = useRef(0);
  const lastTickRef = useRef(0);

  /** Sincroniza el <video> con el playhead: src, currentTime y play/pause. */
  const sync = useCallback(
    (seeking: boolean) => {
      const video = videoRef.current;
      if (!video) return;
      const { playhead, playing } = useUiStore.getState();
      const project = useProjectStore.getState().project;
      const clips = useClipsStore.getState().clips;
      const active = videoClipAt(project.tracks.video, playhead);

      if (!active) {
        video.pause();
        return;
      }
      const info = clips.find((c) => c.id === active.clipId);
      if (!info) return;
      const src = `/files/${info.fileName}`;
      if (!video.src.endsWith(src)) {
        video.src = src;
      }
      const target = sourceTimeFor(active, playhead);
      if (seeking || Math.abs(video.currentTime - target) > SYNC_TOLERANCE) {
        video.currentTime = target;
      }
      if (playing && video.paused) void video.play();
      if (!playing && !video.paused) video.pause();
    },
    [videoRef],
  );

  // El <video> hace avanzar el playhead mientras hay clip activo
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => {
      const { playhead, playing } = useUiStore.getState();
      if (!playing) return;
      const project = useProjectStore.getState().project;
      const active = videoClipAt(project.tracks.video, playhead);
      if (!active) return;
      const t = active.timelineStart + (video.currentTime - active.trimIn) / active.speed;
      if (video.currentTime >= active.trimOut) {
        // fin del bloque: saltar justo después y dejar que el rAF/sync decidan
        useUiStore.getState().setPlayhead(clipEnd(active) + 0.0001);
        sync(true);
      } else {
        useUiStore.getState().setPlayhead(t);
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [videoRef, sync]);

  // rAF: avanza por los huecos y detiene al final del proyecto
  useEffect(() => {
    const unsub = useUiStore.subscribe((s, prev) => {
      if (s.playing === prev.playing) return;
      cancelAnimationFrame(rafRef.current);
      if (!s.playing) {
        sync(false);
        return;
      }
      lastTickRef.current = performance.now();
      const tick = (now: number) => {
        const { playhead, playing } = useUiStore.getState();
        if (!playing) return;
        const project = useProjectStore.getState().project;
        const total = projectDuration(project);
        if (playhead >= total) {
          useUiStore.getState().setPlaying(false);
          useUiStore.getState().setPlayhead(total);
          return;
        }
        const active = videoClipAt(project.tracks.video, playhead);
        if (!active) {
          // hueco: avanza con el reloj
          const delta = (now - lastTickRef.current) / 1000;
          useUiStore.getState().setPlayhead(playhead + delta);
          sync(false);
        }
        lastTickRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
      };
      sync(true);
      rafRef.current = requestAnimationFrame(tick);
    });
    return () => {
      unsub();
      cancelAnimationFrame(rafRef.current);
    };
  }, [sync]);

  /** Mueve el playhead (scrub, clic en regla, transporte). */
  const seek = useCallback(
    (t: number) => {
      const total = projectDuration(useProjectStore.getState().project);
      useUiStore.getState().setPlayhead(Math.min(Math.max(0, t), total));
      sync(true);
    },
    [sync],
  );

  const togglePlay = useCallback(() => {
    const { playing } = useUiStore.getState();
    useUiStore.getState().setPlaying(!playing);
  }, []);

  /** True si el playhead está en un hueco (sin clip de vídeo activo). */
  const inGap = useUiStore((s) => {
    const project = useProjectStore.getState().project;
    return videoClipAt(project.tracks.video, s.playhead) === null;
  });

  return { seek, togglePlay, inGap };
}
```

Nota: `useUiStore.subscribe(fn)` con dos argumentos requiere el middleware `subscribeWithSelector` **o** comparar manualmente; Zustand 5 básico pasa `(state, prevState)` a los listeners de `subscribe` — es la firma usada aquí, sin middleware.

- [ ] **Step 2: Crear `client/src/features/preview/TransportBar.tsx`**

Mismos controles B+C del Hito 1 pero operando sobre el playhead de la línea de tiempo (no sobre un único `<video>`): ⏮ a 0, ◀|/|▶ un fotograma (1/fps del proyecto), ▶/⏸, ⏭ al final, 🔁 bucle (al llegar al final con bucle activo, vuelve a 0 y sigue), barra de progreso 0→duración del proyecto, volumen (playerStore, aplicado al `<video>`), tiempo `mm:ss.t / mm:ss.t`.

```tsx
import { useEffect, type RefObject } from "react";
import { formatTimecode } from "../../lib/time";
import { projectDuration } from "../../lib/timeline";
import { usePlayerStore } from "../../stores/playerStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

interface TransportBarProps {
  seek: (t: number) => void;
  togglePlay: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  loop: boolean;
  setLoop: (l: boolean) => void;
}

export function TransportBar({ seek, togglePlay, videoRef, loop, setLoop }: TransportBarProps) {
  const playing = useUiStore((s) => s.playing);
  const playhead = useUiStore((s) => s.playhead);
  const fps = useProjectStore((s) => s.project.settings.fps);
  const duration = useProjectStore((s) => projectDuration(s.project));
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const frame = 1 / fps;

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.volume = volume;
  }, [volume, videoRef]);

  // Bucle: al agotar la duración con loop activo, vuelve al inicio
  useEffect(() => {
    if (loop && !playing && duration > 0 && playhead >= duration) {
      seek(0);
      useUiStore.getState().setPlaying(true);
    }
  }, [loop, playing, playhead, duration, seek]);

  const controlClass = "text-muted hover:text-text disabled:opacity-40 px-1 text-sm";

  return (
    <div className="px-6 pb-3 pt-2 flex flex-col gap-2 shrink-0 bg-canvas">
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.01}
        value={Math.min(playhead, duration)}
        onChange={(e) => seek(parseFloat(e.target.value))}
        disabled={duration === 0}
        aria-label="Posición de reproducción"
        className="w-full accent-accent h-1.5"
      />
      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={() => seek(0)} aria-label="Ir al inicio" className={controlClass}>⏮</button>
        <button type="button" onClick={() => seek(playhead - frame)} aria-label="Fotograma anterior" className={controlClass}>◀|</button>
        <button
          type="button"
          onClick={togglePlay}
          disabled={duration === 0}
          aria-label={playing ? "Pausar" : "Reproducir"}
          className="w-9 h-9 rounded-full bg-accent text-white grid place-items-center text-sm hover:bg-accent-dark disabled:opacity-40"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button type="button" onClick={() => seek(playhead + frame)} aria-label="Fotograma siguiente" className={controlClass}>|▶</button>
        <button type="button" onClick={() => seek(duration)} aria-label="Ir al final" className={controlClass}>⏭</button>
        <button
          type="button"
          onClick={() => setLoop(!loop)}
          aria-pressed={loop}
          aria-label="Bucle"
          className={`${controlClass} ${loop ? "text-accent" : ""}`}
        >
          🔁
        </button>
        <div className="flex items-center gap-1.5 ml-4">
          <span aria-hidden="true" className="text-muted text-xs">🔊</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            aria-label="Volumen"
            className="w-20 accent-accent h-1"
          />
        </div>
        <span className="font-mono text-[11px] text-muted ml-4">
          {formatTimecode(playhead)} / {formatTimecode(duration)}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Crear `client/src/features/preview/PreviewArea.tsx`**

Compone lienzo + transporte y posee el `videoRef`, el estado `loop` y el motor:

```tsx
import { useRef, useState } from "react";
import { PreviewCanvas } from "./PreviewCanvas";
import { TransportBar } from "./TransportBar";
import { usePlaybackEngine } from "./usePlaybackEngine";

export function PreviewArea() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loop, setLoop] = useState(false);
  const { seek, togglePlay, inGap } = usePlaybackEngine(videoRef);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PreviewCanvas videoRef={videoRef} inGap={inGap} />
      <TransportBar
        seek={seek}
        togglePlay={togglePlay}
        videoRef={videoRef}
        loop={loop}
        setLoop={setLoop}
      />
    </div>
  );
}
```

- [ ] **Step 4: Montar en `AppShell.tsx`**

Sustituir el placeholder `Lienzo (Task 7)` por `<PreviewArea />` con `import { PreviewArea } from "../features/preview/PreviewArea";`.

- [ ] **Step 5: Verificación manual**

Con `npm run dev`: añadir DOS veces el mismo clip a la línea de tiempo desde el panel de medios. Expected: el lienzo muestra el vídeo con el marco 9:16 (recortado con object-fit cover), ▶ reproduce la secuencia completa cruzando el límite entre bloques sin cortarse, el scrub salta a cualquier punto, ◀|/|▶ avanzan 1/30s, 🔁 reinicia al acabar. Cambiar el formato a 16:9 → el marco cambia al instante.

- [ ] **Step 6: Typecheck, tests, commit y push**

```bash
git add client/src/features/preview/usePlaybackEngine.ts client/src/features/preview/TransportBar.tsx client/src/features/preview/PreviewArea.tsx client/src/components/AppShell.tsx
git commit -m "feat(client): motor de reproducción multi-clip con transporte sobre la línea de tiempo"
git push
```

---

### Task 8: Overlays Konva con Transformer y herramientas Texto/Imagen

**Files:**
- Create: `client/src/features/preview/OverlayLayer.tsx`
- Create: `client/src/features/image/ImagePanel.tsx`
- Modify: `client/src/features/preview/PreviewCanvas.tsx` (ya acepta `children`, solo conectar)
- Modify: `client/src/features/preview/PreviewArea.tsx`
- Modify: `client/src/components/ToolRail.tsx`, `client/src/components/AppShell.tsx`

- [ ] **Step 1: Crear `client/src/features/preview/OverlayLayer.tsx`**

Reglas: solo se pintan los overlays visibles en el playhead; el seleccionado lleva `Transformer` (esquinas + rotación). Las posiciones se guardan normalizadas; los nodos usan `offsetX/offsetY` para que `x,y` sean el centro. Texto: el resize por esquinas escala `fontSize`. Imagen: escala `width/height`. Arrastres = transacción + updates transitorias; `dragend/transformend` ya quedan en la única entrada de historial creada por `beginTransaction`.

```tsx
import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Image as KonvaImage, Layer, Stage, Text as KonvaText, Transformer } from "react-konva";
import type { ImageOverlay, TextOverlay } from "@clipforge/shared";
import { clamp01 } from "../../lib/normalized";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

interface OverlayLayerProps {
  width: number;  // px del lienzo en pantalla
  height: number;
}

function useHtmlImage(src: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const image = new window.Image();
    image.src = src;
    image.onload = () => setImg(image);
    return () => setImg(null);
  }, [src]);
  return img;
}

function ImageNode({ overlay, width, height, selected }: {
  overlay: ImageOverlay; width: number; height: number; selected: boolean;
}) {
  const img = useHtmlImage(`/assets/${overlay.fileName}`);
  const ref = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const updateImage = useProjectStore((s) => s.updateImage);
  const beginTransaction = useProjectStore((s) => s.beginTransaction);
  const select = useUiStore((s) => s.select);

  useEffect(() => {
    if (selected && ref.current && trRef.current) {
      trRef.current.nodes([ref.current]);
    }
  }, [selected, img]);

  if (!img) return null;
  const w = overlay.width * width;
  const h = overlay.height * height;

  return (
    <>
      <KonvaImage
        ref={ref}
        image={img}
        x={overlay.x * width}
        y={overlay.y * height}
        width={w}
        height={h}
        offsetX={w / 2}
        offsetY={h / 2}
        rotation={overlay.rotation}
        opacity={overlay.opacity}
        draggable
        onMouseDown={() => select({ kind: "image", id: overlay.id })}
        onTap={() => select({ kind: "image", id: overlay.id })}
        onDragStart={() => beginTransaction()}
        onDragMove={(e) =>
          updateImage(
            overlay.id,
            { x: clamp01(e.target.x() / width), y: clamp01(e.target.y() / height) },
            { transient: true },
          )
        }
        onTransformStart={() => beginTransaction()}
        onTransformEnd={(e) => {
          const node = e.target;
          updateImage(
            overlay.id,
            {
              x: clamp01(node.x() / width),
              y: clamp01(node.y() / height),
              width: clamp01((w * node.scaleX()) / width),
              height: clamp01((h * node.scaleY()) / height),
              rotation: node.rotation(),
            },
            { transient: true },
          );
          node.scaleX(1);
          node.scaleY(1);
        }}
      />
      {selected && <Transformer ref={trRef} rotateEnabled flipEnabled={false} />}
    </>
  );
}

function TextNode({ overlay, width, height, selected }: {
  overlay: TextOverlay; width: number; height: number; selected: boolean;
}) {
  const ref = useRef<Konva.Text>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const updateText = useProjectStore((s) => s.updateText);
  const beginTransaction = useProjectStore((s) => s.beginTransaction);
  const select = useUiStore((s) => s.select);

  useEffect(() => {
    if (selected && ref.current && trRef.current) {
      trRef.current.nodes([ref.current]);
    }
  }, [selected, overlay.content, overlay.fontSize]);

  // Centro como origen: Konva.Text no conoce su tamaño hasta renderizar,
  // así que el offset se recalcula tras cada render (barato, solo lectura+set)
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.offsetX(node.width() / 2);
    node.offsetY(node.height() / 2);
    node.getLayer()?.batchDraw();
  });

  const fontSize = overlay.fontSize * height;

  return (
    <>
      <KonvaText
        ref={ref}
        text={overlay.content}
        fontFamily={overlay.fontFamily}
        fontSize={fontSize}
        fill={overlay.fill}
        stroke={overlay.stroke || undefined}
        strokeWidth={overlay.strokeWidth * height}
        shadowColor="black"
        shadowBlur={overlay.shadow ? fontSize * 0.15 : 0}
        shadowOpacity={overlay.shadow ? 0.8 : 0}
        x={overlay.x * width}
        y={overlay.y * height}
        rotation={overlay.rotation}
        opacity={overlay.opacity}
        draggable
        onMouseDown={() => select({ kind: "text", id: overlay.id })}
        onTap={() => select({ kind: "text", id: overlay.id })}
        onDragStart={() => beginTransaction()}
        onDragMove={(e) =>
          updateText(
            overlay.id,
            { x: clamp01(e.target.x() / width), y: clamp01(e.target.y() / height) },
            { transient: true },
          )
        }
        onTransformStart={() => beginTransaction()}
        onTransformEnd={(e) => {
          const node = e.target;
          updateText(
            overlay.id,
            {
              x: clamp01(node.x() / width),
              y: clamp01(node.y() / height),
              fontSize: Math.min(1, Math.max(0.005, overlay.fontSize * node.scaleY())),
              rotation: node.rotation(),
            },
            { transient: true },
          );
          node.scaleX(1);
          node.scaleY(1);
        }}
      />
      {selected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          flipEnabled={false}
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
        />
      )}
    </>
  );
}
```

Nota: `KonvaImage` mantiene `offsetX/offsetY` en JSX porque su tamaño es conocido; `KonvaText` los recalcula en el efecto porque Konva no conoce el ancho del texto hasta renderizarlo.

Y el componente principal:

```tsx
export function OverlayLayer({ width, height }: OverlayLayerProps) {
  const playhead = useUiStore((s) => s.playhead);
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const texts = useProjectStore((s) => s.project.tracks.text);
  const images = useProjectStore((s) => s.project.tracks.image);

  const visibleTexts = texts.filter((t) => playhead >= t.start && playhead < t.end);
  const visibleImages = images.filter((i) => playhead >= i.start && playhead < i.end);

  return (
    <Stage
      width={width}
      height={height}
      className="absolute inset-0"
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) select(null);
      }}
    >
      <Layer>
        {visibleImages.map((o) => (
          <ImageNode
            key={o.id}
            overlay={o}
            width={width}
            height={height}
            selected={selection?.kind === "image" && selection.id === o.id}
          />
        ))}
        {visibleTexts.map((o) => (
          <TextNode
            key={o.id}
            overlay={o}
            width={width}
            height={height}
            selected={selection?.kind === "text" && selection.id === o.id}
          />
        ))}
      </Layer>
    </Stage>
  );
}
```

- [ ] **Step 2: Conectar la capa en `PreviewArea.tsx`**

```tsx
<PreviewCanvas videoRef={videoRef} inGap={inGap}>
  {(canvas) => <OverlayLayer width={canvas.width} height={canvas.height} />}
</PreviewCanvas>
```

- [ ] **Step 3: Crear `client/src/features/image/ImagePanel.tsx`**

```tsx
import { useRef, useState } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

interface UploadedAsset {
  assetId: string;
  fileName: string;
}

export function ImagePanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/assets", { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error);
      }
      const asset = (await res.json()) as UploadedAsset;
      setAssets((prev) => [asset, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la imagen");
    } finally {
      setUploading(false);
    }
  };

  const insert = (asset: UploadedAsset) => {
    const img = new Image();
    img.src = `/assets/${asset.fileName}`;
    img.onload = () => {
      const project = useProjectStore.getState().project;
      const canvasRatio = project.settings.width / project.settings.height;
      const imageRatio = img.naturalWidth / img.naturalHeight;
      // ancho por defecto 30% del lienzo, alto según la proporción real
      const width = 0.3;
      const height = Math.min(1, (width / imageRatio) * canvasRatio);
      const playhead = useUiStore.getState().playhead;
      const id = useProjectStore
        .getState()
        .addImage(asset.assetId, asset.fileName, playhead, width, height);
      useUiStore.getState().select({ kind: "image", id });
    };
  };

  return (
    <section
      aria-label="Imágenes"
      className="w-56 bg-surface-2/50 border-r border-border p-3 flex flex-col gap-3 overflow-y-auto"
    >
      <h2 className="text-xs font-bold tracking-wide">IMAGEN</h2>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="text-xs font-semibold text-white rounded-md py-1.5 bg-gradient-to-r from-accent to-accent-dark disabled:opacity-50"
      >
        {uploading ? "Subiendo..." : "Subir imagen"}
      </button>
      {error && (
        <p role="alert" className="text-[11px] text-danger">{error}</p>
      )}
      <ul className="grid grid-cols-2 gap-1.5" aria-label="Imágenes subidas">
        {assets.length === 0 && (
          <li className="col-span-2 text-[11px] text-muted">
            Sube una imagen y haz clic para insertarla en el playhead.
          </li>
        )}
        {assets.map((a) => (
          <li key={a.assetId}>
            <button
              type="button"
              onClick={() => insert(a)}
              className="w-full aspect-square bg-surface-2 rounded-md overflow-hidden border border-transparent hover:border-accent"
            >
              <img src={`/assets/${a.fileName}`} alt="Insertar imagen en el lienzo" className="w-full h-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: ToolRail con herramientas activas y panel contextual**

Reemplazar `client/src/components/ToolRail.tsx`:

```tsx
import { useProjectStore } from "../stores/projectStore";
import { useUiStore, type Tool } from "../stores/uiStore";

const TOOLS: Array<{ id: string; icon: string; label: string; enabled: boolean }> = [
  { id: "media", icon: "🎬", label: "Medios", enabled: true },
  { id: "text", icon: "📝", label: "Texto", enabled: true },
  { id: "image", icon: "🖼️", label: "Imagen", enabled: true },
  { id: "audio", icon: "🎵", label: "Audio", enabled: false },
  { id: "filters", icon: "🎨", label: "Filtros", enabled: false },
  { id: "speed", icon: "⚡", label: "Velocidad", enabled: false },
];

export function ToolRail() {
  const activeTool = useUiStore((s) => s.activeTool);
  const setActiveTool = useUiStore((s) => s.setActiveTool);

  const onTool = (id: string) => {
    if (id === "text") {
      // Texto: acción directa — crea un overlay en el playhead y lo selecciona
      const playhead = useUiStore.getState().playhead;
      const newId = useProjectStore.getState().addText(playhead);
      useUiStore.getState().select({ kind: "text", id: newId });
      return;
    }
    setActiveTool(id as Tool);
  };

  return (
    <nav
      aria-label="Herramientas"
      className="w-16 bg-surface border-r border-border flex flex-col items-center gap-1 py-2"
    >
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          disabled={!tool.enabled}
          aria-pressed={tool.enabled && tool.id !== "text" ? tool.id === activeTool : undefined}
          title={tool.enabled ? tool.label : `${tool.label} — próximos hitos`}
          onClick={() => onTool(tool.id)}
          className={`w-12 rounded-lg py-1.5 text-center text-[10px] disabled:opacity-40 ${
            tool.id === activeTool
              ? "bg-accent/15 border border-accent text-accent-soft"
              : "text-muted hover:text-text"
          }`}
        >
          <span className="block text-base" aria-hidden="true">{tool.icon}</span>
          {tool.label}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: Panel contextual en `AppShell.tsx`**

Sustituir `<MediaPanel />` por:

```tsx
{activeTool === "media" && <MediaPanel />}
{activeTool === "image" && <ImagePanel />}
```

con `const activeTool = useUiStore((s) => s.activeTool);`, e imports de `ImagePanel` y `useUiStore`.

- [ ] **Step 6: Verificación manual**

Con `npm run dev`: añadir un clip a la línea, pulsar la herramienta **Texto** → aparece "Texto" centrado, seleccionado con asas; arrastrar lo mueve, las esquinas lo escalan, el asa superior lo rota. Subir una imagen desde **Imagen**, insertarla y manipularla igual. Clic en zona vacía del lienzo deselecciona. Pausar en un instante fuera de la ventana del overlay → desaparece del lienzo.

- [ ] **Step 7: Typecheck, tests, commit y push**

```bash
git add client/src/features/preview/OverlayLayer.tsx client/src/features/image/ImagePanel.tsx client/src/features/preview/PreviewArea.tsx client/src/components/ToolRail.tsx client/src/components/AppShell.tsx
git commit -m "feat(client): overlays de texto e imagen con Konva Transformer y herramientas activas"
git push
```

---

### Task 9: Timeline — regla, playhead, zoom y bloques arrastrables

**Files:**
- Create: `client/src/features/timeline/TimeRuler.tsx`
- Create: `client/src/features/timeline/TrackRow.tsx`
- Create: `client/src/features/timeline/Timeline.tsx`
- Modify: `client/src/components/AppShell.tsx`

El timeline necesita el `seek` del motor; `PreviewArea` lo expone vía contexto ligero. Modificar `PreviewArea.tsx` para exportar un contexto:

- [ ] **Step 1: Contexto del motor en `PreviewArea.tsx`**

```tsx
import { createContext, useContext } from "react";

export const PlaybackContext = createContext<{ seek: (t: number) => void }>({ seek: () => {} });
export function usePlayback() {
  return useContext(PlaybackContext);
}
```

`PreviewArea` envuelve su contenido con `<PlaybackContext.Provider value={{ seek }}>`. **El provider debe envolver también el Timeline**, así que se mueve a `AppShell`: `PreviewArea` pasa a recibir nada y `AppShell` queda:

```tsx
export function AppShell() {
  const activeTool = useUiStore((s) => s.activeTool);
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <PlaybackProvider>
        <div className="flex flex-1 min-h-0">
          <ToolRail />
          <main className="flex flex-1 min-w-0">
            {activeTool === "media" && <MediaPanel />}
            {activeTool === "image" && <ImagePanel />}
            <PreviewArea />
          </main>
          <aside aria-label="Propiedades" className="w-72 bg-surface border-l border-border p-3 text-xs text-muted">
            Propiedades — Task 11
          </aside>
        </div>
        <Timeline />
      </PlaybackProvider>
    </div>
  );
}
```

donde `PlaybackProvider` es un componente nuevo en `PreviewArea.tsx` que posee `videoRef` + motor y renderiza el provider; `PreviewArea` consume el contexto. Estructura final del fichero `PreviewArea.tsx`:

```tsx
import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from "react";
import { OverlayLayer } from "./OverlayLayer";
import { PreviewCanvas } from "./PreviewCanvas";
import { TransportBar } from "./TransportBar";
import { usePlaybackEngine } from "./usePlaybackEngine";

interface PlaybackApi {
  seek: (t: number) => void;
  togglePlay: () => void;
  inGap: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
}

const PlaybackContext = createContext<PlaybackApi | null>(null);

export function usePlayback(): PlaybackApi {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback debe usarse dentro de PlaybackProvider");
  return ctx;
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const engine = usePlaybackEngine(videoRef);
  return (
    <PlaybackContext.Provider value={{ ...engine, videoRef }}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function PreviewArea() {
  const { seek, togglePlay, inGap, videoRef } = usePlayback();
  const [loop, setLoop] = useState(false);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PreviewCanvas videoRef={videoRef} inGap={inGap}>
        {(canvas) => <OverlayLayer width={canvas.width} height={canvas.height} />}
      </PreviewCanvas>
      <TransportBar
        seek={seek}
        togglePlay={togglePlay}
        videoRef={videoRef}
        loop={loop}
        setLoop={setLoop}
      />
    </div>
  );
}
```

- [ ] **Step 2: Crear `client/src/features/timeline/TimeRuler.tsx`**

```tsx
import { useMemo } from "react";

interface TimeRulerProps {
  duration: number;
  pxPerSecond: number;
  onSeek: (t: number) => void;
}

/** Intervalo de marca "bonito" según el zoom: ≥80px entre marcas mayores. */
function tickInterval(pxPerSecond: number): number {
  const candidates = [0.5, 1, 2, 5, 10, 30, 60];
  return candidates.find((c) => c * pxPerSecond >= 80) ?? 60;
}

export function TimeRuler({ duration, pxPerSecond, onSeek }: TimeRulerProps) {
  const interval = tickInterval(pxPerSecond);
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= duration + interval; t += interval) out.push(t);
    return out;
  }, [duration, interval]);

  return (
    <div
      role="presentation"
      className="relative h-6 border-b border-border cursor-pointer select-none"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientX - rect.left) / pxPerSecond);
      }}
    >
      {ticks.map((t) => (
        <span
          key={t}
          className="absolute top-0 h-full border-l border-border-2 pl-1 text-[9px] text-muted font-mono"
          style={{ left: t * pxPerSecond }}
        >
          {t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}` : `${t}s`}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Crear `client/src/features/timeline/TrackRow.tsx`**

Bloques genéricos por pista. Drag con Pointer Events (no HTML5 drag&drop): `setPointerCapture`, el centro del arrastre usa snapping. Las zonas de 8px en los bordes preparan el trim (Task 10) — en esta task solo mueven.

```tsx
import { useRef } from "react";
import type { Project } from "@clipforge/shared";
import { findSnapPoints, snapTime } from "../../lib/timeline";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore, type Selection } from "../../stores/uiStore";

export interface BlockDescriptor {
  id: string;
  kind: Selection["kind"];
  start: number;
  end: number;
  label: string;
  color: string; // clases tailwind del bloque
}

interface TrackRowProps {
  title: string;
  blocks: BlockDescriptor[];
  pxPerSecond: number;
  /** Mueve el bloque a un nuevo start (ya con snap aplicado). */
  onMove: (id: string, newStart: number, transient: boolean) => void;
}

const SNAP_PX = 8;

export function TrackRow({ title, blocks, pxPerSecond, onMove }: TrackRowProps) {
  // started: la transacción de historial se abre en el PRIMER movimiento real,
  // no en el pointerdown — un simple clic de selección no debe crear entrada de undo
  const dragRef = useRef<{ id: string; offsetT: number; started: boolean } | null>(null);
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const beginTransaction = useProjectStore((s) => s.beginTransaction);

  const snapThreshold = SNAP_PX / pxPerSecond;

  const projectFor = (): Project => useProjectStore.getState().project;

  return (
    <div className="flex border-b border-border/60">
      <div className="w-20 shrink-0 px-2 py-1 text-[10px] text-muted border-r border-border bg-surface sticky left-0 z-10">
        {title}
      </div>
      <div className="relative h-9 flex-1">
        {blocks.map((b) => {
          const selected = selection?.id === b.id;
          return (
            <button
              key={b.id}
              type="button"
              aria-label={`${title}: ${b.label}`}
              aria-pressed={selected}
              className={`absolute top-1 h-7 rounded-md border text-[10px] truncate px-1.5 text-left cursor-grab active:cursor-grabbing ${b.color} ${
                selected ? "border-accent ring-1 ring-accent" : "border-transparent"
              }`}
              style={{ left: b.start * pxPerSecond, width: Math.max(8, (b.end - b.start) * pxPerSecond) }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                select({ kind: b.kind, id: b.id });
                const rect = e.currentTarget.getBoundingClientRect();
                dragRef.current = {
                  id: b.id,
                  offsetT: (e.clientX - rect.left) / pxPerSecond,
                  started: false,
                };
              }}
              onPointerMove={(e) => {
                const drag = dragRef.current;
                if (!drag || drag.id !== b.id) return;
                if (!drag.started) {
                  beginTransaction();
                  drag.started = true;
                }
                const trackRect = e.currentTarget.parentElement!.getBoundingClientRect();
                const rawStart = (e.clientX - trackRect.left) / pxPerSecond - drag.offsetT;
                const points = findSnapPoints(projectFor(), b.id);
                const snapped = snapTime(Math.max(0, rawStart), points, snapThreshold);
                onMove(b.id, snapped, true);
              }}
              onPointerUp={() => {
                dragRef.current = null;
              }}
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Crear `client/src/features/timeline/Timeline.tsx`**

```tsx
import { useMemo } from "react";
import { clipEnd, projectDuration } from "../../lib/timeline";
import { useClipsStore } from "../../stores/clipsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { usePlayback } from "../preview/PreviewArea";
import { TimeRuler } from "./TimeRuler";
import { TrackRow, type BlockDescriptor } from "./TrackRow";

export function Timeline() {
  const { seek } = usePlayback();
  const project = useProjectStore((s) => s.project);
  const moveVideoClip = useProjectStore((s) => s.moveVideoClip);
  const moveOverlay = useProjectStore((s) => s.moveOverlay);
  const playhead = useUiStore((s) => s.playhead);
  const pxPerSecond = useUiStore((s) => s.pxPerSecond);
  const setZoom = useUiStore((s) => s.setZoom);
  const clips = useClipsStore((s) => s.clips);

  const duration = projectDuration(project);
  const contentWidth = Math.max(600, (duration + 5) * pxPerSecond);

  const videoBlocks: BlockDescriptor[] = useMemo(
    () =>
      project.tracks.video.map((c) => ({
        id: c.id,
        kind: "video" as const,
        start: c.timelineStart,
        end: clipEnd(c),
        label: clips.find((i) => i.id === c.clipId)?.title ?? "clip",
        color: "bg-accent/25 text-accent-soft",
      })),
    [project.tracks.video, clips],
  );

  const textBlocks: BlockDescriptor[] = project.tracks.text.map((t) => ({
    id: t.id,
    kind: "text" as const,
    start: t.start,
    end: t.end,
    label: t.content || "texto",
    color: "bg-emerald-500/20 text-emerald-200",
  }));

  const imageBlocks: BlockDescriptor[] = project.tracks.image.map((i) => ({
    id: i.id,
    kind: "image" as const,
    start: i.start,
    end: i.end,
    label: i.fileName,
    color: "bg-amber-500/20 text-amber-200",
  }));

  return (
    <footer className="h-44 bg-surface border-t border-border flex flex-col shrink-0">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-border">
        <span className="text-[10px] text-muted">Línea de tiempo</span>
        <label htmlFor="tl-zoom" className="ml-auto text-[10px] text-muted">Zoom</label>
        <input
          id="tl-zoom"
          type="range"
          min={5}
          max={400}
          step={5}
          value={pxPerSecond}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          aria-label="Zoom de la línea de tiempo"
          className="w-28 accent-accent h-1"
        />
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="relative" style={{ width: contentWidth }}>
          <div className="ml-20">
            <TimeRuler duration={duration} pxPerSecond={pxPerSecond} onSeek={seek} />
          </div>
          <TrackRow
            title="Vídeo"
            blocks={videoBlocks}
            pxPerSecond={pxPerSecond}
            onMove={(id, t, transient) => moveVideoClip(id, t, { transient })}
          />
          <TrackRow
            title="Texto"
            blocks={textBlocks}
            pxPerSecond={pxPerSecond}
            onMove={(id, t, transient) => moveOverlay("text", id, t, { transient })}
          />
          <TrackRow
            title="Imagen"
            blocks={imageBlocks}
            pxPerSecond={pxPerSecond}
            onMove={(id, t, transient) => moveOverlay("image", id, t, { transient })}
          />
          {/* Playhead */}
          <div
            aria-hidden="true"
            className="absolute top-0 bottom-0 w-px bg-accent pointer-events-none"
            style={{ left: 80 + playhead * pxPerSecond }}
          >
            <div className="w-2.5 h-2.5 -ml-[5px] rotate-45 bg-accent" />
          </div>
        </div>
      </div>
    </footer>
  );
}
```

Nota de coherencia: los bloques de los `TrackRow` se posicionan respecto a la pista (que ya está tras la cabecera de 80px / clase `w-20`), pero el playhead vive en el contenedor absoluto, por eso suma `80`.

- [ ] **Step 5: Montar en `AppShell.tsx`** (sustituir el `<footer>` placeholder por `<Timeline />`, dentro del `PlaybackProvider` como quedó en el Step 1).

- [ ] **Step 6: Verificación manual**

Añadir 2 clips, un texto y una imagen. Expected: 3 pistas con bloques en su sitio; arrastrar un bloque de vídeo lo mueve con imán a los bordes de otros bloques (no permite solapar); arrastrar texto/imagen es libre; clic en la regla mueve el playhead y el lienzo salta a ese instante; el zoom cambia la escala; el playhead avanza durante la reproducción.

- [ ] **Step 7: Typecheck, tests, commit y push**

```bash
git add client/src/features/timeline client/src/features/preview/PreviewArea.tsx client/src/components/AppShell.tsx
git commit -m "feat(client): línea de tiempo con regla, playhead, zoom y bloques arrastrables con imán"
git push
```

---

### Task 10: Trim por bordes, split y eliminar en el timeline

**Files:**
- Modify: `client/src/features/timeline/TrackRow.tsx`
- Modify: `client/src/features/timeline/Timeline.tsx`

- [ ] **Step 1: Asas de trim en `TrackRow.tsx`**

Añadir a `TrackRowProps`:

```ts
  /** Recorta un borde del bloque al instante t (ya con snap aplicado). */
  onTrim: (id: string, edge: "start" | "end", t: number, transient: boolean) => void;
```

En el render del bloque, detectar en `onPointerDown` si el puntero cae en los 8px de un borde y guardar el modo en `dragRef`:

```ts
const EDGE_PX = 8;
// dragRef pasa a: { id: string; mode: "move" | "trim-start" | "trim-end"; offsetT: number; started: boolean } | null
```

```tsx
onPointerDown={(e) => {
  e.currentTarget.setPointerCapture(e.pointerId);
  select({ kind: b.kind, id: b.id });
  const rect = e.currentTarget.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const mode =
    px < EDGE_PX ? "trim-start" : px > rect.width - EDGE_PX ? "trim-end" : "move";
  dragRef.current = { id: b.id, mode, offsetT: px / pxPerSecond, started: false };
}}
onPointerMove={(e) => {
  const drag = dragRef.current;
  if (!drag || drag.id !== b.id) return;
  if (!drag.started) {
    beginTransaction(); // primer movimiento real: una sola entrada de undo por arrastre
    drag.started = true;
  }
  const trackRect = e.currentTarget.parentElement!.getBoundingClientRect();
  const pointerT = (e.clientX - trackRect.left) / pxPerSecond;
  const points = findSnapPoints(projectFor(), b.id);
  if (drag.mode === "move") {
    const snapped = snapTime(Math.max(0, pointerT - drag.offsetT), points, snapThreshold);
    onMove(b.id, snapped, true);
  } else {
    const snapped = snapTime(Math.max(0, pointerT), points, snapThreshold);
    onTrim(b.id, drag.mode === "trim-start" ? "start" : "end", snapped, true);
  }
}}
```

Añadir también indicadores visuales de borde dentro del botón del bloque:

```tsx
<span aria-hidden="true" className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize rounded-l-md bg-white/10" />
<span aria-hidden="true" className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize rounded-r-md bg-white/10" />
```

- [ ] **Step 2: Conectar `onTrim` y los botones de acción en `Timeline.tsx`**

En cada `TrackRow`, pasar el handler:

```tsx
onTrim={(id, edge, t, transient) => trimVideoClip(id, edge, t, { transient })}        // pista vídeo
onTrim={(id, edge, t, transient) => trimOverlay("text", id, edge, t, { transient })}  // pista texto
onTrim={(id, edge, t, transient) => trimOverlay("image", id, edge, t, { transient })} // pista imagen
```

(con `const trimVideoClip = useProjectStore((s) => s.trimVideoClip);` y `trimOverlay` análogo).

En la cabecera del timeline (junto al zoom), añadir botones de acción:

```tsx
<button
  type="button"
  onClick={() => useProjectStore.getState().splitVideoAt(useUiStore.getState().playhead)}
  title="Dividir en el playhead (S)"
  aria-label="Dividir clip en el playhead"
  className="text-muted hover:text-text text-xs px-1.5"
>
  ✂ Dividir
</button>
<button
  type="button"
  onClick={() => {
    const sel = useUiStore.getState().selection;
    if (!sel) return;
    useProjectStore.getState().removeElement(sel.kind, sel.id);
    useUiStore.getState().select(null);
  }}
  title="Eliminar seleccionado (Supr)"
  aria-label="Eliminar elemento seleccionado"
  className="text-muted hover:text-danger text-xs px-1.5"
>
  🗑 Eliminar
</button>
```

- [ ] **Step 3: Verificación manual**

Arrastrar el borde derecho de un clip de vídeo lo acorta (la preview deja de reproducir ese tramo); el borde izquierdo recorta el inicio manteniendo el contenido alineado; ✂ con el playhead sobre un clip lo parte en dos bloques que se reproducen seguidos; 🗑 elimina el seleccionado; Ctrl+Z deshace cada operación de una en una (un arrastre completo = una entrada).

- [ ] **Step 4: Typecheck, tests, commit y push**

```bash
git add client/src/features/timeline/TrackRow.tsx client/src/features/timeline/Timeline.tsx
git commit -m "feat(client): recorte por bordes, división en el playhead y eliminación desde la línea de tiempo"
git push
```

---

### Task 11: Panel de propiedades contextual

**Files:**
- Create: `client/src/features/properties/PropertiesPanel.tsx`
- Modify: `client/src/components/AppShell.tsx`

- [ ] **Step 1: Crear `client/src/features/properties/PropertiesPanel.tsx`**

```tsx
import type { ReactNode } from "react";
import type { ImageOverlay, TextOverlay } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

export const FONT_FAMILIES = [
  "Segoe UI",
  "Arial",
  "Arial Black",
  "Impact",
  "Georgia",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Times New Roman",
  "Courier New",
  "Comic Sans MS",
] as const;

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[11px] text-muted">{label}</label>
      {children}
    </div>
  );
}

function Slider({ id, min, max, step, value, onChange }: {
  id: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="accent-accent h-1.5"
    />
  );
}

const inputClass =
  "bg-surface-2 border border-border-2 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-accent";

function TextProperties({ overlay }: { overlay: TextOverlay }) {
  const updateText = useProjectStore((s) => s.updateText);
  const u = (patch: Partial<TextOverlay>) => updateText(overlay.id, patch);

  return (
    <div className="flex flex-col gap-3">
      <Field label="Texto" htmlFor="prop-content">
        <textarea
          id="prop-content"
          value={overlay.content}
          onChange={(e) => u({ content: e.target.value })}
          rows={2}
          className={inputClass}
        />
      </Field>
      <Field label="Fuente" htmlFor="prop-font">
        <select
          id="prop-font"
          value={overlay.fontFamily}
          onChange={(e) => u({ fontFamily: e.target.value })}
          className={inputClass}
          style={{ fontFamily: overlay.fontFamily }}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
          ))}
        </select>
      </Field>
      <Field label={`Tamaño · ${Math.round(overlay.fontSize * 1000)}`} htmlFor="prop-size">
        <Slider id="prop-size" min={0.01} max={0.3} step={0.005} value={overlay.fontSize} onChange={(v) => u({ fontSize: v })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Relleno" htmlFor="prop-fill">
          <input id="prop-fill" type="color" value={overlay.fill} onChange={(e) => u({ fill: e.target.value })} className="h-8 w-full bg-surface-2 rounded-md border border-border-2" />
        </Field>
        <Field label="Borde" htmlFor="prop-stroke">
          <input id="prop-stroke" type="color" value={overlay.stroke || "#000000"} onChange={(e) => u({ stroke: e.target.value })} className="h-8 w-full bg-surface-2 rounded-md border border-border-2" />
        </Field>
      </div>
      <Field label={`Grosor del borde · ${Math.round(overlay.strokeWidth * 1000)}`} htmlFor="prop-strokew">
        <Slider id="prop-strokew" min={0} max={0.02} step={0.001} value={overlay.strokeWidth} onChange={(v) => u({ strokeWidth: v })} />
      </Field>
      <div className="flex items-center gap-2">
        <input
          id="prop-shadow"
          type="checkbox"
          checked={overlay.shadow}
          onChange={(e) => u({ shadow: e.target.checked })}
          className="accent-accent"
        />
        <label htmlFor="prop-shadow" className="text-[11px] text-muted">Sombra</label>
      </div>
      <CommonOverlayProps
        opacity={overlay.opacity}
        rotation={overlay.rotation}
        onOpacity={(v) => u({ opacity: v })}
        onRotation={(v) => u({ rotation: v })}
      />
    </div>
  );
}

function ImageProperties({ overlay }: { overlay: ImageOverlay }) {
  const updateImage = useProjectStore((s) => s.updateImage);
  const u = (patch: Partial<ImageOverlay>) => updateImage(overlay.id, patch);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-muted truncate" title={overlay.fileName}>{overlay.fileName}</p>
      <Field label={`Ancho · ${Math.round(overlay.width * 100)}%`} htmlFor="prop-w">
        <Slider id="prop-w" min={0.02} max={1} step={0.01} value={overlay.width} onChange={(v) => u({ width: v })} />
      </Field>
      <Field label={`Alto · ${Math.round(overlay.height * 100)}%`} htmlFor="prop-h">
        <Slider id="prop-h" min={0.02} max={1} step={0.01} value={overlay.height} onChange={(v) => u({ height: v })} />
      </Field>
      <CommonOverlayProps
        opacity={overlay.opacity}
        rotation={overlay.rotation}
        onOpacity={(v) => u({ opacity: v })}
        onRotation={(v) => u({ rotation: v })}
      />
    </div>
  );
}

function CommonOverlayProps({ opacity, rotation, onOpacity, onRotation }: {
  opacity: number; rotation: number; onOpacity: (v: number) => void; onRotation: (v: number) => void;
}) {
  return (
    <>
      <Field label={`Opacidad · ${Math.round(opacity * 100)}%`} htmlFor="prop-opacity">
        <Slider id="prop-opacity" min={0} max={1} step={0.01} value={opacity} onChange={onOpacity} />
      </Field>
      <Field label={`Rotación · ${Math.round(rotation)}°`} htmlFor="prop-rotation">
        <Slider id="prop-rotation" min={-180} max={180} step={1} value={rotation} onChange={onRotation} />
      </Field>
    </>
  );
}

function VideoProperties({ clipId }: { clipId: string }) {
  const originalAudioVolume = useProjectStore((s) => s.project.originalAudioVolume);
  const setOriginalAudioVolume = useProjectStore((s) => s.setOriginalAudioVolume);
  const clip = useProjectStore((s) => s.project.tracks.video.find((c) => c.id === clipId));
  if (!clip) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-muted">
        Recorte: {clip.trimIn.toFixed(2)}s – {clip.trimOut.toFixed(2)}s
      </p>
      <Field label={`Volumen del clip · ${Math.round(originalAudioVolume * 100)}%`} htmlFor="prop-vol">
        <Slider id="prop-vol" min={0} max={1} step={0.01} value={originalAudioVolume} onChange={setOriginalAudioVolume} />
      </Field>
      <p className="text-[10px] text-muted">Velocidad, zoom y filtros llegan en el Hito 4.</p>
    </div>
  );
}

export function PropertiesPanel() {
  const selection = useUiStore((s) => s.selection);
  const text = useProjectStore((s) =>
    selection?.kind === "text" ? s.project.tracks.text.find((t) => t.id === selection.id) : undefined,
  );
  const image = useProjectStore((s) =>
    selection?.kind === "image" ? s.project.tracks.image.find((i) => i.id === selection.id) : undefined,
  );

  return (
    <aside
      aria-label="Propiedades"
      className="w-72 bg-surface border-l border-border p-3 overflow-y-auto shrink-0"
    >
      <h2 className="text-xs font-bold tracking-wide mb-3">PROPIEDADES</h2>
      {!selection && (
        <p className="text-[11px] text-muted">
          Selecciona un elemento en el lienzo o en la línea de tiempo.
        </p>
      )}
      {text && <TextProperties overlay={text} />}
      {image && <ImageProperties overlay={image} />}
      {selection?.kind === "video" && <VideoProperties clipId={selection.id} />}
    </aside>
  );
}
```

Nota: los sliders disparan una entrada de historial por cambio (sin transacción) — aceptable porque `onChange` de un range en React dispara pocas veces con teclado y; si en pruebas manuales el arrastre del slider genera demasiadas entradas, envolver con `onPointerDown={beginTransaction}` + `transient: true` en `onChange` y un update final en `onPointerUp`, igual que los bloques del timeline.

- [ ] **Step 2: Montar en `AppShell.tsx`** — sustituir el `<aside>` placeholder por `<PropertiesPanel />`.

- [ ] **Step 3: Verificación manual**

Seleccionar un texto → cambiar contenido/fuente/tamaño/colores/sombra se refleja en vivo en el lienzo; seleccionar imagen → ancho/alto/opacidad/rotación; seleccionar bloque de vídeo en el timeline → volumen del audio original (audible al reproducir). Sin selección → mensaje vacío.

- [ ] **Step 4: Typecheck, tests, commit y push**

```bash
git add client/src/features/properties/PropertiesPanel.tsx client/src/components/AppShell.tsx
git commit -m "feat(client): panel de propiedades contextual para texto, imagen y clip"
git push
```

---

### Task 12: Autoguardado y gestión de proyectos en la UI

**Files:**
- Create: `client/src/features/projects/useAutosave.ts`
- Create: `client/src/features/projects/ProjectMenu.tsx`
- Modify: `client/src/components/TopBar.tsx`

- [ ] **Step 1: Crear `client/src/features/projects/useAutosave.ts`**

```ts
import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../stores/projectStore";

export type SaveState = "saved" | "dirty" | "saving" | "error";

const AUTOSAVE_MS = 5000;

export function saveNow(): Promise<void> {
  const { project, markSaved } = useProjectStore.getState();
  return fetch(`/api/projects/${encodeURIComponent(project.name)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(project),
  }).then((res) => {
    if (!res.ok) throw new Error("Error al guardar");
    markSaved();
  });
}

/** Autoguardado: 5s después del último cambio. Devuelve el estado para la UI. */
export function useAutosave(): SaveState {
  const dirty = useProjectStore((s) => s.dirty);
  const [state, setState] = useState<SaveState>("saved");
  const timerRef = useRef(0);

  useEffect(() => {
    if (!dirty) {
      setState("saved");
      return;
    }
    setState("dirty");
    timerRef.current = window.setTimeout(() => {
      setState("saving");
      saveNow()
        .then(() => setState("saved"))
        .catch(() => setState("error"));
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timerRef.current);
  }, [dirty]);

  return state;
}
```

Matiz importante: el efecto depende de `dirty`, y `markSaved()` lo pone a `false`, así que tras cada guardado el ciclo queda armado para el siguiente cambio. Si el usuario sigue editando mientras `dirty` ya era `true`, el temporizador NO se reinicia (se guarda como muy tarde 5s después del primer cambio) — comportamiento correcto para autoguardado.

- [ ] **Step 2: Crear `client/src/features/projects/ProjectMenu.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import type { Project } from "@clipforge/shared";
import { createEmptyProject } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { saveNow } from "./useAutosave";

interface ProjectEntry {
  name: string;
  updatedAt: string;
}

export function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((list: ProjectEntry[]) => setEntries(list))
      .catch(() => setError("No se pudo cargar la lista de proyectos"));
    const onClickOutside = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.code === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const load = async (name: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error();
      const project = (await res.json()) as Project;
      useProjectStore.getState().loadProject(project);
      useUiStore.getState().select(null);
      useUiStore.getState().setPlayhead(0);
      setOpen(false);
    } catch {
      setError(`No se pudo cargar «${name}»`);
    }
  };

  const createNew = async () => {
    try {
      await saveNow(); // no perder el actual
    } catch {
      // si falla el guardado seguimos: el usuario decidió crear uno nuevo
    }
    useProjectStore.getState().loadProject(createEmptyProject(`proyecto-${Date.now() % 100000}`));
    useUiStore.getState().select(null);
    useUiStore.getState().setPlayhead(0);
    setOpen(false);
  };

  const remove = async (name: string) => {
    if (!window.confirm(`¿Borrar el proyecto «${name}»? Esta acción no se puede deshacer.`)) return;
    await fetch(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.name !== name));
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="text-xs text-muted border border-border-2 rounded-full px-3 py-1.5 hover:text-text"
      >
        Proyectos ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-64 bg-surface-2 border border-border-2 rounded-lg shadow-xl z-50 p-1.5 flex flex-col gap-0.5"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void createNew()}
            className="text-left text-xs text-accent-soft px-2 py-1.5 rounded-md hover:bg-surface-3"
          >
            + Nuevo proyecto
          </button>
          {error && <p role="alert" className="text-[11px] text-danger px-2">{error}</p>}
          {entries.length === 0 && !error && (
            <p className="text-[11px] text-muted px-2 py-1">No hay proyectos guardados.</p>
          )}
          {entries.map((e) => (
            <div key={e.name} className="flex items-center gap-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => void load(e.name)}
                className="flex-1 text-left text-xs px-2 py-1.5 rounded-md hover:bg-surface-3 truncate"
              >
                {e.name}
              </button>
              <button
                type="button"
                onClick={() => void remove(e.name)}
                aria-label={`Borrar proyecto ${e.name}`}
                className="text-muted hover:text-danger px-1.5"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Conectar en `TopBar.tsx`**

- Añadir `const saveState = useAutosave();` y sustituir el punto `dirty` por un indicador con texto accesible:

```tsx
<span role="status" className="text-[10px] text-muted">
  {saveState === "saved" && "Guardado"}
  {saveState === "dirty" && "Sin guardar…"}
  {saveState === "saving" && "Guardando…"}
  {saveState === "error" && <span className="text-danger">Error al guardar</span>}
</span>
```

- Habilitar el botón **Guardar**: `onClick={() => void saveNow()}`, sin `disabled`, título "Guardar ahora (Ctrl+S)".
- Añadir `<ProjectMenu />` junto a los botones de la derecha.

- [ ] **Step 4: Verificación manual**

Editar algo → "Sin guardar…" → a los 5s "Guardando…" → "Guardado"; `data/projects/<nombre>.json` existe. Renombrar el proyecto y guardar → aparece con el nuevo nombre en el menú Proyectos. Crear nuevo → lienzo vacío; cargar el anterior → todo vuelve (clips, overlays, formato). Borrar desde el menú lo elimina. Recargar la página NO recupera el proyecto automáticamente (decisión: el usuario carga desde el menú; recuerda el aviso "Sin guardar" si cierra con cambios).

- [ ] **Step 5: Typecheck, tests, commit y push**

```bash
git add client/src/features/projects/useAutosave.ts client/src/features/projects/ProjectMenu.tsx client/src/components/TopBar.tsx
git commit -m "feat(client): autoguardado cada 5s y menú de proyectos con cargar, crear y borrar"
git push
```

---

### Task 13: Atajos globales de teclado y nudge accesible

**Files:**
- Create: `client/src/lib/shortcuts.ts`
- Modify: `client/src/components/AppShell.tsx`

- [ ] **Step 1: Crear `client/src/lib/shortcuts.ts`**

Atajos (ignorados cuando el foco está en `INPUT`, `TEXTAREA`, `SELECT` o `contenteditable`): Space play/pausa, S dividir en playhead, Supr/Backspace eliminar selección, Ctrl+Z deshacer, Ctrl+Y / Ctrl+Shift+Z rehacer, Ctrl+S guardar ya, flechas mueven el overlay seleccionado (0.005, con Shift 0.02; ← → sin selección mueven el playhead un fotograma).

```ts
import { saveNow } from "../features/projects/useAutosave";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";

const NUDGE = 0.005;
const NUDGE_FAST = 0.02;

function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  return (
    t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    t.isContentEditable
  );
}

interface ShortcutDeps {
  seek: (t: number) => void;
  togglePlay: () => void;
}

export function handleShortcut(e: KeyboardEvent, deps: ShortcutDeps): void {
  if (isEditableTarget(e)) return;
  const ui = useUiStore.getState();
  const store = useProjectStore.getState();

  // Edición con modificadores
  if (e.ctrlKey || e.metaKey) {
    if (e.code === "KeyZ" && e.shiftKey) {
      e.preventDefault();
      store.redo();
    } else if (e.code === "KeyZ") {
      e.preventDefault();
      store.undo();
    } else if (e.code === "KeyY") {
      e.preventDefault();
      store.redo();
    } else if (e.code === "KeyS") {
      e.preventDefault();
      void saveNow();
    }
    return;
  }

  switch (e.code) {
    case "Space":
      e.preventDefault();
      deps.togglePlay();
      return;
    case "KeyS":
      e.preventDefault();
      store.splitVideoAt(ui.playhead);
      return;
    case "Delete":
    case "Backspace": {
      if (!ui.selection) return;
      e.preventDefault();
      store.removeElement(ui.selection.kind, ui.selection.id);
      ui.select(null);
      return;
    }
  }

  // Flechas: nudge del overlay seleccionado o playhead
  const arrows: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const dir = arrows[e.code];
  if (!dir) return;
  e.preventDefault();
  const sel = ui.selection;
  const step = e.shiftKey ? NUDGE_FAST : NUDGE;

  if (sel?.kind === "text") {
    const o = store.project.tracks.text.find((t) => t.id === sel.id);
    if (o) store.updateText(sel.id, { x: clampN(o.x + dir[0] * step), y: clampN(o.y + dir[1] * step) });
  } else if (sel?.kind === "image") {
    const o = store.project.tracks.image.find((i) => i.id === sel.id);
    if (o) store.updateImage(sel.id, { x: clampN(o.x + dir[0] * step), y: clampN(o.y + dir[1] * step) });
  } else if (dir[0] !== 0) {
    const fps = store.project.settings.fps;
    deps.seek(ui.playhead + dir[0] / fps);
  }
}

function clampN(n: number): number {
  return Math.min(1, Math.max(0, n));
}
```

- [ ] **Step 2: Conectar en `AppShell.tsx`**

`AppShell` ya está dentro de `PlaybackProvider`... no: el provider está DENTRO de AppShell. Crear un componente interno que consuma el contexto:

```tsx
function GlobalShortcuts() {
  const { seek, togglePlay } = usePlayback();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleShortcut(e, { seek, togglePlay });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seek, togglePlay]);
  return null;
}
```

y montar `<GlobalShortcuts />` como primer hijo del `PlaybackProvider` en `AppShell`. Nota: el manejador de Space del Hito 1 vivía en PreviewPlayer (eliminado en Task 6); este lo sustituye.

- [ ] **Step 3: Verificación manual**

Space reproduce/pausa (salvo al escribir en un input); S divide; Supr elimina; Ctrl+Z/Y deshacen/rehacen; Ctrl+S guarda al momento; con un texto seleccionado las flechas lo desplazan (Shift acelera); sin selección ←/→ mueven el playhead fotograma a fotograma.

- [ ] **Step 4: Typecheck, tests, commit y push**

```bash
git add client/src/lib/shortcuts.ts client/src/components/AppShell.tsx
git commit -m "feat(client): atajos globales de teclado con desplazamiento accesible de overlays"
git push
```

---

### Task 14: Verificación integral del Hito 2 y pulido de accesibilidad

**Files:**
- Posibles ajustes menores en cualquier fichero del hito (sin features nuevas)

- [ ] **Step 1: Typecheck y tests completos**

Run: `npm run typecheck -w @clipforge/client && npm run typecheck -w @clipforge/server && npm run typecheck -w @clipforge/shared && npm run test`
Expected: todo limpio y verde (shared + server + client).

- [ ] **Step 2: Lista de verificación manual completa (con `npm run dev`)**

1. Descargar un clip nuevo → añadirlo 2 veces a la línea de tiempo
2. Reproducir la secuencia completa: cruza bloques, los huecos se ven en negro, se detiene al final; 🔁 repite
3. Añadir texto: arrastrar, redimensionar por esquinas, rotar con el asa; editar contenido/fuente/colores en propiedades
4. Subir una imagen, insertarla, manipularla igual
5. Timeline: mover bloques con imán, recortar por ambos bordes, dividir con S, eliminar con Supr
6. Undo/redo de TODO lo anterior con Ctrl+Z/Ctrl+Y (un arrastre = una entrada)
7. Autoguardado a los 5s; menú Proyectos: crear nuevo, recargar el anterior y verificar que TODO vuelve (clips, overlays con su estilo, formato)
8. Cambiar el formato 9:16 → 16:9 → los overlays mantienen su posición relativa
9. Teclado: Tab recorre la UI con foco visible; flechas mueven el overlay seleccionado; los atajos no interfieren al escribir en inputs
10. Sin errores en la consola del navegador en todo el recorrido

- [ ] **Step 3: Revisión de accesibilidad del hito**

Verificar (y corregir si falla): todos los controles nuevos tienen `aria-label` o `<label>`; los bloques del timeline son botones enfocables con nombre accesible; el menú Proyectos se cierra con Escape (añadir si falta); contraste de los colores de bloques (`text-emerald-200`/`text-amber-200` sobre sus fondos al 20%) ≥ 4.5:1; `role="status"` en el indicador de guardado.

- [ ] **Step 4: Actualizar TODO.md**

Marcar TASK-002 como completada con resumen, registrar decisiones nuevas si las hubo y poner el Hito 3 como Up Next.

- [ ] **Step 5: Commit final y push**

```bash
git add -u
git commit -m "fix(client): ajustes de accesibilidad y pulido tras la verificación integral del Hito 2"
git push
```

(si el Step 3 no produjo cambios, hacer solo el commit de TODO.md: `docs(todo): cierra el Hito 2`)

---

## Verificación final del Hito 2

- [ ] `npm run test` verde en shared, server y client; typecheck limpio en los tres
- [ ] Editor completo: multi-clip con trim/split, overlays texto/imagen con drag/resize/rotación, propiedades, undo/redo, autoguardado y proyectos
- [ ] Accesibilidad: navegación por teclado completa, nombres accesibles, contraste AA
- [ ] Todo commiteado y pusheado a `feat/hito-2-editor`

