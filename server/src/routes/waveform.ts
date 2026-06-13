import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getWaveform } from "../services/waveform.js";

const paramsSchema = z.object({
  kind: z.enum(["clip", "asset"]),
  fileName: z.string().min(1).max(255),
});

export function waveformRoutes(app: FastifyInstance): void {
  app.get<{ Params: { kind: string; fileName: string } }>(
    "/api/waveform/:kind/:fileName",
    async (req, reply) => {
      const parsed = paramsSchema.safeParse(req.params);
      if (!parsed.success) return reply.code(400).send({ error: "Parámetros no válidos" });
      try {
        const data = await getWaveform(parsed.data.kind, parsed.data.fileName);
        // determinista por archivo: el cliente puede cachearlo agresivamente
        reply.header("cache-control", "public, max-age=31536000, immutable");
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error generando el waveform";
        const code = message === "Archivo no encontrado" ? 404 : 400;
        return reply.code(code).send({ error: message });
      }
    },
  );
}
