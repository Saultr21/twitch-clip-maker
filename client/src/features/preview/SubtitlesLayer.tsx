import { Text as KonvaText } from "react-konva";
import { activeWordIndex, cueEnd, cueStart } from "../../lib/subtitles";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

interface SubtitlesLayerProps {
  width: number;
  height: number;
}

/** Pinta la cue activa centrada; resalta la palabra bajo el playhead. Solo lectura. */
export function SubtitlesLayer({ width, height }: SubtitlesLayerProps) {
  const playhead = useUiStore((s) => s.playhead);
  const cues = useProjectStore((s) => s.project.subtitles.cues);
  const style = useProjectStore((s) => s.project.subtitles.style);

  const cue = cues.find((c) => playhead >= cueStart(c) && playhead < cueEnd(c));
  const activeIdx = cue ? activeWordIndex(cue, playhead) : -1;

  if (!cue) return null;

  const fontSize = style.fontSize * height;
  // Konva.Text con segmentos de color por palabra usa un solo color; para el
  // resaltado por palabra pintamos cada palabra como su propio Text en fila.
  // Para simplicidad y robustez de medida, usamos un único Text con la palabra
  // activa marcada vía textos individuales posicionados en una fila centrada.
  const words = cue.words.map((w) => (style.uppercase ? w.text.toUpperCase() : w.text));

  return (
    <WordRow
      words={words}
      activeIdx={activeIdx}
      width={width}
      y={style.y * height}
      fontSize={fontSize}
      fontFamily={style.fontFamily}
      fill={style.fill}
      highlight={style.highlight}
      stroke={style.stroke}
      strokeWidth={style.strokeWidth * height}
    />
  );
}

function WordRow({
  words, activeIdx, width, y, fontSize, fontFamily, fill, highlight, stroke, strokeWidth,
}: {
  words: string[]; activeIdx: number; width: number; y: number; fontSize: number;
  fontFamily: string; fill: string; highlight: string; stroke: string; strokeWidth: number;
}) {
  // medir cada palabra para colocarlas en fila y centrar el conjunto
  const space = fontSize * 0.3;
  const widths = words.map((w) => measureText(w, fontSize, fontFamily));
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let x = width / 2 - total / 2;
  return (
    <>
      {words.map((w, i) => {
        const node = (
          <KonvaText
            key={i}
            text={w}
            x={x}
            y={y - fontSize / 2}
            fontSize={fontSize}
            fontFamily={fontFamily}
            fontStyle="bold"
            fill={i === activeIdx ? highlight : fill}
            stroke={stroke || undefined}
            strokeWidth={strokeWidth}
            fillAfterStrokeEnabled
            listening={false}
          />
        );
        x += widths[i] + space;
        return node;
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
