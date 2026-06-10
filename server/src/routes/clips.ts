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
