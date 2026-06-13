import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execa, type ResultPromise } from "execa";
import type { ExportJobState, Project, QualityPresetId } from "@clipforge/shared";
import { ASSETS_DIR, CLIPS_DIR, EXPORTS_DIR } from "../lib/paths.js";
import { ffmpegBin } from "./binaries.js";
import { listClips } from "./clipsRegistry.js";
import { buildAss } from "./subtitles/assSubtitles.js";
import { buildFilterGraph } from "./ffmpeg/filterGraph.js";
import { buildFfmpegArgs } from "./ffmpeg/presets.js";

const TIME_RE = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/;

/** Segundos transcurridos según una línea de progreso de FFmpeg, o null. */
export function parseFfmpegTime(line: string): number | null {
  // Un chunk de stderr puede traer varias líneas de progreso: vale la última
  const matches = [...line.matchAll(new RegExp(TIME_RE, "g"))];
  const m = matches.at(-1);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Nombre de salida seguro con extensión .mp4 garantizada. */
export function sanitizeFileName(raw: string): string {
  const clean = raw
    .replace(/\.mp4$/i, "")
    .replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ _-]/g, "")
    .trim();
  if (!clean) throw new Error("Nombre de archivo no válido");
  return `${clean}.mp4`;
}

export interface ExportJob {
  jobId: string;
  state: ExportJobState;
  percent: number;
  fileName: string;
  error?: string;
  proc?: ResultPromise;
  /** Ruta del archivo .ass temporal cuando el export quema subtítulos. */
  assPath?: string;
  /** Suscriptores SSE: reciben cada cambio de estado/percent. */
  listeners: Set<() => void>;
}

const jobs = new Map<string, ExportJob>();

function notify(job: ExportJob): void {
  for (const fn of job.listeners) fn();
}

export function getJob(jobId: string): ExportJob | undefined {
  return jobs.get(jobId);
}

export function startExport(
  project: Project,
  preset: QualityPresetId,
  rawFileName?: string,
): ExportJob {
  const fileName = sanitizeFileName(
    rawFileName ?? `${project.name}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
  );
  const outPath = path.join(EXPORTS_DIR, fileName);

  const clipInfos = new Map(listClips().map((c) => [c.id, c]));

  let assPath: string | undefined;
  if (project.subtitles.cues.length > 0) {
    assPath = path.join(EXPORTS_DIR, `${crypto.randomUUID()}.ass`);
    fs.writeFileSync(
      assPath,
      buildAss(
        project.subtitles.cues,
        project.subtitles.style,
        project.settings.width,
        project.settings.height,
      ),
    );
  }

  const graph = buildFilterGraph(project, clipInfos, assPath);
  const args = buildFfmpegArgs(graph, preset, project.settings.fps, outPath, {
    videoDir: CLIPS_DIR,
    imageDir: ASSETS_DIR,
  });

  const job: ExportJob = {
    jobId: crypto.randomUUID(),
    state: "running",
    percent: 0,
    fileName,
    assPath,
    listeners: new Set(),
  };
  jobs.set(job.jobId, job);

  const proc = execa(ffmpegBin, args, { reject: false });
  job.proc = proc;

  proc.stderr?.on("data", (chunk: Buffer) => {
    const t = parseFfmpegTime(chunk.toString());
    if (t !== null && graph.totalDuration > 0) {
      job.percent = Math.min(99, (t / graph.totalDuration) * 100);
      notify(job);
    }
  });

  void proc.then((result) => {
    if (job.state === "cancelled") return;
    if (result.exitCode === 0) {
      job.state = "done";
      job.percent = 100;
    } else {
      job.state = "error";
      job.error = (result.stderr ?? "").split("\n").slice(-8).join("\n");
      fs.rmSync(outPath, { force: true });
    }
    if (job.assPath) fs.rmSync(job.assPath, { force: true });
    notify(job);
  });

  return job;
}

export function cancelExport(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job || job.state !== "running") return false;
  job.state = "cancelled";
  const outPath = path.join(EXPORTS_DIR, job.fileName);
  job.proc?.kill();
  // El parcial se borra cuando el proceso suelta el lock del archivo
  // (en Windows un rmSync inmediato fallaría en silencio con force:true)
  void job.proc
    ?.then(() => {
      fs.rmSync(outPath, { force: true });
      if (job.assPath) fs.rmSync(job.assPath, { force: true });
    })
    .catch(() => {});
  notify(job);
  return true;
}
