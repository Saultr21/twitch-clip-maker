import { useEffect, useMemo, useRef } from "react";
import Konva from "konva";
import { Rect as KonvaRect, Text as KonvaText, Transformer } from "react-konva";
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
 *  (como hace libass al quemar); resalta la palabra bajo el playhead.
 *  La cue activa es arrastrable (mueve style.y) y escalable (cambia style.fontSize). */
export function SubtitlesLayer({ width, height }: SubtitlesLayerProps) {
  const playhead = useUiStore((s) => s.playhead);
  const cues = useProjectStore((s) => s.project.subtitles.cues);
  const style = useProjectStore((s) => s.project.subtitles.style);
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const setSubtitleStyle = useProjectStore((s) => s.setSubtitleStyle);
  const beginTransaction = useProjectStore((s) => s.beginTransaction);

  const hitRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const cue = cues.find((c) => playhead >= cueStart(c) && playhead < cueEnd(c));
  const activeIdx = cue ? activeWordIndex(cue, playhead) : -1;
  const selected = !!cue && selection?.kind === "subtitle" && selection.id === cue.id;

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

  useEffect(() => {
    if (selected && hitRef.current && trRef.current) {
      trRef.current.nodes([hitRef.current]);
    }
  }, [selected, cue?.id]);

  if (!cue || lines.length === 0) return null;

  const lineHeight = fontSize * 1.25;
  const blockHeight = lines.length * lineHeight;
  // el bloque de líneas se centra verticalmente sobre style.y
  const top = style.y * height - blockHeight / 2;
  const strokeWidth = style.strokeWidth * height;

  // pop: la palabra activa salta a +30% al entrar y vuelve a 1 en ~180ms
  const activeStart = activeIdx >= 0 && cue ? cue.words[activeIdx].start : null;
  const popScale =
    style.animate && activeStart !== null
      ? 1 + 0.3 * Math.max(0, 1 - ((playhead - activeStart) * 1000) / 180)
      : 1;

  const blockWidth = Math.max(...lines.map((l) => l.width));
  const pad = fontSize * 0.35;

  // Geometría del rect de hit: coincide con el boxBackground
  const hitX = width / 2 - blockWidth / 2 - pad;
  const hitY = top - pad * 0.6;
  const hitW = blockWidth + pad * 2;
  const hitH = blockHeight + pad * 1.2;

  return (
    <>
      {style.boxBackground && (
        <KonvaRect
          x={hitX}
          y={hitY}
          width={hitW}
          height={hitH}
          fill="rgba(0,0,0,0.7)"
          cornerRadius={6}
          listening={false}
        />
      )}
      {lines.map((line, li) => {
        let x = width / 2 - line.width / 2;
        const y = top + li * lineHeight + (lineHeight - fontSize) / 2;
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
              strokeWidth={strokeWidth}
              fillAfterStrokeEnabled
              listening={false}
            />
          );
          x += it.width + space;
          return node;
        });
      })}
      {/* Rect transparente: hit area de clic, arrastre y transform */}
      <KonvaRect
        ref={hitRef}
        x={hitX}
        y={hitY}
        width={hitW}
        height={hitH}
        fill={selected ? "rgba(255,255,255,0.04)" : "transparent"}
        stroke={selected ? "#9146ff" : "transparent"}
        strokeWidth={1}
        draggable={selected}
        dragBoundFunc={(pos) => ({
          x: hitX, // solo movimiento vertical
          y: Math.max(-pad * 0.6, Math.min(height - hitH + pad * 0.6, pos.y)),
        })}
        onMouseDown={() => select({ kind: "subtitle", id: cue.id })}
        onTap={() => select({ kind: "subtitle", id: cue.id })}
        onDragStart={() => beginTransaction()}
        onDragMove={(e) => {
          // centro del bloque en coordenadas normalizadas
          const newY = (e.target.y() + hitH / 2) / height;
          setSubtitleStyle({ y: Math.min(1, Math.max(0, newY)) });
        }}
        onTransformStart={() => beginTransaction()}
        onTransformEnd={(e) => {
          const node = e.target;
          const newFontSize = Math.min(0.3, Math.max(0.005, style.fontSize * node.scaleY()));
          setSubtitleStyle({ fontSize: newFontSize });
          node.scaleX(1);
          node.scaleY(1);
        }}
      />
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

// medida con un canvas offscreen reutilizado
let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, fontSize: number, fontFamily: string): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * fontSize * 0.5;
  measureCtx.font = `bold ${fontSize}px ${fontFamily}`;
  return measureCtx.measureText(text).width;
}
