/**
 * Cadena de filtros atempo para una velocidad dada. atempo admite [0.5, 100];
 * por debajo de 0.5 se encadena en pasos de 0.5.
 */
export function atempoChain(speed: number): string[] {
  if (speed === 1) return [];
  const parts: string[] = [];
  let s = speed;
  while (s < 0.5) {
    parts.push("atempo=0.5");
    s /= 0.5;
  }
  if (Math.abs(s - 1) > 1e-9) {
    parts.push(`atempo=${Math.round(s * 1000) / 1000}`);
  }
  return parts;
}
