import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import type { SubtitleCue, VideoClip } from "@clipforge/shared";
import { CLIPS_DIR, EXPORTS_DIR } from "../../lib/paths.js";
import { ffmpegBin } from "../binaries.js";
import {
  ensureWhisper,
  hasNvidiaGpu,
  vadModelPath,
  whisperExeFor,
  whisperModelPath,
  whisperThreads,
  type WhisperModelId,
} from "./whisperBinary.js";
import { parseWhisperJson } from "./parseWhisperJson.js";
import { cuesToProjectTime } from "./cuesToProjectTime.js";

export type SubtitleJobState = "running" | "done" | "error" | "cancelled";

export interface SubtitleJob {
  jobId: string;
  state: SubtitleJobState;
  cues?: SubtitleCue[];
  error?: string;
  listeners: Set<() => void>;
  cancelled: boolean;
}

const jobs = new Map<string, SubtitleJob>();
export function getSubtitleJob(id: string): SubtitleJob | undefined {
  return jobs.get(id);
}
function notify(j: SubtitleJob): void {
  for (const fn of j.listeners) fn();
}

/** Transcribe el audio del clip y devuelve cues en tiempo de proyecto. */
export function startTranscription(
  clip: VideoClip,
  fileName: string,
  language?: string,
  model: WhisperModelId = "small",
): SubtitleJob {
  const job: SubtitleJob = {
    jobId: crypto.randomUUID(),
    state: "running",
    listeners: new Set(),
    cancelled: false,
  };
  jobs.set(job.jobId, job);

  void run(job, clip, fileName, language, model).catch((err) => {
    if (job.cancelled) return;
    job.state = "error";
    job.error = err instanceof Error ? err.message : "Error en la transcripción";
    notify(job);
  });

  return job;
}

async function run(
  job: SubtitleJob,
  clip: VideoClip,
  fileName: string,
  language: string | undefined,
  model: WhisperModelId,
): Promise<void> {
  await ensureWhisper(model);
  if (job.cancelled) return;
  const useGpu = await hasNvidiaGpu();

  const wav = path.join(EXPORTS_DIR, `subs-${job.jobId}.wav`);
  const outPrefix = path.join(EXPORTS_DIR, `subs-${job.jobId}`);
  try {
    // 1) extraer audio del clip a WAV 16kHz mono (lo que espera whisper.cpp)
    await execa(ffmpegBin, [
      "-y", "-i", path.join(CLIPS_DIR, fileName),
      "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav,
    ]);
    if (job.cancelled) return;

    // 2) whisper.cpp → JSON completo (segmentos + tokens).
    //  -nfa + -dtw: timestamps por palabra precisos (DTW exige desactivar flash
    //    attention) → el karaoke deja de ir a tirones de ~1s.
    //  --vad: procesa solo los tramos con voz → el 1.er subtítulo entra cuando
    //    hablan (no al inicio) y de paso acelera al saltarse música/silencios.
    const args = [
      "-m", whisperModelPath(model), "-f", wav, "-oj", "-ojf", "-of", outPrefix,
      "-t", String(whisperThreads), "-nfa", "-dtw", model,
      "--vad", "-vm", vadModelPath(),
      ...(language && language !== "auto" ? ["-l", language] : ["-l", "auto"]),
    ];
    await execa(whisperExeFor(useGpu), args);
    if (job.cancelled) return;

    // 3) parsear y mapear al tiempo de proyecto
    const raw = fs.readFileSync(`${outPrefix}.json`, "utf8");
    const fileCues = parseWhisperJson(raw);
    job.cues = cuesToProjectTime(fileCues, clip);
    job.state = "done";
    notify(job);
  } finally {
    fs.rmSync(wav, { force: true });
    fs.rmSync(`${outPrefix}.json`, { force: true });
  }
}

export function cancelTranscription(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.state !== "running") return false;
  job.cancelled = true;
  job.state = "cancelled";
  notify(job);
  return true;
}
