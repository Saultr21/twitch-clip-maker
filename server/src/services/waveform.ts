import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { ASSETS_DIR, CLIPS_DIR, WAVEFORMS_DIR } from "../lib/paths.js";
import { ffmpegBin } from "./binaries.js";

export type WaveformKind = "clip" | "asset";

export interface WaveformData {
  /** Picos de amplitud normalizados [0,1], uno por bucket, cubriendo todo el archivo. */
  peaks: number[];
  /** Duración real del audio en segundos. */
  duration: number;
}

const SAMPLE_RATE = 8000; // suficiente para la envolvente; mantiene el PCM pequeño
const PEAKS_PER_SECOND = 20;
const MIN_PEAKS = 100;
const MAX_PEAKS = 8000;

/** Resuelve la ruta del archivo fuente y valida que no haya path traversal. */
function resolveSource(kind: WaveformKind, fileName: string): string {
  const base = path.basename(fileName); // descarta cualquier separador/..
  if (base !== fileName || base === "" || base === "." || base === "..") {
    throw new Error("Nombre de archivo no válido");
  }
  const dir = kind === "clip" ? CLIPS_DIR : ASSETS_DIR;
  return path.join(dir, base);
}

/** Reduce el PCM s16le mono a `bucketCount` picos (máx. |amplitud| por bucket). */
export function computePeaks(pcm: Buffer, bucketCount: number): number[] {
  const sampleCount = Math.floor(pcm.length / 2);
  if (sampleCount === 0 || bucketCount === 0) return [];
  const peaks = new Array<number>(bucketCount).fill(0);
  const per = sampleCount / bucketCount;
  for (let b = 0; b < bucketCount; b++) {
    const startS = Math.floor(b * per);
    const endS = Math.min(sampleCount, Math.floor((b + 1) * per));
    let max = 0;
    for (let s = startS; s < endS; s++) {
      const v = Math.abs(pcm.readInt16LE(s * 2));
      if (v > max) max = v;
    }
    peaks[b] = max / 32768;
  }
  return peaks;
}

/** Picos de amplitud del audio de un clip/asset. Cacheado en disco por archivo. */
export async function getWaveform(kind: WaveformKind, fileName: string): Promise<WaveformData> {
  const source = resolveSource(kind, fileName);
  if (!fs.existsSync(source)) throw new Error("Archivo no encontrado");

  const cachePath = path.join(WAVEFORMS_DIR, `${kind}-${fileName}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, "utf8")) as WaveformData;
    } catch {
      // caché corrupta: se regenera
    }
  }

  // PCM mono a baja frecuencia por stdout; si no hay pista de audio sale vacío
  const { stdout } = await execa(
    ffmpegBin,
    ["-v", "quiet", "-i", source, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", "-"],
    { encoding: "buffer", reject: false },
  );
  // execa v9 con encoding "buffer" devuelve un Uint8Array, no un Buffer
  const pcm = Buffer.isBuffer(stdout)
    ? stdout
    : stdout instanceof Uint8Array
      ? Buffer.from(stdout)
      : Buffer.alloc(0);
  const duration = pcm.length / 2 / SAMPLE_RATE;
  const bucketCount = Math.min(MAX_PEAKS, Math.max(MIN_PEAKS, Math.round(duration * PEAKS_PER_SECOND)));
  const data: WaveformData = { peaks: computePeaks(pcm, bucketCount), duration };

  fs.writeFileSync(cachePath, JSON.stringify(data));
  return data;
}
