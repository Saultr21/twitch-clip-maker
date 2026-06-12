import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execa, type ResultPromise } from "execa";
import type { ExportJobState, Project, QualityPresetId } from "@clipforge/shared";
import { ASSETS_DIR, CLIPS_DIR, EXPORTS_DIR } from "../lib/paths.js";
import { ffmpegBin } from "./binaries.js";
import { listClips } from "./clipsRegistry.js";
import { buildFilterGraph } from "./ffmpeg/filterGraph.js";
import { buildFfmpegArgs } from "./ffmpeg/presets.js";

const TIME_RE = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/;

/** Segundos transcurridos según una línea de progreso de FFmpeg, o null. */
export function parseFfmpegTime(line: string): number | null {
  const m = TIME_RE.exec(line);
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
  const graph = buildFilterGraph(project, clipInfos);
  const args = buildFfmpegArgs(graph, preset, project.settings.fps, outPath, {
    videoDir: CLIPS_DIR,
    imageDir: ASSETS_DIR,
  });

  const job: ExportJob = {
    jobId: crypto.randomUUID(),
    state: "running",
    percent: 0,
    fileName,
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
    notify(job);
  });

  return job;
}

export function cancelExport(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job || job.state !== "running") return false;
  job.state = "cancelled";
  job.proc?.kill();
  fs.rmSync(path.join(EXPORTS_DIR, job.fileName), { force: true });
  notify(job);
  return true;
}
