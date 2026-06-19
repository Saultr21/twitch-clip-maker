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
 * Rectángulo VISIBLE del clip dentro del lienzo — misma fórmula que la preview:
 * la escala (`base`·`scale`) se calcula sobre el fotograma COMPLETO (src), y el
 * recorte solo reduce el tamaño visible y mueve el origen del posicionamiento.
 * Así el vídeo recortado conserva su escala y se puede posicionar con `zoom.x/y`
 * por todo el lienzo (el límite usa el tamaño VISIBLE, no el del frame entero).
 * Ancho/alto se redondean a PAR (yuv420p exige dimensiones pares).
 */
export function renderRect(
  canvasW: number,
  canvasH: number,
  srcW: number,
  srcH: number,
  zoom: { x: number; y: number; scale: number },
  crop?: { x: number; y: number; w: number; h: number } | null,
): RenderRect {
  const base = Math.min(canvasW / srcW, canvasH / srcH);
  const cw = crop?.w ?? 1;
  const ch = crop?.h ?? 1;
  const w = toEven(srcW * base * zoom.scale * cw);
  const h = toEven(srcH * base * zoom.scale * ch);
  return {
    w,
    h,
    // "+ 0" normaliza el -0 de Math.round(x·negativo) a +0
    left: Math.round(zoom.x * (canvasW - w)) + 0,
    top: Math.round(zoom.y * (canvasH - h)) + 0,
  };
}
