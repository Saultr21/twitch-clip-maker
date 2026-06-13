import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { execa } from "execa";
import { BIN_DIR } from "../../lib/paths.js";
import { ffmpegBin } from "../binaries.js";
import { hasNvidiaGpu } from "../gpu.js";

export { hasNvidiaGpu };

// Builds de whisper.cpp (v1.8.6, verificados en runtime). El cuBLAS trae las
// DLLs de CUDA; el CPU es ligero. Se elige según haya GPU NVIDIA o no.
const CPU_ZIP_URL =
  "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.6/whisper-bin-x64.zip";
const CUDA_ZIP_URL =
  "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.6/whisper-cublas-12.4.0-bin-x64.zip";

export type WhisperModelId = "small" | "medium";
const MODEL_FILES: Record<WhisperModelId, string> = {
  small: "ggml-small.bin",
  medium: "ggml-medium.bin",
};
const MODEL_URL = (m: WhisperModelId) =>
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILES[m]}`;

// Modelo VAD (Silero) para detectar voz: ~885 KB. Procesar solo los tramos con
// voz fija el onset (el 1.er subtítulo entra cuando hablan, no al inicio) y de
// paso acelera (se salta música/silencios).
const VAD_MODEL_FILE = "ggml-silero-v5.1.2.bin";
const VAD_MODEL_URL =
  "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin";

const WHISPER_DIR = path.join(BIN_DIR, "whisper");
const CPU_DIR = path.join(WHISPER_DIR, "cpu");
const CUDA_DIR = path.join(WHISPER_DIR, "cuda");
// v2: el warmup cambió a -nfa -dtw (kernels distintos a los de flash attention),
// el nuevo nombre fuerza recompilar la caché JIT en instalaciones existentes
const WARM_SENTINEL = path.join(WHISPER_DIR, ".cuda-warmed-v2");

export function whisperModelPath(model: WhisperModelId): string {
  return path.join(WHISPER_DIR, MODEL_FILES[model]);
}

export function vadModelPath(): string {
  return path.join(WHISPER_DIR, VAD_MODEL_FILE);
}

/** Hilos a usar: todos los lógicos disponibles. */
export const whisperThreads = Math.max(1, os.cpus().length);

/** Ruta del whisper-cli a usar (cuda si hay GPU y está instalado, si no cpu). */
export function whisperExeFor(useGpu: boolean): string {
  return path.join(useGpu ? CUDA_DIR : CPU_DIR, "whisper-cli.exe");
}

export type WhisperStatus =
  | { ready: true; gpu: boolean }
  | { ready: false; step: "missing" | "downloading" | "warming" | "error"; message?: string };

let status: WhisperStatus = { ready: false, step: "missing" };
export function getWhisperStatus(): WhisperStatus {
  return status;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Descarga fallida (${res.status}): ${url}`);
  const tmp = `${dest}.tmp`;
  try {
    await pipeline(Readable.fromWeb(res.body as WebReadableStream), fs.createWriteStream(tmp));
    fs.renameSync(tmp, dest);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/** Descarga y extrae un build de whisper en destDir, dejando exe + DLLs juntos. */
async function ensureBuild(url: string, destDir: string): Promise<void> {
  const exe = path.join(destDir, "whisper-cli.exe");
  if (fs.existsSync(exe)) return;
  fs.mkdirSync(destDir, { recursive: true });
  const zip = path.join(destDir, "build.zip");
  await download(url, zip);
  // bsdtar del sistema por ruta absoluta (no el GNU tar de Git Bash, que
  // interpreta "C:\..." como host:ruta)
  const systemTar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  await execa(fs.existsSync(systemTar) ? systemTar : "tar", ["-xf", zip, "-C", destDir]);
  fs.rmSync(zip, { force: true });
  if (!fs.existsSync(exe)) {
    // el zip anida el exe en Release/ con sus DLLs: se copian todas juntas
    const found = findExe(destDir);
    if (!found) throw new Error("No se encontró el ejecutable de whisper en el zip");
    const srcDir = path.dirname(found);
    if (srcDir !== destDir) {
      for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        if (entry.isFile()) fs.copyFileSync(path.join(srcDir, entry.name), path.join(destDir, entry.name));
      }
    }
    if (!fs.existsSync(exe)) fs.copyFileSync(path.join(destDir, path.basename(found)), exe);
  }
}

/** Compila la caché PTX-JIT de CUDA una vez (Blackwell no tiene kernels nativos
 *  en CUDA 12.4): absorbe los ~70s de la primera vez aquí, no en la 1ª transcripción. */
async function warmCudaJit(model: WhisperModelId): Promise<void> {
  if (fs.existsSync(WARM_SENTINEL)) return;
  status = { ready: false, step: "warming" };
  const wav = path.join(WHISPER_DIR, "warm.wav");
  try {
    await execa(ffmpegBin, ["-y", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "0.5", wav]);
    // -nfa para calentar los mismos kernels que usa la transcripción real
    // (DTW exige desactivar flash attention)
    await execa(
      whisperExeFor(true),
      ["-m", whisperModelPath(model), "-f", wav, "-t", String(whisperThreads), "-nfa", "-dtw", model],
      { reject: false },
    );
    fs.writeFileSync(WARM_SENTINEL, new Date().toISOString());
  } finally {
    fs.rmSync(wav, { force: true });
  }
}

/** Asegura el build adecuado (GPU/CPU) y el modelo pedido. Idempotente. */
export async function ensureWhisper(model: WhisperModelId = "small"): Promise<void> {
  try {
    const useGpu = await hasNvidiaGpu();
    const modelFile = whisperModelPath(model);
    const vadFile = vadModelPath();
    if (
      fs.existsSync(whisperExeFor(useGpu)) &&
      fs.existsSync(modelFile) &&
      fs.existsSync(vadFile) &&
      (!useGpu || fs.existsSync(WARM_SENTINEL))
    ) {
      status = { ready: true, gpu: useGpu };
      return;
    }
    fs.mkdirSync(WHISPER_DIR, { recursive: true });
    status = { ready: false, step: "downloading" };
    await ensureBuild(useGpu ? CUDA_ZIP_URL : CPU_ZIP_URL, useGpu ? CUDA_DIR : CPU_DIR);
    if (!fs.existsSync(modelFile)) await download(MODEL_URL(model), modelFile);
    if (!fs.existsSync(vadFile)) await download(VAD_MODEL_URL, vadFile);
    if (useGpu) await warmCudaJit(model);
    status = { ready: true, gpu: useGpu };
  } catch (err) {
    status = { ready: false, step: "error", message: err instanceof Error ? err.message : "Error" };
    throw err;
  }
}

function findExe(dir: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findExe(full);
      if (nested) return nested;
    } else if (/^(whisper-cli|main)\.exe$/i.test(entry.name)) {
      return full;
    }
  }
  return null;
}
