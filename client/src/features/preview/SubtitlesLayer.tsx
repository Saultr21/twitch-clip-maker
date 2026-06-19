import { useEffect, useMemo, useRef } from "react";
import Konva from "konva";
import { Group, Rect as KonvaRect, Text as KonvaText, Transformer } from "react-konva";
import { activeWordIndex, cueEnd, cueStart } from "../../lib/subtitles";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

interface SubtitlesLayerProps {
  width: number;
  height: number;
}

interface PlacedWord {
  text: string;
  idx: number;
  width: number;
}
interface Line {
  items: PlacedWord[];
  width: number;
}

export function SubtitlesLayer({ width, height }: SubtitlesLayerProps) {
  const playhead = useUiStore((s) => s.playhead);
  const cues = useProjectStore((s) => s.project.subtitles.cues);
  const style = useProjectStore((s) => s.project.subtitles.style);
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const setSubtitleStyle = useProjectStore((s) => s.setSubtitleStyle);
  const beginTransaction = useProjectStore((s) => s.beginTransaction);

  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const cue = cues.find((c) => playhead >= cueStart(c) && playhead < cueEnd(c));
  const activeIdx = cue ? activeWordIndex(cue, playhead) : -1;
  const selected = !!cue && selection?.kind === "subtitle" && selection.id === cue.id;

  const fontSize = style.fontSize * height;
  const space = fontSize * 0.3;

  const lines = useMemo<Line[]>(() => {
    if (!cue || width < 1) return [];
    const maxWidth = width * 0.92;
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

  useEffect(() => {
    if (selected && groupRef.current && trRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected, cue?.id]);

  if (!cue || lines.length === 0) return null;

  const lineHeight = fontSize * 1.25;
  const blockHeight = lines.length * lineHeight;
  const blockWidth = Math.max(...lines.map((l) => l.width));
  const pad = fontSize * 0.35;
  const strokeWidthPx = style.strokeWidth * height;

  // El Group se centra en (style.x * width, style.y * height)
  // Todo el contenido interior usa coordenadas relativas al centro del grupo
  const cx = style.x * width;
  const cy = style.y * height;

  // pop de la palabra activa
  const activeStart = activeIdx >= 0 ? cue.words[activeIdx].start : null;
  const popScale =
    style.animate && activeStart !== null
      ? 1 + 0.3 * Math.max(0, 1 - ((playhead - activeStart) * 1000) / 180)
      : 1;

  return (
    <>
      <Group
        ref={groupRef}
        x={cx}
        y={cy}
        draggable={selected}
        onMouseDown={() => select({ kind: "subtitle", id: cue.id })}
        onTap={() => select({ kind: "subtitle", id: cue.id })}
        onDragStart={() => beginTransaction()}
        onDragMove={(e) => {
          setSubtitleStyle({
            x: Math.min(1, Math.max(0, e.target.x() / width)),
            y: Math.min(1, Math.max(0, e.target.y() / height)),
          });
        }}
        onTransformStart={() => beginTransaction()}
        onTransformEnd={(e) => {
          const node = e.target;
          const newFontSize = Math.min(0.3, Math.max(0.005, style.fontSize * node.scaleY()));
          setSubtitleStyle({ fontSize: newFontSize });
          node.scaleX(1);
          node.scaleY(1);
        }}
      >
        {/* caja de fondo — coordenadas relativas al centro del grupo */}
        {style.boxBackground && (
          <KonvaRect
            x={-blockWidth / 2 - pad}
            y={-blockHeight / 2 - pad * 0.6}
            width={blockWidth + pad * 2}
            height={blockHeight + pad * 1.2}
            fill="rgba(0,0,0,0.7)"
            cornerRadius={6}
            listening={false}
          />
        )}
        {/* rect invisible de hit — necesario para que el Transformer tenga bounds correctos */}
        <KonvaRect
          x={-blockWidth / 2 - pad}
          y={-blockHeight / 2 - pad * 0.6}
          width={blockWidth + pad * 2}
          height={blockHeight + pad * 1.2}
          fill="transparent"
          listening={false}
        />
        {lines.map((line, li) => {
          let x = -line.width / 2;
          const y = -blockHeight / 2 + li * lineHeight + (lineHeight - fontSize) / 2;
          return line.items.map((it) => {
            const active = it.idx === activeIdx;
            const popping = active && popScale !== 1;
            const node = (
              <KonvaText
                key={it.idx}
                text={it.text}
                x={popping ? x + it.width / 2 : x}
                y={popping ? y + fontSize / 2 : y}
                offsetX={popping ? it.width / 2 : 0}
                offsetY={popping ? fontSize / 2 : 0}
                scaleX={popping ? popScale : 1}
                scaleY={popping ? popScale : 1}
                fontSize={fontSize}
                fontFamily={style.fontFamily}
                fontStyle="bold"
                fill={active && style.wordHighlight ? style.highlight : style.fill}
                stroke={style.stroke || undefined}
                strokeWidth={strokeWidthPx}
                fillAfterStrokeEnabled
                listening={false}
              />
            );
            x += it.width + space;
            return node;
          });
        })}
      </Group>
      {selected && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          flipEnabled={false}
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
        />
      )}
    </>
  );
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, fontSize: number, fontFamily: string): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * fontSize * 0.5;
  measureCtx.font = `bold ${fontSize}px ${fontFamily}`;
  return measureCtx.measureText(text).width;
}
