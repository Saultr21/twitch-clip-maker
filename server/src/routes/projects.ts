import type { FastifyInstance } from "fastify";
import { projectSchema } from "@clipforge/shared";
import {
  deleteProject,
  listProjects,
  loadProject,
  saveProject,
  sanitizeProjectName,
} from "../services/projectsRepo.js";

export function projectRoutes(app: FastifyInstance): void {
  app.get("/api/projects", async () => listProjects());

  app.get<{ Params: { name: string } }>("/api/projects/:name", async (req, reply) => {
    const project = loadProject(req.params.name);
    if (!project) return reply.code(404).send({ error: "Proyecto no encontrado" });
    return project;
  });

  app.put<{ Params: { name: string } }>("/api/projects/:name", async (req, reply) => {
    const parsed = projectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Proyecto no válido", detail: parsed.error.issues });
    }
    try {
      saveProject(req.params.name, parsed.data);
    } catch {
      return reply.code(400).send({ error: "Nombre de proyecto no válido" });
    }
    return { saved: sanitizeProjectName(req.params.name) };
  });

  app.delete<{ Params: { name: string } }>("/api/projects/:name", async (req, reply) => {
    try {
      deleteProject(req.params.name);
    } catch {
      return reply.code(400).send({ error: "Nombre de proyecto no válido" });
    }
    return reply.code(204).send();
  });
}
