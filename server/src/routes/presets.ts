import type { FastifyInstance } from "fastify";
import { presetSchema } from "@clipforge/shared";
import { deletePreset, listPresets, loadPreset, savePreset } from "../services/presetsRepo.js";

export function presetRoutes(app: FastifyInstance): void {
  app.get("/api/presets", async () => listPresets());

  app.get<{ Params: { name: string } }>("/api/presets/:name", async (req, reply) => {
    const preset = loadPreset(req.params.name);
    if (!preset) return reply.code(404).send({ error: "Plantilla no encontrada" });
    return preset;
  });

  app.put<{ Params: { name: string } }>("/api/presets/:name", async (req, reply) => {
    const parsed = presetSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Plantilla no válida" });
    try {
      savePreset(req.params.name, parsed.data);
    } catch {
      return reply.code(400).send({ error: "Nombre de plantilla no válido" });
    }
    return { saved: req.params.name };
  });

  app.delete<{ Params: { name: string } }>("/api/presets/:name", async (req, reply) => {
    try {
      deletePreset(req.params.name);
    } catch {
      return reply.code(400).send({ error: "Nombre de plantilla no válido" });
    }
    return reply.code(204).send();
  });
}
