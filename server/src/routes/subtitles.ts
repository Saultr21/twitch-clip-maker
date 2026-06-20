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
    crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable().default(null),
    opacity: z.number().default(1),
  }),
  language: z.string().optional(),
  model: z.enum(["small", "medium"]).optional(),
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
    const job = startTranscription(
      parsed.data.clip,
      info.fileName,
      parsed.data.language,
      parsed.data.model ?? "small",
    );
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
