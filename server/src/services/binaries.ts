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

// yt-dlp.exe es solo-Windows a propósito: la app está pensada para Windows
// (ver README). En otra plataforma habría que descargar el binario equivalente.
// Canal ESTABLE (no nightly): el nightly cambia de hash a diario y nunca acumula
// reputación, así que Smart App Control de Windows 11 lo bloquea ("spawn UNKNOWN").
// El estable, muy descargado, pasa la comprobación de reputación de SAC.
const YTDLP_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";

export const ytDlpPath = path.join(BIN_DIR, "yt-dlp.exe");
// ffmpeg-static exporta la ruta del binario, o null si no resolvió en la
// plataforma (sus tipos publicados son incorrectos, de ahí el cast al tipo real)
const ffmpegPath = ffmpegStatic as unknown as string | null;
if (!ffmpegPath) throw new Error("ffmpeg-static no disponible en esta plataforma");
export const ffmpegBin: string = ffmpegPath;
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
      // mantiene el binario al día dentro del canal estable (Twitch rompe el
      // extractor a veces; el estable recibe el fix en días). Se queda en estable
      // a propósito para no reintroducir el nightly que SAC bloquea.
      await execa(ytDlpPath, ["--update-to", "stable"]).catch(() => {});
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
