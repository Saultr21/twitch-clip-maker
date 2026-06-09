import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { execa } from "execa";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import type { SetupStatus } from "@clipforge/shared";
import { BIN_DIR } from "../lib/paths.js";

const YTDLP_URL =
  "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe";

export const ytDlpPath = path.join(BIN_DIR, "yt-dlp.exe");
export const ffmpegBin = ffmpegStatic as unknown as string;
export const ffprobeBin = ffprobeStatic.path;

let status: SetupStatus = { ready: false, step: "checking" };

export function getSetupStatus(): SetupStatus {
  return status;
}

export async function ensureBinaries(): Promise<void> {
  try {
    if (!fs.existsSync(ytDlpPath)) {
      status = { ready: false, step: "downloading-ytdlp" };
      const res = await fetch(YTDLP_URL, { redirect: "follow" });
      if (!res.ok || !res.body) {
        throw new Error(`Descarga de yt-dlp fallida: HTTP ${res.status}`);
      }
      const tmpPath = `${ytDlpPath}.tmp`;
      try {
        await pipeline(
          Readable.fromWeb(res.body as WebReadableStream),
          fs.createWriteStream(tmpPath),
        );
        fs.renameSync(tmpPath, ytDlpPath);
      } catch (err) {
        fs.rmSync(tmpPath, { force: true });
        throw err;
      }
    } else {
      // Twitch rompe el extractor periódicamente; nightly lleva el fix antes
      await execa(ytDlpPath, ["--update-to", "nightly"]).catch(() => {});
    }
    status = { ready: true, step: "ready" };
  } catch (err) {
    status = {
      ready: false,
      step: "error",
      message: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
