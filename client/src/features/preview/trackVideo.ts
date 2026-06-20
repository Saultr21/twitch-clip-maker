import type { CropRect } from "@clipforge/shared";

export interface VisibleRect {
  fullW: number; fullH: number; // frame completo
  w: number; h: number;         // visible (frame × crop)
  left: number; top: number;    // posición del rect visible en el lienzo
  cropX: number; cropY: number; // origen del recorte (fracción)
}

/** Geometría del rect VISIBLE de un clip en el lienzo (misma fórmula que el export). */
export function visibleRect(
  canvasW: number,
  canvasH: number,
  info: { width: number; height: number },
  zoom: { x: number; y: number; scale: number },
  crop: CropRect,
): VisibleRect {
  const base = Math.min(canvasW / info.width, canvasH / info.height);
  const fullW = info.width * base * zoom.scale;
  const fullH = info.height * base * zoom.scale;
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const w = fullW * c.w;
  const h = fullH * c.h;
  return {
    fullW, fullH, w, h,
    left: zoom.x * (canvasW - w),
    top: zoom.y * (canvasH - h),
    cropX: c.x, cropY: c.y,
  };
}
