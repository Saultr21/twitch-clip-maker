import { execa } from "execa";
import type { FastifyInstance } from "fastify";
import { exportRequestSchema, type ExportEvent } from "@clipforge/shared";
import { EXPORTS_DIR } from "../lib/paths.js";
import { cancelExport, getJob, startExport } from "../services/exportJobs.js";

export function exportRoutes(app: FastifyInstance): void {
  app.post("/api/export", async (req, reply) => {
    const parsed = exportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Petición de exportación no válida" });
    }
    try {
      const job = startExport(parsed.data.project, parsed.data.preset, parsed.data.fileName);
      return { jobId: job.jobId, fileName: job.fileName };
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : "No se pudo iniciar la exportación" });
    }
  });

  app.get<{ Params: { jobId: string } }>("/api/export/:jobId/progress", (req, reply) => {
    const job = getJob(req.params.jobId);
    if (!job) return reply.code(404).send({ error: "Job no encontrado" });

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const send = (event: ExportEvent) =>
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

    const push = () => {
      if (job.state === "running") send({ type: "progress", percent: job.percent });
      else if (job.state === "done") {
        send({ type: "done", fileName: job.fileName });
        cleanup();
      } else {
        send({ type: "error", message: job.error ?? "Exportación cancelada" });
        cleanup();
      }
    };
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return; // nunca escribir/cerrar dos veces el stream
      cleaned = true;
      job.listeners.delete(push);
      reply.raw.end();
    };

    job.listeners.add(push);
    req.raw.on("close", () => job.listeners.delete(push));
    push(); // estado actual inmediato
  });

  app.delete<{ Params: { jobId: string } }>("/api/export/:jobId", async (req, reply) => {
    if (!cancelExport(req.params.jobId)) {
      return reply.code(404).send({ error: "Job no encontrado o ya terminado" });
    }
    return reply.code(204).send();
  });

  // Abre la carpeta de exports en el Explorador. Se invoca explorer.exe con la
  // ruta del directorio directamente: abrir un directorio siempre lanza el
  // Explorador (nunca el verbo "editar" de un script). explorer.exe devuelve
  // código ≠ 0 aun teniendo éxito, por eso reject:false.
  app.post("/api/exports/open", async () => {
    void execa("explorer.exe", [EXPORTS_DIR], { reject: false });
    return { opened: true };
  });
}
