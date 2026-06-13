import type { SubtitleCue, SubtitleStyle } from "@clipforge/shared";

/** #RRGGBB → &HBBGGRR& (ASS usa BGR). */
export function hexToAssColor(hex: string): string {
  const h = hex.replace(/^#/, "");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `&H${b}${g}${r}&`.toUpperCase();
}

/** segundos → h:mm:ss.cs */
export function toAssTime(s: number): string {
  const cs = Math.round(s * 100);
  const centis = cs % 100;
  const totalSec = Math.floor(cs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  const hr = Math.floor(totalSec / 3600);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${hr}:${p2(min)}:${p2(sec)}.${p2(centis)}`;
}

function escapeAssText(t: string): string {
  // en ASS las llaves abren overrides; se neutralizan
  return t.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")");
}

/** Genera un fichero .ass completo con karaoke discreto (palabra activa resaltada). */
export function buildAss(
  cues: SubtitleCue[],
  style: SubtitleStyle,
  W: number,
  H: number,
): string {
  const fontSize = Math.round(style.fontSize * H);
  const outline = Math.max(0, Math.round(style.strokeWidth * H));
  const marginV = Math.round((1 - style.y) * H);
  const primary = hexToAssColor(style.fill);
  const outlineColor = hexToAssColor(style.stroke || "#000000");

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Outline, Alignment, MarginL, MarginR, MarginV",
    // Alignment 2 = inferior-centro; Bold -1 = sí
    `Style: Def, ${style.fontFamily}, ${fontSize}, ${primary}, ${outlineColor}, &H00000000&, -1, ${outline}, 2, 40, 40, ${marginV}`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const hl = hexToAssColor(style.highlight);
  const base = primary;

  const events = cues.map((cue) => {
    const start = cue.words[0].start;
    const end = cue.words[cue.words.length - 1].end;
    const text = cue.words
      .map((w) => {
        const relStart = Math.round((w.start - start) * 1000);
        const relEnd = Math.round((w.end - start) * 1000);
        const label = style.uppercase ? w.text.toUpperCase() : w.text;
        // salta a highlight en su ventana y vuelve a base al acabar
        return `{\\t(${relStart},${relStart},\\c${hl})\\t(${relEnd},${relEnd},\\c${base})}${escapeAssText(label)}`;
      })
      .join(" ");
    return `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Def,,0,0,0,,${text}`;
  });

  return [...header, ...events].join("\n");
}
