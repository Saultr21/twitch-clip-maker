import crypto from "node:crypto";
import path from "node:path";
import { execa } from "execa";
import type { ClipInfo } from "@clipforge/shared";
import { CLIPS_DIR } from "../lib/paths.js";
import { ffmpegBin, ytDlpPath } from "./binaries.js";
import { addClip } from "./clipsRegistry.js";
import { parseYtDlpProgress } from "./progress.js";
import { probeVideo } from "./probe.js";

export async function downloadClip(
  url: string,
  onProgress: (percent: number) => void,
): Promise<ClipInfo> {
  const id = crypto.randomUUID();
  const fileName = `${id}.mp4`;
  const outPath = path.join(CLIPS_DIR, fileName);

  const { stdout: title } = await execa(ytDlpPath, [
    "--print", "title",
    "--skip-download",
    url,
  ]);

  const proc = execa(ytDlpPath, [
    url,
    "-o", outPath,
    "--newline",
    "--no-playlist",
    "--ffmpeg-location", ffmpegBin,
    "-f", "best",
    "--remux-video", "mp4",
  ]);

  proc.stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      const percent = parseYtDlpProgress(line);
      if (percent !== null) onProgress(percent);
    }
  });

  await proc;

  const meta = await probeVideo(outPath);
  const clip: ClipInfo = {
    id,
    url,
    title: title.trim(),
    fileName,
    ...meta,
    createdAt: new Date().toISOString(),
  };
  addClip(clip);
  return clip;
}
