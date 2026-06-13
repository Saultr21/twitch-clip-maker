import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { saveImageAsset } from "../services/assetsRepo.js";
import { addWatermark, listWatermarks, removeWatermark } from "../services/watermarksRepo.js";

export function watermarkRoutes(app: FastifyInstance): void {
  app.get("/api/watermarks", async () => listWatermarks());

  // Sube una imagen y la guarda como marca de agua reutilizable en un paso.
  // El nombre llega en el campo de formulario "name".
  app.post("/api/watermarks", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "No se recibió ningún archivo" });
    const rawName = (file.fields?.name as { value?: string } | undefined)?.value;
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: "El archivo supera el límite de 100MB" });
    }
    try {
      const asset = saveImageAsset(buf);
      const wm = {
        id: crypto.randomUUID(),
        fileName: asset.fileName,
        name: (rawName?.trim() || file.filename || "Marca de agua").slice(0, 60),
        createdAt: new Date().toISOString(),
      };
      addWatermark(wm);
      return wm;
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Archivo no válido",
      });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/watermarks/:id", async (req, reply) => {
    removeWatermark(req.params.id);
    return reply.code(204).send();
  });
}
