export interface RenderRect {
  w: number;
  h: number;
  left: number;
  top: number;
}

function toEven(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r - 1;
}

/**
 * Rectángulo del clip dentro del lienzo — misma fórmula que la preview:
 * base contain, tamaño = src·base·scale, esquina = zoom·(lienzo − tamaño).
 * Ancho/alto se redondean a PAR (yuv420p exige dimensiones pares).
 */
export function renderRect(
  canvasW: number,
  canvasH: number,
  srcW: number,
  srcH: number,
  zoom: { x: number; y: number; scale: number },
): RenderRect {
  const base = Math.min(canvasW / srcW, canvasH / srcH);
  const w = toEven(srcW * base * zoom.scale);
  const h = toEven(srcH * base * zoom.scale);
  return {
    w,
    h,
    left: Math.round(zoom.x * (canvasW - w)) + 0,
    top: Math.round(zoom.y * (canvasH - h)) + 0,
  };
}
