# Diseño — Descarga multiplataforma

> Fecha: 2026-06-19
> Estado: aprobado
> Autor: Saúl Trujillo Rodríguez

## Objetivo

Abrir el motor de descarga existente (yt-dlp) más allá de Twitch para soportar
también YouTube, TikTok, Instagram y X/Twitter, sin tocar el editor ni la
exportación, sin login y con riesgo mínimo.

## Contexto

VideoForge ya descarga clips de Twitch con yt-dlp, que soporta nativamente
las plataformas objetivo. La única limitación real es:

- Una validación de URL hardcodeada a Twitch en `server/src/lib/twitchUrl.ts`
  (función `isTwitchClipUrl`, con regex `/clip/` específica), usada por la ruta
  `POST /api/clips` en `server/src/routes/clips.ts`.
- Un selector de formato `-f best` en `server/src/services/download.ts` que
  limita YouTube a ~720p (YouTube sirve 1080p+ como streams de vídeo y audio
  separados).
- Textos y mensajes de error que mencionan "Twitch" explícitamente.

## Decisiones de alcance (acordadas con el usuario)

- **Validación**: allowlist de plataformas conocidas (no "cualquier URL https").
  Más seguro (evita SSRF a hosts arbitrarios) y permite mensajes de error claros.
- **Autenticación**: solo contenido público. Sin cookies, sin PO tokens, sin
  contenido privado/con edad.
- **Uso**: herramienta interna/propia. Sin aviso legal en UI.

## Diseño

### 1. Validación por allowlist — `server/src/lib/supportedUrl.ts` (nuevo)

Sustituye `twitchUrl.ts`. Define un registro de plataformas y una función de
match:

```ts
export interface Platform {
  id: "twitch" | "youtube" | "tiktok" | "instagram" | "x";
  label: string;
  hosts: string[]; // hostnames en minúsculas
}

export function matchPlatform(rawUrl: string): Platform | null;
```

Reglas de `matchPlatform`:
1. Parsear la URL; si lanza, devolver `null`.
2. Rechazar si `protocol !== "https:"`.
3. Normalizar host a minúsculas y buscar coincidencia exacta en el `hosts` de
   alguna plataforma.
4. Devolver la plataforma encontrada o `null`.

No se valida la ruta (path) — yt-dlp ya sabe extraer de cada host. Se elimina la
regex `/clip/` que era el candado a Twitch.

Allowlist inicial:

| id | label | hosts |
|---|---|---|
| twitch | Twitch | `twitch.tv`, `www.twitch.tv`, `m.twitch.tv`, `clips.twitch.tv` |
| youtube | YouTube | `youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtu.be` |
| tiktok | TikTok | `tiktok.com`, `www.tiktok.com`, `m.tiktok.com`, `vm.tiktok.com` |
| instagram | Instagram | `instagram.com`, `www.instagram.com` |
| x | X (Twitter) | `x.com`, `www.x.com`, `twitter.com`, `www.twitter.com`, `mobile.twitter.com` |

(YouTube Shorts e IGTV/Reels caen bajo los mismos hosts, no necesitan entradas
propias.)

### 2. Mejor calidad de descarga — `server/src/services/download.ts`

Cambiar el selector de formato:

- Antes: `-f best`
- Después: `-f "bv*+ba/b"` + `--merge-output-format mp4`

Se mantiene `--remux-video mp4` como red de seguridad para formatos combinados
que no sean mp4 (p. ej. webm de YouTube). `--no-playlist` se mantiene para que
una URL de canal/playlist no descargue cientos de vídeos. FFmpeg (ya presente)
hace el merge de los streams separados.

El resto del flujo no cambia: `--print title --skip-download` para el título,
progreso por NDJSON, `probeVideo`, registro del clip.

### 3. Errores y textos

- **Ruta `POST /api/clips`** (`clips.ts`): usar `matchPlatform` en vez de
  `isTwitchClipUrl`. Mensaje 400:
  *"La URL no es de una plataforma soportada (Twitch, YouTube, TikTok,
  Instagram, X)"*.
- **`friendlyDownloadError`** (`download.ts`): generalizar el texto del bloqueo
  de Windows para que no diga "clips de Twitch" sino "vídeos".
- **Cliente**: localizar los strings que mencionan "clip de Twitch"
  (placeholder del input, ayudas, estado vacío) y generalizarlos a
  multiplataforma. Se hará por búsqueda de los literales en `client/src`.

### 4. Tests

- `server/src/lib/supportedUrl.test.ts` (reemplaza `twitchUrl.test.ts`):
  - Una URL válida por plataforma (5 casos).
  - Una URL inválida representativa por categoría: `http://` (no https), host
    desconocido (`vimeo.com`), string no-URL.
  - Verificar que el `id`/`label` devuelto es el correcto para cada plataforma.
- El resto de la suite (162 tests) no se toca.

## Lo que NO entra (YAGNI)

- Cookies / login / PO tokens / contenido privado o con edad.
- Cap de duración o tamaño de descarga (anotado en backlog del TODO).
- Selector de plataforma en la UI (se detecta en backend a partir de la URL).
- Refactors no relacionados.

## Archivos afectados

- `server/src/lib/supportedUrl.ts` (nuevo, sustituye `twitchUrl.ts`)
- `server/src/lib/supportedUrl.test.ts` (nuevo, sustituye `twitchUrl.test.ts`)
- `server/src/lib/twitchUrl.ts` (eliminar)
- `server/src/lib/twitchUrl.test.ts` (eliminar)
- `server/src/routes/clips.ts` (usar `matchPlatform`)
- `server/src/services/download.ts` (selector de formato + error genérico)
- `client/src/**` (textos que mencionen Twitch — localizar e ir uno a uno)

## Verificación

- `npm test` verde (incluida la nueva suite de `supportedUrl`).
- `typecheck` limpio.
- Smoke test manual: descargar un vídeo público real de al menos YouTube y
  TikTok, comprobar que el MP4 resultante es reproducible en la preview.
```
