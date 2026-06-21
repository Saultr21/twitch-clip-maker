import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { exportRequestSchema, projectSchema, type ExportEvent } from "@clipforge/shared";
import { EXPORTS_DIR } from "../lib/paths.js";
import { cancelExport, getJob, startExport } from "../services/exportJobs.js";
import { exportStillFrame, exportGif } from "../services/exportStill.js";

const frameBody = z.object({ project: projectSchema, time: z.number().min(0).default(0), fileName: z.string().optional() });
const gifBody = z.object({ project: projectSchema, fileName: z.string().optional() });

/** Nombre seguro con la extensión dada (sin path traversal). */
function safeName(raw: string | undefined, fallback: string, ext: string): string {
  const clean = (raw ?? fallback).replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ _-]/g, "").trim();
  return `${clean || fallback}.${ext}`;
}

export function exportRoutes(app: FastifyInstance): void {
  // Muestra el diálogo nativo "Guardar como" de Windows y devuelve la ruta elegida.
  app.post("/api/export/save-dialog", async (req) => {
    const { defaultName } = z.object({ defaultName: z.string().optional() }).parse(req.body ?? {});
    const safeName = (defaultName ?? "export.mp4")
      .replace(/['"\\`]/g, "")
      .replace(/\.mp4$/i, "") + ".mp4";
    const initialDir = EXPORTS_DIR.replace(/'/g, "''");
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$d = New-Object System.Windows.Forms.SaveFileDialog",
      "$d.Title = 'Guardar vídeo exportado'",
      "$d.Filter = 'Vídeo MP4 (*.mp4)|*.mp4'",
      "$d.DefaultExt = 'mp4'",
      `$d.FileName = '${safeName}'`,
      `$d.InitialDirectory = '${initialDir}'`,
      "$r = $d.ShowDialog()",
      "if ($r -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }",
    ].join("; ");
    try {
      const { stdout } = await execa(
        "powershell.exe",
        ["-Sta", "-NoProfile", "-NonInteractive", "-Command", script],
        { reject: false },
      );
      const filePath = stdout.trim() || null;
      return { filePath };
    } catch {
      return { filePath: null };
    }
  });

  app.post("/api/export", async (req, reply) => {
    const parsed = exportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Petición de exportación no válida" });
    }
    const { outputPath } = parsed.data;
    if (outputPath !== undefined && !path.isAbsolute(outputPath)) {
      return reply.code(400).send({ error: "Ruta de salida no válida" });
    }
    try {
      const job = startExport(parsed.data.project, parsed.data.preset, parsed.data.fileName, outputPath);
      return { jobId: job.jobId, fileName: job.fileName };
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : "No se pudo iniciar la exportación" });
    }
  });

  // Fotograma de portada (PNG) del montaje en un instante dado
  app.post("/api/export/frame", async (req, reply) => {
    const parsed = frameBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Petición no válida" });
    const fileName = safeName(parsed.data.fileName, parsed.data.project.name, "png");
    try {
      await exportStillFrame(parsed.data.project, parsed.data.time, fileName);
      return { fileName };
    } catch {
      return reply.code(500).send({ error: "No se pudo exportar el fotograma" });
    }
  });

  // Export a GIF optimizado del montaje
  app.post("/api/export/gif", async (req, reply) => {
    const parsed = gifBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Petición no válida" });
    const fileName = safeName(parsed.data.fileName, parsed.data.project.name, "gif");
    try {
      await exportGif(parsed.data.project, fileName);
      return { fileName };
    } catch {
      return reply.code(500).send({ error: "No se pudo exportar el GIF" });
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
        send({ type: "done", fileName: job.fileName, filePath: job.outPath });
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

  // Revela el archivo exportado en el Explorador. `explorer.exe /select,<archivo>`
  // SIEMPRE abre y enfoca una ventana con el archivo resaltado — a diferencia de
  // abrir solo la carpeta, que Windows ignora si ya hay una ventana de esa carpeta
  // abierta (el bug que veía el usuario: "no pasa nada"). Si no llega un archivo
  // válido (o no existe), cae a abrir la carpeta. explorer.exe devuelve código ≠ 0
  // aun teniendo éxito, por eso reject:false. `path.basename` evita path traversal.
  app.post("/api/exports/open", async (req) => {
    const { fileName, filePath } = z
      .object({ fileName: z.string().optional(), filePath: z.string().optional() })
      .parse(req.body ?? {});

    // Ruta absoluta (el usuario eligió ubicación custom): abre directamente con /select
    if (filePath && path.isAbsolute(filePath) && fs.existsSync(filePath)) {
      void execa("explorer.exe", [`/select,${filePath}`], { reject: false });
      return { opened: true };
    }

    // Nombre relativo: busca en la carpeta de exports por defecto
    if (fileName) {
      const full = path.join(EXPORTS_DIR, path.basename(fileName));
      if (fs.existsSync(full)) {
        void execa("explorer.exe", [`/select,${full}`], { reject: false });
        return { opened: true };
      }
    }

    void execa("explorer.exe", [EXPORTS_DIR], { reject: false });
    return { opened: true };
  });
}
