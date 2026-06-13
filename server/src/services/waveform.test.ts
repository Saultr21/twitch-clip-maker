import { describe, expect, it } from "vitest";
import { computePeaks } from "./waveform.js";

/** Construye un buffer PCM s16le mono a partir de muestras Int16. */
function pcm(samples: number[]): Buffer {
  const buf = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => buf.writeInt16LE(v, i * 2));
  return buf;
}

describe("computePeaks", () => {
  it("toma el máximo absoluto de cada bucket, normalizado a [0,1]", () => {
    // 4 muestras → 2 buckets: [100,-32768] y [50,200]
    const peaks = computePeaks(pcm([100, -32768, 50, 200]), 2);
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toBeCloseTo(1, 5); // |−32768|/32768
    expect(peaks[1]).toBeCloseTo(200 / 32768, 5);
  });

  it("el silencio da picos a cero", () => {
    expect(computePeaks(pcm([0, 0, 0, 0]), 2)).toEqual([0, 0]);
  });

  it("devuelve vacío sin muestras o sin buckets", () => {
    expect(computePeaks(Buffer.alloc(0), 100)).toEqual([]);
    expect(computePeaks(pcm([1, 2, 3]), 0)).toEqual([]);
  });

  it("no se pasa del número de buckets pedido", () => {
    const peaks = computePeaks(pcm(Array.from({ length: 1000 }, (_, i) => i)), 64);
    expect(peaks).toHaveLength(64);
    expect(peaks.every((p) => p >= 0 && p <= 1)).toBe(true);
  });
});
