import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ClipInfo, DownloadEvent } from "@clipforge/shared";
import { CLIPS_DIR } from "../lib/paths.js";
import { matchPlatform, SUPPORTED_LABELS } from "../lib/supportedUrl.js";
import { addClip, listClips, removeClip } from "../services/clipsRegistry.js";
import { getClipThumbnail } from "../services/clipThumbnail.js";
import { downloadClip } from "../services/download.js";
import { probeVideo } from "../services/probe.js";
import { ingestUploadedVideo } from "../services/uploadVideo.js";
import { detectSilences } from "../services/silenceDetect.js";

const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "mkv", "avi", "m4v"]);

const silencesQuery = z.object({
  noise: z.coerce.number().min(-90).max(0).optional(),
  minSilence: z.coerce.number().min(0.1).max(10).optional(),
});

const downloadBody = z.object({ url: z.string() });

export function clipRoutes(app: FastifyInstance): void {
  app.get("/api/clips", async () => listClips());

  app.post("/api/clips", async (req, reply) => {
    const parsed = downloadBody.safeParse(req.body);
    if (!parsed.success || !matchPlatform(parsed.data.url)) {
      return reply
        .code(400)
        .send({ error: `La URL no es de una plataforma soportada (${SUPPORTED_LABELS})` });
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

  // Sube un vídeo del escritorio: streaming a disco, valida con ffprobe y registra
  app.post("/api/clips/upload", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "No se recibió ningún archivo" });

    const ext = path.extname(file.filename ?? "").slice(1).toLowerCase();
    if (!VIDEO_EXTS.has(ext)) {
      return reply.code(400).send({ error: "Formato de vídeo no soportado (mp4, webm, mov, mkv, avi, m4v)" });
    }

    const id = crypto.randomUUID();
    const tempPath = path.join(CLIPS_DIR, `${id}.tmp.${ext}`);
    try {
      await pipeline(file.file, fs.createWriteStream(tempPath));
      if (file.file.truncated) {
        fs.rmSync(tempPath, { force: true });
        return reply.code(413).send({ error: "El archivo supera el límite de 2 GB" });
      }
      const meta = await probeVideo(tempPath); // lanza si no hay pista de vídeo
      // conserva mp4/h264 y webm; transcodifica el resto a mp4 para que la
      // preview del navegador pueda reproducirlo (HEVC, mkv, avi…)
      const fileName = await ingestUploadedVideo(tempPath, id, ext);
      const clip: ClipInfo = {
        id,
        url: "",
        title: (file.filename ?? "Vídeo").replace(/\.[^.]+$/, "") || "Vídeo",
        fileName,
        ...meta,
        createdAt: new Date().toISOString(),
      };
      addClip(clip);
      return clip;
    } catch (err) {
      fs.rmSync(tempPath, { force: true });
      fs.rmSync(path.join(CLIPS_DIR, `${id}.mp4`), { force: true });
      return reply.code(400).send({
        error: err instanceof Error && /pista de vídeo/.test(err.message)
          ? "El archivo no contiene vídeo válido"
          : "No se pudo procesar el vídeo",
      });
    }
  });

  app.get<{ Params: { id: string }; Querystring: { noise?: string; minSilence?: string } }>(
    "/api/clips/:id/silences",
    async (req, reply) => {
      const clip = listClips().find((c) => c.id === req.params.id);
      if (!clip) return reply.code(404).send({ error: "Clip no encontrado" });
      const q = silencesQuery.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "Parámetros no válidos" });
      try {
        const ranges = await detectSilences(clip.fileName, q.data.noise, q.data.minSilence);
        return { ranges };
      } catch {
        return reply.code(500).send({ error: "No se pudo analizar el audio" });
      }
    },
  );

  app.get<{ Params: { id: string } }>("/api/clips/:id/thumbnail", async (req, reply) => {
    try {
      const thumbPath = await getClipThumbnail(req.params.id);
      reply.header("content-type", "image/jpeg");
      reply.header("cache-control", "public, max-age=86400");
      return reply.send(fs.createReadStream(thumbPath));
    } catch {
      return reply.code(404).send({ error: "Miniatura no disponible" });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/clips/:id", async (req, reply) => {
    if (!removeClip(req.params.id)) {
      return reply.code(404).send({ error: "Clip no encontrado" });
    }
    return reply.code(204).send();
  });
}
