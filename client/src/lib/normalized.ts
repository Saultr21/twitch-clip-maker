export function toPx(norm: number, dimension: number): number {
  return norm * dimension;
}

export function toNorm(px: number, dimension: number): number {
  return dimension === 0 ? 0 : px / dimension;
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
