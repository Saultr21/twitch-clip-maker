import path from "node:path";
import type { QualityPresetId } from "@clipforge/shared";
import type { FilterGraph } from "./filterGraph.js";

/** Intención de calidad, independiente del encoder concreto. */
type Quality =
  | { kind: "bitrate"; bitrate: string } // VBR a bitrate objetivo
  | { kind: "constant"; crf: number }; // calidad constante (crf en x264, cq en nvenc)

interface PresetSettings {
  quality: Quality;
  audioBitrate: string;
}

const PRESETS: Record<QualityPresetId, PresetSettings> = {
  tiktok: { quality: { kind: "bitrate", bitrate: "8M" }, audioBitrate: "192k" },
  youtube: { quality: { kind: "bitrate", bitrate: "12M" }, audioBitrate: "192k" },
  custom: { quality: { kind: "constant", crf: 18 }, audioBitrate: "192k" },
};

/** Args de vídeo para libx264 (CPU). */
function x264VideoArgs(q: Quality): string[] {
  const base = ["-c:v", "libx264", "-preset", "medium"];
  return q.kind === "bitrate"
    ? [...base, "-b:v", q.bitrate]
    : [...base, "-crf", String(q.crf)];
}

/** Args de vídeo para h264_nvenc (GPU). p5 ≈ calidad/velocidad equilibradas;
 *  cq mapea el crf de x264 (+1 aprox. equivale visualmente). */
function nvencVideoArgs(q: Quality): string[] {
  const base = ["-c:v", "h264_nvenc", "-preset", "p5"];
  return q.kind === "bitrate"
    ? [...base, "-b:v", q.bitrate]
    : [...base, "-rc", "vbr", "-cq", String(q.crf + 1), "-b:v", "0"];
}

interface InputDirs {
  videoDir: string;
  imageDir: string;
}

/** Args completos de FFmpeg para el export (array, nunca shell). Con useGpu
 *  usa NVENC; el llamador es responsable del fallback a CPU si NVENC falla. */
export function buildFfmpegArgs(
  graph: FilterGraph,
  preset: QualityPresetId,
  fps: number,
  outPath: string,
  dirs: InputDirs,
  useGpu = false,
): string[] {
  const preset_ = PRESETS[preset];
  const args: string[] = ["-y"];
  for (const input of graph.inputs) {
    const dir = input.kind === "video" ? dirs.videoDir : dirs.imageDir; // imagen y audio viven en assets
    if (input.loop) args.push("-loop", "1"); // imagen de fondo en bucle
    args.push("-i", path.join(dir, input.fileName).replaceAll("\\", "/"));
  }
  args.push(
    "-filter_complex", graph.filterComplex,
    "-map", graph.videoLabel,
    "-map", graph.audioLabel,
    "-r", String(fps),
    ...(useGpu ? nvencVideoArgs(preset_.quality) : x264VideoArgs(preset_.quality)),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", preset_.audioBitrate,
    "-movflags", "+faststart",
    outPath,
  );
  return args;
}
