import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { CLIPS_DIR } from "../lib/paths.js";
import { ffmpegBin } from "./binaries.js";
import { hasNvidiaGpu } from "./gpu.js";
import { isNvencFailure } from "./exportJobs.js";
import { probeCodecs } from "./probe.js";

// Códecs que el <video> del navegador reproduce dentro de su contenedor habitual
const WEB_VIDEO_CODECS = new Set(["h264", "vp8", "vp9", "av1"]);

/** True si el vídeo NO es reproducible tal cual en el navegador y hay que pasarlo
 *  a mp4 H.264. Solo se conserva mp4/h264 y webm/(vp8|vp9|av1); el resto (mov,
 *  mkv, avi, HEVC, etc.) se transcodifica. Pura para poder testearla. */
export function needsTranscode(ext: string, videoCodec: string | null): boolean {
  const e = ext.toLowerCase();
  if (e === "mp4" && videoCodec === "h264") return false;
  if (e === "webm" && videoCodec !== null && WEB_VIDEO_CODECS.has(videoCodec)) return false;
  return true;
}

/** Transcodifica a mp4 H.264 + AAC; usa NVENC si hay GPU, con fallback a libx264. */
async function transcodeToMp4(input: string, output: string): Promise<void> {
  const useGpu = await hasNvidiaGpu();
  const cpu = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"];
  const gpu = ["-c:v", "h264_nvenc", "-preset", "p5"];
  const common = ["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"];
  const run = (vargs: string[]) =>
    execa(ffmpegBin, ["-y", "-i", input, ...vargs, ...common, output], { reject: false });

  let res = await run(useGpu ? gpu : cpu);
  if (res.exitCode !== 0 && useGpu && isNvencFailure(res.stderr ?? "")) {
    res = await run(cpu); // NVENC no disponible: reintento en CPU
  }
  if (res.exitCode !== 0) throw new Error("No se pudo transcodificar el vídeo");
}

/** Deja el vídeo subido listo para la preview: lo conserva si ya es web-friendly
 *  o lo transcodifica a mp4. Devuelve el fileName final (en CLIPS_DIR) y limpia
 *  el temporal. */
export async function ingestUploadedVideo(tempPath: string, id: string, ext: string): Promise<string> {
  const { video } = await probeCodecs(tempPath);
  if (!needsTranscode(ext, video)) {
    const fileName = `${id}.${ext.toLowerCase()}`;
    fs.renameSync(tempPath, path.join(CLIPS_DIR, fileName));
    return fileName;
  }
  const fileName = `${id}.mp4`;
  try {
    await transcodeToMp4(tempPath, path.join(CLIPS_DIR, fileName));
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
  return fileName;
}
