import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execa, type ResultPromise } from "execa";
import type { ExportJobState, Project, QualityPresetId } from "@clipforge/shared";
import { ASSETS_DIR, CLIPS_DIR, EXPORTS_DIR } from "../lib/paths.js";
import { ffmpegBin } from "./binaries.js";
import { hasNvidiaGpu } from "./gpu.js";
import { listClips } from "./clipsRegistry.js";
import { buildAss } from "./subtitles/assSubtitles.js";
import { buildFilterGraph, type FilterGraph } from "./ffmpeg/filterGraph.js";
import { buildFfmpegArgs } from "./ffmpeg/presets.js";

/** True si el error de FFmpeg apunta a NVENC/CUDA y procede reintentar en CPU. */
export function isNvencFailure(stderr: string): boolean {
  return /nvenc|cuda|cuvid|openencode|no\s+capable\s+devices|driver does not support|cannot load nvcuda|InitializeEncoder/i.test(
    stderr,
  );
}

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
const MAX_JOBS = 20;

/** Descarta del mapa los jobs terminados más antiguos hasta no superar `max`;
 *  los que siguen "running" nunca se tocan. El Map conserva orden de inserción. */
export function pruneJobMap(map: Map<string, { state: ExportJobState }>, max: number): void {
  for (const [id, job] of map) {
    if (map.size <= max) break;
    if (job.state !== "running") map.delete(id);
  }
}

function pruneJobs(): void {
  pruneJobMap(jobs, MAX_JOBS);
}

function notify(job: ExportJob): void {
  for (const fn of job.listeners) fn();
}

/** Relee el estado fuera del flujo de narrowing (cancelExport lo muta aparte). */
function isCancelled(job: ExportJob): boolean {
  return job.state === "cancelled";
}

export function getJob(jobId: string): ExportJob | undefined {
  return jobs.get(jobId);
}

export function startExport(
  project: Project,
  preset: QualityPresetId,
  rawFileName?: string,
): ExportJob {
  pruneJobs(); // hygiene: no acumular jobs terminados de sesiones largas
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

  const job: ExportJob = {
    jobId: crypto.randomUUID(),
    state: "running",
    percent: 0,
    fileName,
    assPath,
    listeners: new Set(),
  };
  jobs.set(job.jobId, job);

  // La detección de GPU es asíncrona: el job se devuelve ya, el render corre aparte
  void runExport(job, graph, preset, project.settings.fps, outPath);

  return job;
}

/** Lanza un FFmpeg y resuelve con su salida; emite progreso por stderr. */
function runFfmpeg(
  job: ExportJob,
  args: string[],
  totalDuration: number,
): Promise<{ exitCode: number | undefined; stderr: string }> {
  const proc = execa(ffmpegBin, args, { reject: false });
  job.proc = proc;
  proc.stderr?.on("data", (chunk: Buffer) => {
    const t = parseFfmpegTime(chunk.toString());
    if (t !== null && totalDuration > 0) {
      job.percent = Math.min(99, (t / totalDuration) * 100);
      notify(job);
    }
  });
  return proc.then((r) => ({ exitCode: r.exitCode, stderr: r.stderr ?? "" }));
}

/** Render con NVENC si hay GPU; si NVENC falla, reintenta una vez en CPU. */
async function runExport(
  job: ExportJob,
  graph: FilterGraph,
  preset: QualityPresetId,
  fps: number,
  outPath: string,
): Promise<void> {
  const dirs = { videoDir: CLIPS_DIR, imageDir: ASSETS_DIR };
  try {
    if (isCancelled(job)) return;
    const useGpu = await hasNvidiaGpu();
    if (isCancelled(job)) return;

    let res = await runFfmpeg(job, buildFfmpegArgs(graph, preset, fps, outPath, dirs, useGpu), graph.totalDuration);

    // NVENC no disponible/saturado: reintento transparente en CPU
    if (res.exitCode !== 0 && useGpu && !isCancelled(job) && isNvencFailure(res.stderr)) {
      fs.rmSync(outPath, { force: true });
      job.percent = 0;
      notify(job);
      res = await runFfmpeg(job, buildFfmpegArgs(graph, preset, fps, outPath, dirs, false), graph.totalDuration);
    }

    if (isCancelled(job)) return;
    if (res.exitCode === 0) {
      job.state = "done";
      job.percent = 100;
    } else {
      job.state = "error";
      job.error = res.stderr.split("\n").slice(-8).join("\n");
      fs.rmSync(outPath, { force: true });
    }
  } catch (err) {
    if (isCancelled(job)) return;
    job.state = "error";
    job.error = err instanceof Error ? err.message : "Error en el export";
    fs.rmSync(outPath, { force: true });
  } finally {
    if (job.assPath) fs.rmSync(job.assPath, { force: true });
    notify(job);
  }
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
