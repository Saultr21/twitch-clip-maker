/**
 * Recorte del bounding box de un Transformer de Konva contra los límites del
 * elemento. CRÍTICO: el `boundBoxFunc` de Konva opera en coordenadas ABSOLUTAS
 * del stage. Cuando el Stage está trasladado (ver STAGE_MARGIN en OverlayLayer),
 * los límites deben expresarse también en absolutas, o el recorte desfasa el
 * rect y "se va a otros lados" al redimensionar.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoxBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Recorta `box` para que no sobresalga de `bounds`, garantizando un tamaño
 * mínimo. Todos los valores deben estar en el mismo espacio de coordenadas.
 */
export function clampTransformBox(box: Box, bounds: BoxBounds, min = 20): Box {
  const x = Math.max(bounds.left, box.x);
  const y = Math.max(bounds.top, box.y);
  const right = Math.min(bounds.right, box.x + box.width);
  const bottom = Math.min(bounds.bottom, box.y + box.height);
  return {
    x,
    y,
    width: Math.max(min, right - x),
    height: Math.max(min, bottom - y),
  };
}

/** Rect normalizado (0..1) relativo al source. */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_CROP = 0.01;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Compone un recorte nuevo, expresado como fracción (0..1) del rect ya recortado
 * (`rel`), con el recorte previo (`prev`, relativo al source) para obtener el
 * recorte absoluto resultante. Recortes acumulativos: recortar dos veces equivale
 * a anidar las regiones. Garantiza un tamaño mínimo y que el rect quede dentro
 * del source.
 */
export function composeCrop(prev: NormRect, rel: NormRect): NormRect {
  const w = clamp(rel.w * prev.w, MIN_CROP, 1);
  const h = clamp(rel.h * prev.h, MIN_CROP, 1);
  return {
    x: clamp(prev.x + rel.x * prev.w, 0, 1 - w),
    y: clamp(prev.y + rel.y * prev.h, 0, 1 - h),
    w,
    h,
  };
}
