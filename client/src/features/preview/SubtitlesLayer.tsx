import { useMemo } from "react";
import { Text as KonvaText } from "react-konva";
import { activeWordIndex, cueEnd, cueStart } from "../../lib/subtitles";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

interface SubtitlesLayerProps {
  width: number;
  height: number;
}

interface PlacedWord {
  text: string;
  idx: number; // índice global en la cue (para el resaltado)
  width: number;
}
interface Line {
  items: PlacedWord[];
  width: number;
}

/** Pinta la cue activa centrada y partida en líneas que caben en el lienzo
 *  (como hace libass al quemar); resalta la palabra bajo el playhead. */
export function SubtitlesLayer({ width, height }: SubtitlesLayerProps) {
  const playhead = useUiStore((s) => s.playhead);
  const cues = useProjectStore((s) => s.project.subtitles.cues);
  const style = useProjectStore((s) => s.project.subtitles.style);

  const cue = cues.find((c) => playhead >= cueStart(c) && playhead < cueEnd(c));
  const activeIdx = cue ? activeWordIndex(cue, playhead) : -1;

  const fontSize = style.fontSize * height;
  const space = fontSize * 0.3;

  // El reparto en líneas solo depende del texto/tamaño/ancho, no del playhead:
  // memoizarlo evita recalcular el layout en cada fotograma de reproducción.
  const lines = useMemo<Line[]>(() => {
    if (!cue || width < 1) return [];
    const maxWidth = width * 0.92; // margen lateral, como el del export
    const out: Line[] = [];
    let cur: PlacedWord[] = [];
    let curWidth = 0;
    cue.words.forEach((w, idx) => {
      const text = style.uppercase ? w.text.toUpperCase() : w.text;
      const wordWidth = measureText(text, fontSize, style.fontFamily);
      const added = (cur.length > 0 ? space : 0) + wordWidth;
      if (cur.length > 0 && curWidth + added > maxWidth) {
        out.push({ items: cur, width: curWidth });
        cur = [];
        curWidth = 0;
      }
      cur.push({ text, idx, width: wordWidth });
      curWidth += cur.length > 1 ? space + wordWidth : wordWidth;
    });
    if (cur.length > 0) out.push({ items: cur, width: curWidth });
    return out;
  }, [cue, width, fontSize, space, style.fontFamily, style.uppercase]);

  if (!cue || lines.length === 0) return null;

  const lineHeight = fontSize * 1.25;
  const blockHeight = lines.length * lineHeight;
  // el bloque de líneas se centra verticalmente sobre style.y
  const top = style.y * height - blockHeight / 2;
  const strokeWidth = style.strokeWidth * height;

  return (
    <>
      {lines.map((line, li) => {
        let x = width / 2 - line.width / 2;
        const y = top + li * lineHeight + (lineHeight - fontSize) / 2;
        return line.items.map((it) => {
          const node = (
            <KonvaText
              key={it.idx}
              text={it.text}
              x={x}
              y={y}
              fontSize={fontSize}
              fontFamily={style.fontFamily}
              fontStyle="bold"
              fill={it.idx === activeIdx ? style.highlight : style.fill}
              stroke={style.stroke || undefined}
              strokeWidth={strokeWidth}
              fillAfterStrokeEnabled
              listening={false}
            />
          );
          x += it.width + space;
          return node;
        });
      })}
    </>
  );
}

// medida con un canvas offscreen reutilizado
let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, fontSize: number, fontFamily: string): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * fontSize * 0.5;
  measureCtx.font = `bold ${fontSize}px ${fontFamily}`;
  return measureCtx.measureText(text).width;
}
