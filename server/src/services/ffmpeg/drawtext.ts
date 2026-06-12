import type { TextOverlay } from "@clipforge/shared";

// Mapa de FONT_FAMILIES del cliente → TTF de C:\Windows\Fonts
const FONT_FILES: Record<string, string> = {
  "Segoe UI": "segoeui.ttf",
  Arial: "arial.ttf",
  "Arial Black": "ariblk.ttf",
  Impact: "impact.ttf",
  Georgia: "georgia.ttf",
  Verdana: "verdana.ttf",
  Tahoma: "tahoma.ttf",
  "Trebuchet MS": "trebuc.ttf",
  "Times New Roman": "times.ttf",
  "Courier New": "cour.ttf",
  "Comic Sans MS": "comic.ttf",
};

/** Ruta fontfile con el escape de drawtext para Windows (C\:/...). */
export function fontFileFor(family: string): string {
  const file = FONT_FILES[family] ?? FONT_FILES["Segoe UI"];
  return `C\\:/Windows/Fonts/${file}`;
}

/** Escapa el texto del usuario para el parámetro text de drawtext. */
export function escapeDrawtextText(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n");
}

function hex(color: string): string {
  return `0x${color.replace(/^#/, "")}`;
}

function num(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Filtro drawtext completo para un overlay de texto (sin rotación: limitación H3). */
export function drawtextFilter(t: TextOverlay, canvasW: number, canvasH: number): string {
  const parts = [
    `fontfile='${fontFileFor(t.fontFamily)}'`,
    `text='${escapeDrawtextText(t.content)}'`,
    `fontsize=${Math.round(t.fontSize * canvasH)}`,
    `fontcolor=${hex(t.fill)}@${num(t.opacity)}`,
  ];
  const borderw = Math.round(t.strokeWidth * canvasH);
  if (borderw > 0) {
    parts.push(`borderw=${borderw}`, `bordercolor=${hex(t.stroke || "#000000")}@${num(t.opacity)}`);
  }
  if (t.shadow) {
    const offset = Math.max(1, Math.round(t.fontSize * canvasH * 0.03));
    parts.push(`shadowcolor=black@${num(0.8 * t.opacity)}`, `shadowx=${offset}`, `shadowy=${offset}`);
  }
  parts.push(
    `x=${Math.round(t.x * canvasW)}-text_w/2`,
    `y=${Math.round(t.y * canvasH)}-text_h/2`,
    `enable='between(t,${num(t.start)},${num(t.end)})'`,
  );
  return `drawtext=${parts.join(":")}`;
}
