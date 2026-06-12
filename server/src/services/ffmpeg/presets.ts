import path from "node:path";
import type { QualityPresetId } from "@clipforge/shared";
import type { FilterGraph } from "./filterGraph.js";

interface PresetSettings {
  videoArgs: string[];
  audioBitrate: string;
}

const PRESETS: Record<QualityPresetId, PresetSettings> = {
  tiktok: { videoArgs: ["-b:v", "8M"], audioBitrate: "192k" },
  youtube: { videoArgs: ["-b:v", "12M"], audioBitrate: "192k" },
  custom: { videoArgs: ["-crf", "18"], audioBitrate: "192k" },
};

interface InputDirs {
  videoDir: string;
  imageDir: string;
}

/** Args completos de FFmpeg para el export (array, nunca shell). */
export function buildFfmpegArgs(
  graph: FilterGraph,
  preset: QualityPresetId,
  fps: number,
  outPath: string,
  dirs: InputDirs,
): string[] {
  const preset_ = PRESETS[preset];
  const args: string[] = ["-y"];
  for (const input of graph.inputs) {
    const dir = input.kind === "video" ? dirs.videoDir : dirs.imageDir;
    args.push("-i", path.join(dir, input.fileName).replaceAll("\\", "/"));
  }
  args.push(
    "-filter_complex", graph.filterComplex,
    "-map", graph.videoLabel,
    "-map", graph.audioLabel,
    "-r", String(fps),
    "-c:v", "libx264",
    "-preset", "medium",
    ...preset_.videoArgs,
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", preset_.audioBitrate,
    "-movflags", "+faststart",
    outPath,
  );
  return args;
}
