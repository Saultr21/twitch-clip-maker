# Descarga multiplataforma — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abrir el motor de descarga (yt-dlp) a YouTube, TikTok, Instagram y X/Twitter además de Twitch, validando por allowlist y mejorando la calidad de descarga, sin login ni cambios en el editor/export.

**Architecture:** Se sustituye la validación hardcodeada a Twitch (`twitchUrl.ts`) por un registro de plataformas con allowlist de hosts (`supportedUrl.ts`). La ruta `POST /api/clips` usa la nueva función. El selector de formato de yt-dlp pasa de `best` a `bv*+ba/b` con merge a mp4. Se generalizan textos y mensajes de error en backend y cliente.

**Tech Stack:** TypeScript, Fastify, yt-dlp, execa, Vitest, React.

Spec: `docs/superpowers/specs/2026-06-19-descarga-multiplataforma-design.md`

---

## File Structure

- `server/src/lib/supportedUrl.ts` — NUEVO. Registro de plataformas + `matchPlatform`. Sustituye `twitchUrl.ts`.
- `server/src/lib/supportedUrl.test.ts` — NUEVO. Tests de `matchPlatform`. Sustituye `twitchUrl.test.ts`.
- `server/src/lib/twitchUrl.ts` — ELIMINAR.
- `server/src/lib/twitchUrl.test.ts` — ELIMINAR.
- `server/src/routes/clips.ts` — MODIFICAR. Usa `matchPlatform` y mensaje de error genérico.
- `server/src/services/download.ts` — MODIFICAR. Selector de formato + error genérico.
- `client/src/features/media/MediaPanel.tsx` — MODIFICAR. Textos de UI.
- `client/src/features/preview/PreviewCanvas.tsx` — MODIFICAR. Texto de UI.
- `client/src/components/WelcomeTour.tsx` — MODIFICAR. Textos del tour.

---

## Task 1: Registro de plataformas y `matchPlatform`

**Files:**
- Create: `server/src/lib/supportedUrl.ts`
- Test: `server/src/lib/supportedUrl.test.ts`

- [ ] **Step 1: Write the failing test**

Crear `server/src/lib/supportedUrl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchPlatform } from "./supportedUrl.js";

describe("matchPlatform", () => {
  it.each([
    ["https://clips.twitch.tv/AwkwardSlug", "twitch"],
    ["https://www.twitch.tv/ibai/clip/PoisedSquare-abc", "twitch"],
    ["https://www.youtube.com/watch?v=abc", "youtube"],
    ["https://youtu.be/abc123", "youtube"],
    ["https://www.tiktok.com/@user/video/123", "tiktok"],
    ["https://vm.tiktok.com/ABC123/", "tiktok"],
    ["https://www.instagram.com/reel/Cabc123/", "instagram"],
    ["https://x.com/user/status/123", "x"],
    ["https://twitter.com/user/status/123", "x"],
  ])("acepta %s como %s", (url, id) => {
    expect(matchPlatform(url)?.id).toBe(id);
  });

  it.each([
    "http://www.youtube.com/watch?v=abc", // no https
    "https://vimeo.com/12345",            // host no soportado
    "https://clips.twitch.tv.evil.com/x", // host falsificado
    "javascript:alert(1)",
    "no es una url",
  ])("rechaza %s", (url) => {
    expect(matchPlatform(url)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/lib/supportedUrl.test.ts`
Expected: FAIL — `Cannot find module './supportedUrl.js'` o `matchPlatform is not a function`.

- [ ] **Step 3: Write minimal implementation**

Crear `server/src/lib/supportedUrl.ts`:

```ts
export interface Platform {
  id: "twitch" | "youtube" | "tiktok" | "instagram" | "x";
  label: string;
  hosts: string[];
}

const PLATFORMS: Platform[] = [
  {
    id: "twitch",
    label: "Twitch",
    hosts: ["twitch.tv", "www.twitch.tv", "m.twitch.tv", "clips.twitch.tv"],
  },
  {
    id: "youtube",
    label: "YouTube",
    hosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"],
  },
  {
    id: "tiktok",
    label: "TikTok",
    hosts: ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com"],
  },
  {
    id: "instagram",
    label: "Instagram",
    hosts: ["instagram.com", "www.instagram.com"],
  },
  {
    id: "x",
    label: "X (Twitter)",
    hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"],
  },
];

/** Nombres de plataforma para mensajes de usuario. */
export const SUPPORTED_LABELS = "Twitch, YouTube, TikTok, Instagram, X";

/** Devuelve la plataforma soportada de una URL https, o null si no encaja. */
export function matchPlatform(rawUrl: string): Platform | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  return PLATFORMS.find((p) => p.hosts.includes(host)) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/lib/supportedUrl.test.ts`
Expected: PASS — 14 casos verdes.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/supportedUrl.ts server/src/lib/supportedUrl.test.ts
git commit -m "feat(server): allowlist de plataformas (matchPlatform) para descargas"
```

---

## Task 2: Eliminar `twitchUrl` y enganchar la ruta a `matchPlatform`

**Files:**
- Modify: `server/src/routes/clips.ts:9` (import) y `:31` (validación)
- Delete: `server/src/lib/twitchUrl.ts`, `server/src/lib/twitchUrl.test.ts`

- [ ] **Step 1: Eliminar los archivos de twitchUrl**

```bash
git rm server/src/lib/twitchUrl.ts server/src/lib/twitchUrl.test.ts
```

- [ ] **Step 2: Cambiar el import en `clips.ts`**

En `server/src/routes/clips.ts`, sustituir la línea 9:

```ts
import { isTwitchClipUrl } from "../lib/twitchUrl.js";
```

por:

```ts
import { matchPlatform, SUPPORTED_LABELS } from "../lib/supportedUrl.js";
```

- [ ] **Step 3: Cambiar la validación en el handler `POST /api/clips`**

En `server/src/routes/clips.ts`, sustituir el bloque (líneas ~30-35):

```ts
    const parsed = downloadBody.safeParse(req.body);
    if (!parsed.success || !isTwitchClipUrl(parsed.data.url)) {
      return reply
        .code(400)
        .send({ error: "La URL no es un clip válido de Twitch" });
    }
```

por:

```ts
    const parsed = downloadBody.safeParse(req.body);
    if (!parsed.success || !matchPlatform(parsed.data.url)) {
      return reply
        .code(400)
        .send({ error: `La URL no es de una plataforma soportada (${SUPPORTED_LABELS})` });
    }
```

- [ ] **Step 4: Verificar typecheck y suite del server**

Run: `cd server && npx tsc --noEmit && npx vitest run`
Expected: PASS — sin referencias rotas a `twitchUrl`, toda la suite del server verde.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/clips.ts
git commit -m "refactor(server): la ruta de descarga valida por matchPlatform"
```

---

## Task 3: Mejor calidad de descarga y error genérico

**Files:**
- Modify: `server/src/services/download.ts:29-38` (args de yt-dlp) y `:78-82` (mensaje de error)

- [ ] **Step 1: Cambiar el selector de formato**

En `server/src/services/download.ts`, sustituir el array de args de la descarga (líneas ~29-38):

```ts
    const proc = execa(ytDlpPath, [
      url,
      "-o", outPath,
      "--encoding", "utf-8",
      "--newline",
      "--no-playlist",
      "--ffmpeg-location", ffmpegBin,
      "-f", "best",
      "--remux-video", "mp4",
    ]);
```

por:

```ts
    const proc = execa(ytDlpPath, [
      url,
      "-o", outPath,
      "--encoding", "utf-8",
      "--newline",
      "--no-playlist",
      "--ffmpeg-location", ffmpegBin,
      // Mejor vídeo + mejor audio (YouTube sirve 1080p+ en streams separados);
      // si no hay separados, cae a la mejor combinada (b). Merge/remux a mp4.
      "-f", "bv*+ba/b",
      "--merge-output-format", "mp4",
      "--remux-video", "mp4",
    ]);
```

- [ ] **Step 2: Generalizar el mensaje de error de Windows**

En `server/src/services/download.ts`, sustituir el cuerpo del `if (blocked)` (líneas ~77-83):

```ts
  if (blocked) {
    return new Error(
      "Windows bloqueó yt-dlp (Control de aplicaciones inteligente). Para descargar " +
        "clips de Twitch, desactívalo en Seguridad de Windows, o sube el vídeo a mano " +
        "con «Subir vídeo del escritorio».",
    );
  }
```

por:

```ts
  if (blocked) {
    return new Error(
      "Windows bloqueó yt-dlp (Control de aplicaciones inteligente). Para descargar " +
        "vídeos, desactívalo en Seguridad de Windows, o sube el vídeo a mano " +
        "con «Subir vídeo del escritorio».",
    );
  }
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: PASS — sin errores de tipos.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/download.ts
git commit -m "feat(server): descarga bv*+ba con merge a mp4 (sube calidad, arregla 720p YouTube)"
```

---

## Task 4: Generalizar textos del cliente

**Files:**
- Modify: `client/src/features/media/MediaPanel.tsx:96`, `:103`, `:174`
- Modify: `client/src/features/preview/PreviewCanvas.tsx:193`
- Modify: `client/src/components/WelcomeTour.tsx:13`, `:14`

No hay tests para strings de UI; la verificación es typecheck + revisión visual.

- [ ] **Step 1: MediaPanel — etiqueta del input (línea 96)**

Sustituir:

```tsx
          URL del clip de Twitch
```

por:

```tsx
          URL del vídeo (Twitch, YouTube, TikTok, Instagram, X)
```

- [ ] **Step 2: MediaPanel — placeholder (línea 103)**

Sustituir:

```tsx
          placeholder="https://clips.twitch.tv/..."
```

por:

```tsx
          placeholder="https://www.youtube.com/watch?v=..."
```

- [ ] **Step 3: MediaPanel — estado vacío (línea 174)**

Sustituir:

```tsx
            Aún no hay vídeos. Pega una URL de Twitch, sube un archivo o arrástralo aquí.
```

por:

```tsx
            Aún no hay vídeos. Pega una URL (Twitch, YouTube, TikTok…), sube un archivo o arrástralo aquí.
```

- [ ] **Step 4: PreviewCanvas — pista del estado vacío (línea 193)**

Sustituir:

```tsx
                  <Link2 size={13} aria-hidden="true" /> Pega una URL de clip de Twitch
```

por:

```tsx
                  <Link2 size={13} aria-hidden="true" /> Pega una URL de vídeo (Twitch, YouTube, TikTok…)
```

- [ ] **Step 5: WelcomeTour — textos del tour (líneas 13-14)**

Sustituir la línea 13:

```tsx
  { Icon: Clapperboard, title: "Bienvenido a VideoForge", body: "Un editor de vídeo local: descarga clips de Twitch o usa los tuyos, edítalos y exporta para TikTok, Reels, Shorts o YouTube." },
```

por:

```tsx
  { Icon: Clapperboard, title: "Bienvenido a VideoForge", body: "Un editor de vídeo local: descarga vídeos de Twitch, YouTube, TikTok, Instagram o X (o usa los tuyos), edítalos y exporta para TikTok, Reels, Shorts o YouTube." },
```

Y la línea 14:

```tsx
  { Icon: Upload, title: "1 · Añade vídeo", body: "En Medios, pega una URL de Twitch o sube/arrastra un vídeo del escritorio. Luego doble clic (o arrástralo) para llevarlo a la línea de tiempo." },
```

por:

```tsx
  { Icon: Upload, title: "1 · Añade vídeo", body: "En Medios, pega una URL (Twitch, YouTube, TikTok, Instagram, X) o sube/arrastra un vídeo del escritorio. Luego doble clic (o arrástralo) para llevarlo a la línea de tiempo." },
```

- [ ] **Step 6: Verificar typecheck del cliente**

Run: `cd client && npx tsc --noEmit`
Expected: PASS — sin errores de tipos.

- [ ] **Step 7: Commit**

```bash
git add client/src/features/media/MediaPanel.tsx client/src/features/preview/PreviewCanvas.tsx client/src/components/WelcomeTour.tsx
git commit -m "feat(client): textos multiplataforma en Medios, preview y tour"
```

---

## Task 5: Verificación final y TODO

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Ejecutar toda la suite y typecheck**

Run (desde la raíz, según scripts del repo): `npm test` y el typecheck de ambos paquetes.
Expected: PASS — suite completa verde (incluida `supportedUrl.test.ts`, sin `twitchUrl`).

- [ ] **Step 2: Smoke test manual (usuario)**

Arrancar la app, pegar una URL pública real de YouTube y otra de TikTok, descargar y comprobar que el MP4 aparece en Medios y se reproduce en la preview.

- [ ] **Step 3: Actualizar TODO.md**

Añadir bajo una sección nueva con fecha 2026-06-19 una entrada marcada hecha: "Descarga multiplataforma (allowlist Twitch/YouTube/TikTok/Instagram/X, formato bv*+ba con merge mp4)". Anotar en Backlog el cap de duración/tamaño como diferido. Actualizar `Last updated`.

- [ ] **Step 4: Commit**

```bash
git add TODO.md
git commit -m "docs: TODO al dia (descarga multiplataforma)"
```

---

## Notas de implementación

- Efecto secundario deseado: al quitar la regex `/clip/`, Twitch acepta ahora también VODs (`twitch.tv/videos/...`) y la página de canal en directo, no solo clips.
- X/Twitter: solo funcionará el contenido público; los vídeos que exijan login fallarán con error de yt-dlp (comportamiento aceptable, se reporta al usuario por el flujo de error existente).
- `--no-playlist` evita que una URL de canal/playlist descargue cientos de vídeos.
- No se añaden cookies ni PO tokens (fuera de alcance por decisión del spec).
