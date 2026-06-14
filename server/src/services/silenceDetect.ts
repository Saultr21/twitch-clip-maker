import path from "node:path";
import { execa } from "execa";
import { CLIPS_DIR } from "../lib/paths.js";
import { ffmpegBin } from "./binaries.js";

export interface SilenceRange {
  start: number;
  end: number;
}

/** Parsea el log de `silencedetect` (stderr de ffmpeg) en rangos [start, end]
 *  en segundos. Pura para poder testearla sin ffmpeg. */
export function parseSilenceLog(log: string): SilenceRange[] {
  const ranges: SilenceRange[] = [];
  let pendingStart: number | null = null;
  for (const line of log.split("\n")) {
    const s = /silence_start:\s*(-?\d+(?:\.\d+)?)/.exec(line);
    if (s) {
      pendingStart = Math.max(0, parseFloat(s[1]));
      continue;
    }
    const e = /silence_end:\s*(-?\d+(?:\.\d+)?)/.exec(line);
    if (e && pendingStart !== null) {
      const end = parseFloat(e[1]);
      if (end > pendingStart) ranges.push({ start: pendingStart, end });
      pendingStart = null;
    }
  }
  return ranges;
}

/** Detecta los tramos de silencio del audio de un clip (tiempo de archivo).
 *  noiseDb: umbral en dB (más cerca de 0 = más permisivo); minSilence: duración
 *  mínima del silencio en segundos para contarlo. */
export async function detectSilences(
  fileName: string,
  noiseDb = -30,
  minSilence = 0.5,
): Promise<SilenceRange[]> {
  const input = path.join(CLIPS_DIR, fileName);
  const { stderr } = await execa(
    ffmpegBin,
    ["-hide_banner", "-i", input, "-af", `silencedetect=noise=${noiseDb}dB:d=${minSilence}`, "-f", "null", "-"],
    { reject: false },
  );
  return parseSilenceLog(typeof stderr === "string" ? stderr : "");
}
