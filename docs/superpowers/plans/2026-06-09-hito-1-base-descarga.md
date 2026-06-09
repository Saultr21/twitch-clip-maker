# Hito 1 — Base del proyecto, descarga de clips y reproducción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo funcionando con backend Fastify que descarga clips de Twitch por URL (yt-dlp) y frontend React con el shell del editor (tema oscuro Twitch), panel de medios y reproductor con controles completos.

**Architecture:** npm workspaces con `client/` (Vite + React 19 + TS + Tailwind v4 + Zustand), `server/` (Fastify 5 + TS + execa) y `shared/` (tipos). El servidor gestiona binarios (yt-dlp nightly auto-descargado, FFmpeg vía ffmpeg-static), valida URLs con allowlist, descarga con progreso en streaming NDJSON (equivalente a SSE, más simple sobre POST) y sirve los MP4 con soporte Range vía @fastify/static. Vite proxy evita CORS.

**Tech Stack:** Vite, React 19, TypeScript strict, Tailwind CSS v4, Zustand, Fastify 5, execa, yt-dlp (nightly), ffmpeg-static, ffprobe-static, Zod, Vitest.

**Nota de plataforma:** los pasos de gestión de binarios asumen Windows (`yt-dlp.exe`) — es el entorno del usuario y la app es de uso local.

**Spec:** `docs/superpowers/specs/2026-06-09-twitch-clip-editor-design.md` (este plan cubre §4 parcial, §7 descarga/stream/setup, §9 parcial)

---

### Task 1: Scaffold del monorepo

**Files:**
- Create: `package.json`
- Create: `shared/package.json`
- Create: `shared/src/index.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Crear `package.json` raíz**

```json
{
  "name": "clipforge",
  "private": true,
  "workspaces": ["client", "server", "shared"],
  "scripts": {
    "dev": "concurrently -n server,client -c magenta,cyan \"npm run dev -w @clipforge/server\" \"npm run dev -w @clipforge/client\"",
    "test": "npm run test -w @clipforge/server"
  },
  "devDependencies": {
    "concurrently": "^9.1.0"
  }
}
```

- [ ] **Step 2: Crear `shared/package.json` y tipos compartidos del Hito 1**

`shared/package.json`:

```json
{
  "name": "@clipforge/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

`shared/src/index.ts`:

```ts
export interface ClipInfo {
  id: string;
  url: string;
  title: string;
  fileName: string;
  duration: number;
  width: number;
  height: number;
  createdAt: string;
}

export type DownloadEvent =
  | { type: "progress"; percent: number }
  | { type: "done"; clip: ClipInfo }
  | { type: "error"; message: string };

export interface SetupStatus {
  ready: boolean;
  step: "checking" | "downloading-ytdlp" | "ready" | "error";
  message?: string;
}
```

- [ ] **Step 3: Añadir entradas al `.gitignore`**

Añadir al final del `.gitignore` existente:

```
data/exports/
*.tsbuildinfo
```

(`node_modules/` y `data/` ya están.)

- [ ] **Step 4: Instalar dependencias raíz**

Run: `npm install`
Expected: crea `node_modules/` y `package-lock.json` sin errores.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json shared/package.json shared/src/index.ts .gitignore
git commit -m "chore: scaffold del monorepo con workspaces y tipos compartidos"
```

---

### Task 2: Servidor Fastify mínimo con health check

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/lib/paths.ts`
- Create: `server/src/index.ts`

- [ ] **Step 1: Crear `server/package.json`**

```json
{
  "name": "@clipforge/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@clipforge/shared": "*",
    "@fastify/static": "^8.0.0",
    "execa": "^9.5.0",
    "fastify": "^5.0.0",
    "ffmpeg-static": "^5.2.0",
    "ffprobe-static": "^3.1.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/ffprobe-static": "^2.0.3",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Crear `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Crear `server/src/lib/paths.ts`**

```ts
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");

export const DATA_DIR = path.join(ROOT, "data");
export const CLIPS_DIR = path.join(DATA_DIR, "clips");
export const BIN_DIR = path.join(DATA_DIR, "bin");

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, CLIPS_DIR, BIN_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
```

- [ ] **Step 4: Crear `server/src/index.ts`**

```ts
import Fastify from "fastify";
import { ensureDataDirs } from "./lib/paths.js";

ensureDataDirs();

const app = Fastify({ logger: true });

app.get("/api/health", async () => ({ ok: true }));

await app.listen({ port: 3001, host: "127.0.0.1" });
```

- [ ] **Step 5: Instalar y verificar**

Run: `npm install` (en la raíz)
Run: `npm run dev -w @clipforge/server` (dejarlo arrancado en background)
Run: `curl http://127.0.0.1:3001/api/health`
Expected: `{"ok":true}` y aparece la carpeta `data/` con `clips/` y `bin/`. Parar el servidor.

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/tsconfig.json server/src/lib/paths.ts server/src/index.ts package-lock.json
git commit -m "feat(server): servidor Fastify con health check y estructura de datos"
```

---

### Task 3: Validador de URLs de Twitch (TDD)

**Files:**
- Create: `server/src/lib/twitchUrl.ts`
- Test: `server/src/lib/twitchUrl.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`server/src/lib/twitchUrl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isTwitchClipUrl } from "./twitchUrl.js";

describe("isTwitchClipUrl", () => {
  it.each([
    "https://clips.twitch.tv/AwkwardHelplessSalamanderSwiftRage",
    "https://www.twitch.tv/ibai/clip/PoisedSquareKleeKreygasm-abc123",
    "https://twitch.tv/rubius/clip/SomeClipSlug",
    "https://m.twitch.tv/auronplay/clip/OtherSlug-x_y",
  ])("acepta %s", (url) => {
    expect(isTwitchClipUrl(url)).toBe(true);
  });

  it.each([
    "https://www.youtube.com/watch?v=abc",
    "https://clips.twitch.tv.evil.com/slug",
    "https://www.twitch.tv/ibai",
    "https://www.twitch.tv/ibai/videos/123",
    "http://clips.twitch.tv/Slug",
    "javascript:alert(1)",
    "no es una url",
    "https://clips.twitch.tv/",
  ])("rechaza %s", (url) => {
    expect(isTwitchClipUrl(url)).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -w @clipforge/server`
Expected: FAIL — `Cannot find module './twitchUrl.js'` (o similar).

- [ ] **Step 3: Implementación mínima**

`server/src/lib/twitchUrl.ts`:

```ts
const CLIP_HOSTS = new Set(["clips.twitch.tv"]);
const SITE_HOSTS = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);

export function isTwitchClipUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (CLIP_HOSTS.has(host)) return url.pathname.length > 1;
  if (SITE_HOSTS.has(host)) return /^\/[^/]+\/clip\/[^/]+/.test(url.pathname);
  return false;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test -w @clipforge/server`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/twitchUrl.ts server/src/lib/twitchUrl.test.ts
git commit -m "feat(server): validador de URLs de clips de Twitch con allowlist"
```

---

### Task 4: Parser de progreso de yt-dlp (TDD)

**Files:**
- Create: `server/src/services/progress.ts`
- Test: `server/src/services/progress.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`server/src/services/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseYtDlpProgress } from "./progress.js";

describe("parseYtDlpProgress", () => {
  it("extrae el porcentaje de una línea de descarga", () => {
    expect(
      parseYtDlpProgress("[download]  45.2% of 12.34MiB at 2.50MiB/s ETA 00:03"),
    ).toBe(45.2);
  });

  it("extrae 100% al completar", () => {
    expect(parseYtDlpProgress("[download] 100% of 12.34MiB in 00:05")).toBe(100);
  });

  it("devuelve null para líneas sin progreso", () => {
    expect(parseYtDlpProgress("[twitch] Extracting clip info")).toBeNull();
    expect(parseYtDlpProgress("")).toBeNull();
  });

  it("limita valores anómalos a 100", () => {
    expect(parseYtDlpProgress("[download] 100.8% of ~10MiB")).toBe(100);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -w @clipforge/server`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementación mínima**

`server/src/services/progress.ts`:

```ts
const PROGRESS_RE = /\[download\]\s+(\d+(?:\.\d+)?)%/;

export function parseYtDlpProgress(line: string): number | null {
  const match = PROGRESS_RE.exec(line);
  if (!match) return null;
  return Math.min(100, parseFloat(match[1]));
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test -w @clipforge/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/progress.ts server/src/services/progress.test.ts
git commit -m "feat(server): parser de progreso de yt-dlp"
```

---

### Task 5: Registro de clips en disco (TDD)

**Files:**
- Create: `server/src/services/clipsRegistry.ts`
- Test: `server/src/services/clipsRegistry.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`server/src/services/clipsRegistry.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClipInfo } from "@clipforge/shared";
import { addClip, listClips } from "./clipsRegistry.js";

function makeClip(id: string): ClipInfo {
  return {
    id,
    url: `https://clips.twitch.tv/${id}`,
    title: `Clip ${id}`,
    fileName: `${id}.mp4`,
    duration: 28.5,
    width: 1920,
    height: 1080,
    createdAt: new Date().toISOString(),
  };
}

describe("clipsRegistry", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("devuelve lista vacía si no hay índice", () => {
    expect(listClips(dir)).toEqual([]);
  });

  it("añade un clip y lo persiste", () => {
    addClip(makeClip("a"), dir);
    expect(listClips(dir)).toHaveLength(1);
    expect(listClips(dir)[0].id).toBe("a");
  });

  it("añade los clips más recientes al principio", () => {
    addClip(makeClip("a"), dir);
    addClip(makeClip("b"), dir);
    expect(listClips(dir).map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("reemplaza un clip con el mismo id en lugar de duplicarlo", () => {
    addClip(makeClip("a"), dir);
    addClip({ ...makeClip("a"), title: "Actualizado" }, dir);
    expect(listClips(dir)).toHaveLength(1);
    expect(listClips(dir)[0].title).toBe("Actualizado");
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test -w @clipforge/server`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementación mínima**

`server/src/services/clipsRegistry.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import type { ClipInfo } from "@clipforge/shared";
import { CLIPS_DIR } from "../lib/paths.js";

function indexPath(dir: string): string {
  return path.join(dir, "index.json");
}

export function listClips(dir: string = CLIPS_DIR): ClipInfo[] {
  try {
    return JSON.parse(fs.readFileSync(indexPath(dir), "utf8")) as ClipInfo[];
  } catch {
    return [];
  }
}

export function addClip(clip: ClipInfo, dir: string = CLIPS_DIR): void {
  const clips = listClips(dir).filter((c) => c.id !== clip.id);
  clips.unshift(clip);
  fs.writeFileSync(indexPath(dir), JSON.stringify(clips, null, 2));
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test -w @clipforge/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/clipsRegistry.ts server/src/services/clipsRegistry.test.ts
git commit -m "feat(server): registro persistente de clips descargados"
```

---

### Task 6: Gestión de binarios y endpoint de setup

**Files:**
- Create: `server/src/services/binaries.ts`
- Create: `server/src/routes/setup.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Crear `server/src/services/binaries.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { execa } from "execa";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import type { SetupStatus } from "@clipforge/shared";
import { BIN_DIR } from "../lib/paths.js";

const YTDLP_URL =
  "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe";

export const ytDlpPath = path.join(BIN_DIR, "yt-dlp.exe");
export const ffmpegBin = ffmpegStatic as unknown as string;
export const ffprobeBin = ffprobeStatic.path;

let status: SetupStatus = { ready: false, step: "checking" };

export function getSetupStatus(): SetupStatus {
  return status;
}

export async function ensureBinaries(): Promise<void> {
  try {
    if (!fs.existsSync(ytDlpPath)) {
      status = { ready: false, step: "downloading-ytdlp" };
      const res = await fetch(YTDLP_URL, { redirect: "follow" });
      if (!res.ok || !res.body) {
        throw new Error(`Descarga de yt-dlp fallida: HTTP ${res.status}`);
      }
      await pipeline(
        Readable.fromWeb(res.body as WebReadableStream),
        fs.createWriteStream(ytDlpPath),
      );
    } else {
      // Twitch rompe el extractor periódicamente; nightly lleva el fix antes
      await execa(ytDlpPath, ["--update-to", "nightly"]).catch(() => {});
    }
    status = { ready: true, step: "ready" };
  } catch (err) {
    status = {
      ready: false,
      step: "error",
      message: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
```

- [ ] **Step 2: Crear `server/src/routes/setup.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { getSetupStatus } from "../services/binaries.js";

export function setupRoutes(app: FastifyInstance): void {
  app.get("/api/setup/status", async () => getSetupStatus());
}
```

- [ ] **Step 3: Registrar en `server/src/index.ts`**

Reemplazar el contenido completo por:

```ts
import Fastify from "fastify";
import { ensureDataDirs } from "./lib/paths.js";
import { ensureBinaries } from "./services/binaries.js";
import { setupRoutes } from "./routes/setup.js";

ensureDataDirs();

const app = Fastify({ logger: true });

app.get("/api/health", async () => ({ ok: true }));
setupRoutes(app);

await app.listen({ port: 3001, host: "127.0.0.1" });

void ensureBinaries();
```

- [ ] **Step 4: Verificar manualmente**

Run: `npm run dev -w @clipforge/server` (background)
Run: `curl http://127.0.0.1:3001/api/setup/status`
Expected: primero `{"ready":false,"step":"downloading-ytdlp"}`; tras unos segundos `{"ready":true,"step":"ready"}` y existe `data/bin/yt-dlp.exe`. Verificar también: `data/bin/yt-dlp.exe --version` imprime una versión nightly (formato `2026.MM.DD.HHMMSS`). Parar el servidor.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/binaries.ts server/src/routes/setup.ts server/src/index.ts
git commit -m "feat(server): gestión automática de binarios yt-dlp y ffmpeg con estado de setup"
```

---

### Task 7: Descarga de clips con progreso y streaming de archivos

**Files:**
- Create: `server/src/services/probe.ts`
- Create: `server/src/services/download.ts`
- Create: `server/src/routes/clips.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Crear `server/src/services/probe.ts`**

```ts
import { execa } from "execa";
import { ffprobeBin } from "./binaries.js";

export async function probeVideo(
  file: string,
): Promise<{ duration: number; width: number; height: number }> {
  const { stdout } = await execa(ffprobeBin, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-show_entries", "format=duration",
    "-of", "json",
    file,
  ]);
  const data = JSON.parse(stdout) as {
    streams: Array<{ width: number; height: number }>;
    format: { duration: string };
  };
  return {
    duration: parseFloat(data.format.duration),
    width: data.streams[0].width,
    height: data.streams[0].height,
  };
}
```

- [ ] **Step 2: Crear `server/src/services/download.ts`**

```ts
import crypto from "node:crypto";
import path from "node:path";
import { execa } from "execa";
import type { ClipInfo } from "@clipforge/shared";
import { CLIPS_DIR } from "../lib/paths.js";
import { ffmpegBin, ytDlpPath } from "./binaries.js";
import { addClip } from "./clipsRegistry.js";
import { parseYtDlpProgress } from "./progress.js";
import { probeVideo } from "./probe.js";

export async function downloadClip(
  url: string,
  onProgress: (percent: number) => void,
): Promise<ClipInfo> {
  const id = crypto.randomUUID();
  const fileName = `${id}.mp4`;
  const outPath = path.join(CLIPS_DIR, fileName);

  const { stdout: title } = await execa(ytDlpPath, [
    "--print", "title",
    "--skip-download",
    url,
  ]);

  const proc = execa(ytDlpPath, [
    url,
    "-o", outPath,
    "--newline",
    "--no-playlist",
    "--ffmpeg-location", ffmpegBin,
    "-f", "best",
    "--remux-video", "mp4",
  ]);

  proc.stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      const percent = parseYtDlpProgress(line);
      if (percent !== null) onProgress(percent);
    }
  });

  await proc;

  const meta = await probeVideo(outPath);
  const clip: ClipInfo = {
    id,
    url,
    title: title.trim(),
    fileName,
    ...meta,
    createdAt: new Date().toISOString(),
  };
  addClip(clip);
  return clip;
}
```

- [ ] **Step 3: Crear `server/src/routes/clips.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DownloadEvent } from "@clipforge/shared";
import { isTwitchClipUrl } from "../lib/twitchUrl.js";
import { listClips } from "../services/clipsRegistry.js";
import { downloadClip } from "../services/download.js";

const downloadBody = z.object({ url: z.string() });

export function clipRoutes(app: FastifyInstance): void {
  app.get("/api/clips", async () => listClips());

  app.post("/api/clips", async (req, reply) => {
    const parsed = downloadBody.safeParse(req.body);
    if (!parsed.success || !isTwitchClipUrl(parsed.data.url)) {
      return reply
        .code(400)
        .send({ error: "La URL no es un clip válido de Twitch" });
    }

    reply.raw.writeHead(200, {
      "content-type": "application/x-ndjson",
      "cache-control": "no-cache",
    });
    const send = (event: DownloadEvent) =>
      reply.raw.write(JSON.stringify(event) + "\n");

    try {
      const clip = await downloadClip(parsed.data.url, (percent) =>
        send({ type: "progress", percent }),
      );
      send({ type: "done", clip });
    } catch (err) {
      send({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Error desconocido durante la descarga",
      });
    }
    reply.raw.end();
  });
}
```

- [ ] **Step 4: Registrar rutas y archivos estáticos en `server/src/index.ts`**

Reemplazar el contenido completo por:

```ts
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { CLIPS_DIR, ensureDataDirs } from "./lib/paths.js";
import { ensureBinaries } from "./services/binaries.js";
import { clipRoutes } from "./routes/clips.js";
import { setupRoutes } from "./routes/setup.js";

ensureDataDirs();

const app = Fastify({ logger: true });

await app.register(fastifyStatic, {
  root: CLIPS_DIR,
  prefix: "/files/",
  acceptRanges: true,
});

app.get("/api/health", async () => ({ ok: true }));
setupRoutes(app);
clipRoutes(app);

await app.listen({ port: 3001, host: "127.0.0.1" });

void ensureBinaries();
```

- [ ] **Step 5: Verificar typecheck y tests**

Run: `npm run typecheck -w @clipforge/server && npm run test -w @clipforge/server`
Expected: sin errores de tipos; tests PASS.

- [ ] **Step 6: Verificar manualmente con un clip real**

Run: `npm run dev -w @clipforge/server` (background, esperar a `step: "ready"`)
Run (con cualquier clip público de Twitch, p.ej. uno buscado en twitch.tv):

```bash
curl -N -X POST http://127.0.0.1:3001/api/clips -H "content-type: application/json" -d "{\"url\":\"<URL_DE_CLIP_REAL>\"}"
```

Expected: líneas `{"type":"progress","percent":...}` y al final `{"type":"done","clip":{...}}` con título, duración y resolución. El MP4 existe en `data/clips/` y `curl -I http://127.0.0.1:3001/files/<fileName>` devuelve `200` con `accept-ranges: bytes`. Probar también una URL inválida (`https://youtube.com/x`) → `400`. Parar el servidor.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/probe.ts server/src/services/download.ts server/src/routes/clips.ts server/src/index.ts
git commit -m "feat(server): descarga de clips con yt-dlp, progreso NDJSON y streaming con Range"
```

---

### Task 8: Scaffold del cliente con tema oscuro Twitch y shell del editor

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/index.css`
- Create: `client/src/App.tsx`
- Create: `client/src/components/SetupGate.tsx`
- Create: `client/src/components/AppShell.tsx`
- Create: `client/src/components/TopBar.tsx`
- Create: `client/src/components/ToolRail.tsx`

- [ ] **Step 1: Crear `client/package.json`**

```json
{
  "name": "@clipforge/client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@clipforge/shared": "*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.4.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.8.0",
    "vite": "^6.3.0"
  }
}
```

- [ ] **Step 2: Crear `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Crear `client/vite.config.ts`**

```ts
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001",
      "/files": "http://127.0.0.1:3001",
    },
  },
});
```

- [ ] **Step 4: Crear `client/index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ClipForge — Editor de clips de Twitch</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Crear `client/src/index.css` (tema oscuro Twitch aprobado)**

```css
@import "tailwindcss";

@theme {
  --color-bg: #0e0e10;
  --color-canvas: #0a0a0c;
  --color-surface: #18181b;
  --color-surface-2: #1f1f23;
  --color-surface-3: #2e2e35;
  --color-border: #26262c;
  --color-border-2: #38383f;
  --color-text: #efeff1;
  --color-muted: #85858c;
  --color-accent: #9146ff;
  --color-accent-dark: #772ce8;
  --color-accent-soft: #c9a6ff;
  --color-danger: #ff4d6a;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: "Segoe UI", system-ui, sans-serif;
}
```

- [ ] **Step 6: Crear `client/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Crear `client/src/components/SetupGate.tsx`**

```tsx
import { useEffect, useState, type ReactNode } from "react";
import type { SetupStatus } from "@clipforge/shared";

const STEP_LABELS: Record<SetupStatus["step"], string> = {
  checking: "Comprobando herramientas...",
  "downloading-ytdlp": "Descargando yt-dlp (primer arranque)...",
  ready: "Listo",
  error: "Error de preparación",
};

export function SetupGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SetupStatus | null>(null);

  useEffect(() => {
    let timer: number;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/setup/status");
        const next = (await res.json()) as SetupStatus;
        if (cancelled) return;
        setStatus(next);
        if (!next.ready && next.step !== "error") {
          timer = window.setTimeout(poll, 1500);
        }
      } catch {
        if (!cancelled) timer = window.setTimeout(poll, 1500);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (status?.ready) return <>{children}</>;

  return (
    <div className="h-screen grid place-items-center bg-bg">
      <div className="text-center" role="status" aria-live="polite">
        <p className="text-2xl font-bold mb-2">
          Clip<span className="text-accent">Forge</span>
        </p>
        {status?.step === "error" ? (
          <p className="text-danger text-sm max-w-md">
            {STEP_LABELS.error}: {status.message}
          </p>
        ) : (
          <p className="text-muted text-sm animate-pulse">
            {STEP_LABELS[status?.step ?? "checking"]}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Crear `client/src/components/TopBar.tsx`**

```tsx
export function TopBar() {
  return (
    <header className="flex items-center gap-3 bg-surface border-b border-border px-4 py-2">
      <h1 className="text-base font-bold">
        Clip<span className="text-accent">Forge</span>
      </h1>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled
          title="Disponible en el Hito 2"
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

- [ ] **Step 9: Crear `client/src/components/ToolRail.tsx`**

```tsx
const TOOLS = [
  { id: "media", icon: "🎬", label: "Medios", enabled: true },
  { id: "text", icon: "📝", label: "Texto", enabled: false },
  { id: "image", icon: "🖼️", label: "Imagen", enabled: false },
  { id: "audio", icon: "🎵", label: "Audio", enabled: false },
  { id: "filters", icon: "🎨", label: "Filtros", enabled: false },
  { id: "speed", icon: "⚡", label: "Velocidad", enabled: false },
] as const;

export function ToolRail() {
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
          aria-pressed={tool.id === "media"}
          title={tool.enabled ? tool.label : `${tool.label} — próximos hitos`}
          className={`w-12 rounded-lg py-1.5 text-center text-[10px] disabled:opacity-40 ${
            tool.id === "media"
              ? "bg-accent/15 border border-accent text-accent-soft"
              : "text-muted"
          }`}
        >
          <span className="block text-base" aria-hidden="true">
            {tool.icon}
          </span>
          {tool.label}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 10: Crear `client/src/components/AppShell.tsx` y `client/src/App.tsx`**

`client/src/components/AppShell.tsx`:

```tsx
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";

export function AppShell() {
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <ToolRail />
        <main className="flex flex-1 min-w-0">
          <div className="flex-1 grid place-items-center text-muted text-sm">
            Panel de medios (Task 9)
          </div>
        </main>
        <aside className="w-72 bg-surface border-l border-border p-3 text-xs text-muted">
          Propiedades — Hito 2
        </aside>
      </div>
      <footer className="h-36 bg-surface border-t border-border grid place-items-center text-xs text-muted">
        Línea de tiempo — Hito 2
      </footer>
    </div>
  );
}
```

`client/src/App.tsx`:

```tsx
import { AppShell } from "./components/AppShell";
import { SetupGate } from "./components/SetupGate";

export default function App() {
  return (
    <SetupGate>
      <AppShell />
    </SetupGate>
  );
}
```

- [ ] **Step 11: Instalar y verificar en navegador**

Run: `npm install` (raíz)
Run: `npm run dev` (raíz, background — arranca servidor y cliente)
Abrir `http://localhost:5173`.
Expected: pantalla de preparación si es primer arranque, después el shell completo: barra superior con botones deshabilitados, carril de herramientas con Medios activo, placeholders de medios/propiedades/timeline. Sin errores en consola del navegador.

- [ ] **Step 12: Verificar typecheck y commit**

Run: `npm run typecheck -w @clipforge/client`
Expected: sin errores.

```bash
git add client package-lock.json
git commit -m "feat(client): shell del editor con tema oscuro Twitch y pantalla de preparación"
```

---

### Task 9: Panel de medios con descarga y lista de clips

**Files:**
- Create: `client/src/stores/clipsStore.ts`
- Create: `client/src/components/MediaPanel.tsx`
- Modify: `client/src/components/AppShell.tsx`

- [ ] **Step 1: Crear `client/src/stores/clipsStore.ts`**

```ts
import { create } from "zustand";
import type { ClipInfo, DownloadEvent } from "@clipforge/shared";

interface ClipsState {
  clips: ClipInfo[];
  selectedClipId: string | null;
  downloading: boolean;
  downloadProgress: number;
  downloadError: string | null;
  fetchClips: () => Promise<void>;
  selectClip: (id: string) => void;
  downloadClip: (url: string) => Promise<void>;
}

export const useClipsStore = create<ClipsState>((set) => ({
  clips: [],
  selectedClipId: null,
  downloading: false,
  downloadProgress: 0,
  downloadError: null,

  fetchClips: async () => {
    const res = await fetch("/api/clips");
    set({ clips: (await res.json()) as ClipInfo[] });
  },

  selectClip: (id) => set({ selectedClipId: id }),

  downloadClip: async (url) => {
    set({ downloading: true, downloadProgress: 0, downloadError: null });
    try {
      const res = await fetch("/api/clips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        throw new Error(body.error);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as DownloadEvent;
          if (event.type === "progress") {
            set({ downloadProgress: event.percent });
          } else if (event.type === "error") {
            throw new Error(event.message);
          } else {
            set((s) => ({
              clips: [event.clip, ...s.clips],
              selectedClipId: event.clip.id,
            }));
          }
        }
      }
    } catch (err) {
      set({
        downloadError:
          err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      set({ downloading: false });
    }
  },
}));
```

- [ ] **Step 2: Crear `client/src/components/MediaPanel.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { useClipsStore } from "../stores/clipsStore";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MediaPanel() {
  const {
    clips,
    selectedClipId,
    downloading,
    downloadProgress,
    downloadError,
    fetchClips,
    selectClip,
    downloadClip,
  } = useClipsStore();
  const [url, setUrl] = useState("");

  useEffect(() => {
    void fetchClips();
  }, [fetchClips]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || downloading) return;
    void downloadClip(url.trim()).then(() => setUrl(""));
  };

  return (
    <section
      aria-label="Medios"
      className="w-56 bg-surface-2/50 border-r border-border p-3 flex flex-col gap-3 overflow-y-auto"
    >
      <h2 className="text-xs font-bold tracking-wide">MEDIOS</h2>

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label htmlFor="clip-url" className="text-[11px] text-muted">
          URL del clip de Twitch
        </label>
        <input
          id="clip-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://clips.twitch.tv/..."
          disabled={downloading}
          className="bg-surface-2 border border-border-2 rounded-md px-2 py-1.5 text-xs placeholder:text-muted/60 focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={downloading || !url.trim()}
          className="text-xs font-semibold text-white rounded-md py-1.5 bg-gradient-to-r from-accent to-accent-dark disabled:opacity-50"
        >
          {downloading ? "Descargando..." : "Descargar clip"}
        </button>
      </form>

      {downloading && (
        <div role="status" aria-live="polite">
          <div
            role="progressbar"
            aria-valuenow={Math.round(downloadProgress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso de descarga"
            className="h-1.5 bg-surface-3 rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <p className="text-[11px] text-muted mt-1">
            {Math.round(downloadProgress)}%
          </p>
        </div>
      )}

      {downloadError && (
        <p role="alert" className="text-[11px] text-danger">
          {downloadError}
        </p>
      )}

      <ul className="flex flex-col gap-1.5" aria-label="Clips descargados">
        {clips.length === 0 && !downloading && (
          <li className="text-[11px] text-muted">
            Aún no hay clips. Pega una URL para empezar.
          </li>
        )}
        {clips.map((clip) => (
          <li key={clip.id}>
            <button
              type="button"
              onClick={() => selectClip(clip.id)}
              aria-pressed={clip.id === selectedClipId}
              className={`w-full text-left bg-surface-2 rounded-md px-2 py-1.5 text-[11px] border ${
                clip.id === selectedClipId
                  ? "border-accent text-text"
                  : "border-transparent text-muted hover:border-border-2"
              }`}
            >
              <span className="block truncate font-medium">{clip.title}</span>
              <span className="text-muted">
                {formatDuration(clip.duration)} · {clip.width}x{clip.height}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Montar el panel en `client/src/components/AppShell.tsx`**

Reemplazar el contenido completo por:

```tsx
import { MediaPanel } from "./MediaPanel";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";

export function AppShell() {
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <ToolRail />
        <main className="flex flex-1 min-w-0">
          <MediaPanel />
          <div className="flex-1 grid place-items-center text-muted text-sm bg-canvas">
            Reproductor (Task 10)
          </div>
        </main>
        <aside className="w-72 bg-surface border-l border-border p-3 text-xs text-muted">
          Propiedades — Hito 2
        </aside>
      </div>
      <footer className="h-36 bg-surface border-t border-border grid place-items-center text-xs text-muted">
        Línea de tiempo — Hito 2
      </footer>
    </div>
  );
}
```

- [ ] **Step 4: Verificar en navegador**

Con `npm run dev` corriendo, abrir `http://localhost:5173`:
1. Pegar la URL de un clip real de Twitch → barra de progreso avanza → el clip aparece en la lista seleccionado.
2. Pegar `https://youtube.com/watch?v=x` → mensaje de error claro, sin romper la UI.
3. Recargar la página → la lista persiste (viene de `data/clips/index.json`).

Expected: los 3 escenarios funcionan; sin errores en consola.

- [ ] **Step 5: Typecheck y commit**

Run: `npm run typecheck -w @clipforge/client`
Expected: sin errores.

```bash
git add client/src/stores/clipsStore.ts client/src/components/MediaPanel.tsx client/src/components/AppShell.tsx
git commit -m "feat(client): panel de medios con descarga por URL, progreso y lista de clips"
```

---

### Task 10: Reproductor con controles de transporte B+C

**Files:**
- Create: `client/src/lib/time.ts`
- Create: `client/src/components/PreviewPlayer.tsx`
- Modify: `client/src/components/AppShell.tsx`

- [ ] **Step 1: Crear `client/src/lib/time.ts`**

```ts
export function formatTimecode(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${tenths}`;
}
```

- [ ] **Step 2: Crear `client/src/components/PreviewPlayer.tsx`**

Controles aprobados (B+C): inicio/fin, fotograma a fotograma, play/pausa, bucle, barra de progreso, volumen y tiempo.

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimecode } from "../lib/time";
import { useClipsStore } from "../stores/clipsStore";

const FRAME_STEP = 1 / 30;

export function PreviewPlayer() {
  const clip = useClipsStore((s) =>
    s.clips.find((c) => c.id === s.selectedClipId),
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState(false);
  const [volume, setVolume] = useState(1);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(t, 0), v.duration || 0);
    setTime(v.currentTime);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.volume = volume;
  }, [volume, clip?.id]);

  if (!clip) {
    return (
      <div className="flex-1 grid place-items-center text-muted text-sm bg-canvas">
        Descarga o selecciona un clip para empezar
      </div>
    );
  }

  const controlClass =
    "text-muted hover:text-text disabled:opacity-40 px-1 text-sm";

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-canvas">
      <div className="flex-1 grid place-items-center p-4 min-h-0">
        <video
          key={clip.id}
          ref={videoRef}
          src={`/files/${clip.fileName}`}
          loop={loop}
          className="max-h-full max-w-full rounded-md shadow-[0_4px_24px_rgba(145,70,255,.15)]"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />
      </div>

      <div className="px-6 pb-4 flex flex-col gap-2">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={time}
          onChange={(e) => seek(parseFloat(e.target.value))}
          aria-label="Posición de reproducción"
          className="w-full accent-accent h-1.5"
        />
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={() => seek(0)} aria-label="Ir al inicio" className={controlClass}>⏮</button>
          <button type="button" onClick={() => seek(time - FRAME_STEP)} aria-label="Fotograma anterior" className={controlClass}>◀|</button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pausar" : "Reproducir"}
            className="w-9 h-9 rounded-full bg-accent text-white grid place-items-center text-sm hover:bg-accent-dark"
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button type="button" onClick={() => seek(time + FRAME_STEP)} aria-label="Fotograma siguiente" className={controlClass}>|▶</button>
          <button type="button" onClick={() => seek(duration)} aria-label="Ir al final" className={controlClass}>⏭</button>
          <button
            type="button"
            onClick={() => setLoop((l) => !l)}
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
            {formatTimecode(time)} / {formatTimecode(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Montar el reproductor en `client/src/components/AppShell.tsx`**

Reemplazar el `div` placeholder `Reproductor (Task 10)` por `<PreviewPlayer />` y añadir el import:

```tsx
import { MediaPanel } from "./MediaPanel";
import { PreviewPlayer } from "./PreviewPlayer";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";

export function AppShell() {
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <ToolRail />
        <main className="flex flex-1 min-w-0">
          <MediaPanel />
          <PreviewPlayer />
        </main>
        <aside className="w-72 bg-surface border-l border-border p-3 text-xs text-muted">
          Propiedades — Hito 2
        </aside>
      </div>
      <footer className="h-36 bg-surface border-t border-border grid place-items-center text-xs text-muted">
        Línea de tiempo — Hito 2
      </footer>
    </div>
  );
}
```

- [ ] **Step 4: Verificación manual completa del Hito 1**

Con `npm run dev` corriendo, en `http://localhost:5173`:
1. Seleccionar un clip → se carga el vídeo
2. ▶ reproduce, ⏸ pausa, Space también alterna
3. ◀| / |▶ mueven exactamente un fotograma con el vídeo pausado
4. ⏮ / ⏭ van a inicio/fin; 🔁 activa bucle (se ilumina en púrpura)
5. La barra de progreso refleja la posición y permite arrastrar (scrub)
6. El volumen funciona; el tiempo se muestra como `00:04.2 / 00:28.5`
7. Navegación por teclado: Tab recorre todos los controles con focus visible

Expected: todo funcional, sin errores en consola.

- [ ] **Step 5: Typecheck, tests y commit**

Run: `npm run typecheck -w @clipforge/client && npm run test`
Expected: sin errores; tests del server PASS.

```bash
git add client/src/lib/time.ts client/src/components/PreviewPlayer.tsx client/src/components/AppShell.tsx
git commit -m "feat(client): reproductor con controles de transporte completos y barra de progreso"
```

---

## Verificación final del Hito 1

- [ ] `npm run dev` arranca cliente y servidor de una vez
- [ ] Primer arranque descarga yt-dlp solo y muestra pantalla de preparación
- [ ] Descarga real de un clip de Twitch con progreso visible
- [ ] URL inválida → error claro sin romper la UI
- [ ] Reproductor completo con transporte B+C operativo
- [ ] `npm run test` en verde, typecheck de ambos workspaces sin errores
