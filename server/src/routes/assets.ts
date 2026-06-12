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
