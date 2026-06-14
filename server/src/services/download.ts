import crypto from "node:crypto";
import fs from "node:fs";
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

  try {
    // En Windows yt-dlp emite stdout en cp1252 salvo que se fuerce UTF-8
    const { stdout: title } = await execa(ytDlpPath, [
      "--encoding", "utf-8",
      "--print", "title",
      "--skip-download",
      url,
    ]);

    const proc = execa(ytDlpPath, [
      url,
      "-o", outPath,
      "--encoding", "utf-8",
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
  } catch (err) {
    fs.rmSync(outPath, { force: true });
    fs.rmSync(`${outPath}.part`, { force: true });
    throw friendlyDownloadError(err);
  }
}

/** Si Windows bloqueó el binario (p. ej. Control de aplicaciones inteligente),
 *  execa falla al hacer spawn con un error críptico ("spawn UNKNOWN/EACCES").
 *  Lo traducimos a algo accionable para el usuario. */
function friendlyDownloadError(err: unknown): Error {
  const e = err as { code?: string; message?: string };
  const blocked =
    e.code === "UNKNOWN" ||
    e.code === "EACCES" ||
    /spawn .*(UNKNOWN|EACCES)/i.test(e.message ?? "") ||
    /control de aplicaciones|application control|blocked/i.test(e.message ?? "");
  if (blocked) {
    return new Error(
      "Windows bloqueó yt-dlp (Control de aplicaciones inteligente). Para descargar " +
        "clips de Twitch, desactívalo en Seguridad de Windows, o sube el vídeo a mano " +
        "con «Subir vídeo del escritorio».",
    );
  }
  return err instanceof Error ? err : new Error("Error desconocido durante la descarga");
}
