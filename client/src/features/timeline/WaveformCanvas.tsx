import { useEffect, useRef } from "react";
import { useWaveform, type WaveformKind } from "./useWaveform";

interface WaveformCanvasProps {
  kind: WaveformKind;
  fileName: string;
  /** Ventana de la fuente visible en el bloque (segundos). */
  trimIn: number;
  trimOut: number;
  /** Tamaño del bloque en píxeles. */
  width: number;
  height: number;
  color: string;
  /** Escala la amplitud dibujada según el volumen (0..1). 1 = altura completa. */
  volumeScale?: number;
}

/** Dibuja la envolvente de amplitud del tramo recortado, centrada verticalmente. */
export function WaveformCanvas({ kind, fileName, trimIn, trimOut, width, height, color, volumeScale = 1 }: WaveformCanvasProps) {
  const data = useWaveform(kind, fileName);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.duration <= 0 || width < 1) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    // el canvas 2D no entiende "currentColor": se resuelve al color de texto heredado
    ctx.fillStyle = color === "currentColor" ? getComputedStyle(canvas).color : color;

    const { peaks, duration } = data;
    const i0 = Math.max(0, Math.floor((trimIn / duration) * peaks.length));
    const i1 = Math.min(peaks.length, Math.ceil((trimOut / duration) * peaks.length));
    const span = i1 - i0;
    if (span <= 0) return;

    // El volumen NO cambia el TAMAÑO de la onda, sino su POSICIÓN vertical:
    // más volumen → más arriba, menos → más abajo. La amplitud se mantiene.
    const vol = Math.max(0, Math.min(1, volumeScale));
    const mid = height * (0.72 - 0.44 * vol); // vol 0 → abajo, vol 1 → arriba
    // un pico por columna de píxel: el máximo de los picos que caen en ella
    for (let x = 0; x < width; x++) {
      const s = i0 + Math.floor((x / width) * span);
      const e = i0 + Math.floor(((x + 1) / width) * span);
      let max = 0;
      for (let i = s; i < Math.max(s + 1, e); i++) {
        if (peaks[i] > max) max = peaks[i];
      }
      // Amplitud fija (un poco reducida para dejar margen al desplazamiento).
      const barH = Math.max(1, max * height * 0.7);
      ctx.fillRect(x, mid - barH / 2, 1, barH);
    }
  }, [data, trimIn, trimOut, width, height, color, volumeScale]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none opacity-50"
      style={{ width, height }}
    />
  );
}
