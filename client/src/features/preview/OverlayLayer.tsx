import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Image as KonvaImage, Layer, Stage, Text as KonvaText, Transformer } from "react-konva";
import type { ImageOverlay, TextOverlay } from "@clipforge/shared";
import { clamp01 } from "../../lib/normalized";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

interface OverlayLayerProps {
  width: number;  // px del lienzo en pantalla
  height: number;
}

function useHtmlImage(src: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const image = new window.Image();
    image.src = src;
    image.onload = () => setImg(image);
    return () => {
      image.onload = null; // un onload tardío no debe pisar la imagen del src nuevo
      setImg(null);
    };
  }, [src]);
  return img;
}

function ImageNode({ overlay, width, height, selected }: {
  overlay: ImageOverlay; width: number; height: number; selected: boolean;
}) {
  const img = useHtmlImage(`/assets/${overlay.fileName}`);
  const ref = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const updateImage = useProjectStore((s) => s.updateImage);
  const beginTransaction = useProjectStore((s) => s.beginTransaction);
  const select = useUiStore((s) => s.select);

  useEffect(() => {
    if (selected && ref.current && trRef.current) {
      trRef.current.nodes([ref.current]);
    }
  }, [selected, img]);

  if (!img) return null;
  const w = overlay.width * width;
  const h = overlay.height * height;

  return (
    <>
      <KonvaImage
        ref={ref}
        image={img}
        x={overlay.x * width}
        y={overlay.y * height}
        width={w}
        height={h}
        offsetX={w / 2}
        offsetY={h / 2}
        rotation={overlay.rotation}
        opacity={overlay.opacity}
        draggable
        onMouseDown={() => select({ kind: "image", id: overlay.id })}
        onTap={() => select({ kind: "image", id: overlay.id })}
        onDragStart={() => beginTransaction()}
        onDragMove={(e) =>
          updateImage(
            overlay.id,
            { x: clamp01(e.target.x() / width), y: clamp01(e.target.y() / height) },
            { transient: true },
          )
        }
        onTransformStart={() => beginTransaction()}
        onTransformEnd={(e) => {
          const node = e.target;
          updateImage(
            overlay.id,
            {
              x: clamp01(node.x() / width),
              y: clamp01(node.y() / height),
              width: clamp01((w * node.scaleX()) / width),
              height: clamp01((h * node.scaleY()) / height),
              rotation: node.rotation(),
            },
            { transient: true },
          );
          node.scaleX(1);
          node.scaleY(1);
        }}
      />
      {selected && <Transformer ref={trRef} rotateEnabled flipEnabled={false} />}
    </>
  );
}

function TextNode({ overlay, width, height, selected }: {
  overlay: TextOverlay; width: number; height: number; selected: boolean;
}) {
  const ref = useRef<Konva.Text>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const updateText = useProjectStore((s) => s.updateText);
  const beginTransaction = useProjectStore((s) => s.beginTransaction);
  const select = useUiStore((s) => s.select);

  useEffect(() => {
    if (selected && ref.current && trRef.current) {
      trRef.current.nodes([ref.current]);
    }
  }, [selected, overlay.content, overlay.fontSize]);

  // Centro como origen: Konva.Text no conoce su tamaño hasta renderizar,
  // así que el offset se recalcula tras cada render (barato, solo lectura+set)
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.offsetX(node.width() / 2);
    node.offsetY(node.height() / 2);
    node.getLayer()?.batchDraw();
  });

  const fontSize = overlay.fontSize * height;

  return (
    <>
      <KonvaText
        ref={ref}
        text={overlay.content}
        fontFamily={overlay.fontFamily}
        fontSize={fontSize}
        fill={overlay.fill}
        stroke={overlay.stroke || undefined}
        strokeWidth={overlay.strokeWidth * height}
        shadowColor="black"
        shadowBlur={overlay.shadow ? fontSize * 0.15 : 0}
        shadowOpacity={overlay.shadow ? 0.8 : 0}
        x={overlay.x * width}
        y={overlay.y * height}
        rotation={overlay.rotation}
        opacity={overlay.opacity}
        draggable
        onMouseDown={() => select({ kind: "text", id: overlay.id })}
        onTap={() => select({ kind: "text", id: overlay.id })}
        onDragStart={() => beginTransaction()}
        onDragMove={(e) =>
          updateText(
            overlay.id,
            { x: clamp01(e.target.x() / width), y: clamp01(e.target.y() / height) },
            { transient: true },
          )
        }
        onTransformStart={() => beginTransaction()}
        onTransformEnd={(e) => {
          const node = e.target;
          updateText(
            overlay.id,
            {
              x: clamp01(node.x() / width),
              y: clamp01(node.y() / height),
              fontSize: Math.min(1, Math.max(0.005, overlay.fontSize * node.scaleY())),
              rotation: node.rotation(),
            },
            { transient: true },
          );
          node.scaleX(1);
          node.scaleY(1);
        }}
      />
      {selected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          flipEnabled={false}
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
        />
      )}
    </>
  );
}

export function OverlayLayer({ width, height }: OverlayLayerProps) {
  const playhead = useUiStore((s) => s.playhead);
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const texts = useProjectStore((s) => s.project.tracks.text);
  const images = useProjectStore((s) => s.project.tracks.image);

  const visibleTexts = texts.filter((t) => playhead >= t.start && playhead < t.end);
  const visibleImages = images.filter((i) => playhead >= i.start && playhead < i.end);

  return (
    <Stage
      width={width}
      height={height}
      className="absolute inset-0"
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) select(null);
      }}
    >
      <Layer>
        {visibleImages.map((o) => (
          <ImageNode
            key={o.id}
            overlay={o}
            width={width}
            height={height}
            selected={selection?.kind === "image" && selection.id === o.id}
          />
        ))}
        {visibleTexts.map((o) => (
          <TextNode
            key={o.id}
            overlay={o}
            width={width}
            height={height}
            selected={selection?.kind === "text" && selection.id === o.id}
          />
        ))}
      </Layer>
    </Stage>
  );
}
