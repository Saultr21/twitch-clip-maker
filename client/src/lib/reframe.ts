// Auto-reframe (simplificado, por segmentos): a partir de la posición de la cara
// muestreada a lo largo del clip, calcula el encuadre (zoom {x,y,scale}) que la
// centra y agrupa el tiempo en segmentos estables. Reutiliza el modelo de zoom
// estático por clip (preview y export ya lo interpretan), sin keyframes.

export interface ReframeSample {
  t: number; // segundos en tiempo de archivo
  x: number; // centro de la cara, normalizado [0,1] en la fuente
  y: number;
}

export interface ReframeSegment {
  start: number;
  end: number;
  zoom: { x: number; y: number; scale: number };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Escala (relativa al "contain") que hace que la fuente CUBRA el lienzo. */
export function coverScale(srcW: number, srcH: number, canvasW: number, canvasH: number): number {
  const contain = Math.min(canvasW / srcW, canvasH / srcH);
  const cover = Math.max(canvasW / srcW, canvasH / srcH);
  return cover / contain;
}

/** Posición de encuadre [0,1] en un eje para centrar la cara; 0.5 si no hay
 *  margen para desplazar (la fuente no desborda el lienzo en ese eje). */
export function panFor(faceCenter: number, scaledLen: number, canvasLen: number): number {
  if (scaledLen <= canvasLen + 0.5) return 0.5;
  return clamp01((canvasLen / 2 - faceCenter * scaledLen) / (canvasLen - scaledLen));
}

/** Encuadre que centra la cara en el lienzo, cubriéndolo. */
export function reframeZoom(
  face: { x: number; y: number },
  srcW: number,
  srcH: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number; scale: number } {
  const contain = Math.min(canvasW / srcW, canvasH / srcH);
  const scale = coverScale(srcW, srcH, canvasW, canvasH);
  const scaledW = srcW * contain * scale;
  const scaledH = srcH * contain * scale;
  return {
    x: panFor(face.x, scaledW, canvasW),
    y: panFor(face.y, scaledH, canvasH),
    // el modelo limita scale a [0.1, 10]; redondeo para un valor estable
    scale: Math.min(10, Math.max(0.1, Math.round(scale * 100) / 100)),
  };
}

/** Agrupa las muestras en segmentos contiguos que cubren [trimIn, trimOut]:
 *  abre un segmento nuevo cuando la cara se desplaza más de `threshold` o se
 *  supera `maxSeg`. Cada segmento lleva el centro medio de la cara. */
export function groupSamples(
  samples: ReframeSample[],
  trimIn: number,
  trimOut: number,
  opts: { threshold?: number; maxSeg?: number; minSeg?: number } = {},
): Array<{ start: number; end: number; x: number; y: number }> {
  const threshold = opts.threshold ?? 0.08;
  const maxSeg = opts.maxSeg ?? 4;
  const minSeg = opts.minSeg ?? 0.6;
  const inRange = samples
    .filter((s) => s.t >= trimIn && s.t < trimOut)
    .sort((a, b) => a.t - b.t);
  if (inRange.length === 0) {
    return [{ start: trimIn, end: trimOut, x: 0.5, y: 0.5 }];
  }

  const segs: Array<{ start: number; end: number; xs: number[]; ys: number[] }> = [];
  for (const s of inRange) {
    const cur = segs[segs.length - 1];
    const avgX = cur ? cur.xs.reduce((a, b) => a + b, 0) / cur.xs.length : 0;
    if (cur && Math.abs(s.x - avgX) < threshold && s.t - cur.start < maxSeg) {
      cur.xs.push(s.x);
      cur.ys.push(s.y);
      cur.end = s.t;
    } else {
      segs.push({ start: cur ? cur.end : trimIn, end: s.t, xs: [s.x], ys: [s.y] });
    }
  }
  segs[0].start = trimIn;
  segs[segs.length - 1].end = trimOut;

  // fusiona segmentos demasiado cortos con el anterior
  const merged: typeof segs = [];
  for (const s of segs) {
    const prev = merged[merged.length - 1];
    if (prev && s.end - s.start < minSeg) {
      prev.end = s.end;
      prev.xs.push(...s.xs);
      prev.ys.push(...s.ys);
    } else {
      merged.push(s);
    }
  }
  return merged.map((s) => ({
    start: s.start,
    end: s.end,
    x: s.xs.reduce((a, b) => a + b, 0) / s.xs.length,
    y: s.ys.reduce((a, b) => a + b, 0) / s.ys.length,
  }));
}

/** Pipeline completo: muestras → segmentos con su encuadre listo para aplicar. */
export function buildReframeSegments(
  samples: ReframeSample[],
  clip: { trimIn: number; trimOut: number },
  src: { width: number; height: number },
  canvas: { width: number; height: number },
  opts?: { threshold?: number; maxSeg?: number; minSeg?: number },
): ReframeSegment[] {
  return groupSamples(samples, clip.trimIn, clip.trimOut, opts).map((g) => ({
    start: g.start,
    end: g.end,
    zoom: reframeZoom({ x: g.x, y: g.y }, src.width, src.height, canvas.width, canvas.height),
  }));
}
