import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Image as KonvaImage, Layer, Rect, Stage, Text as KonvaText, Transformer } from "react-konva";
import type { ImageOverlay, TextOverlay } from "@clipforge/shared";
import { clamp01 } from "../../lib/normalized";
import { videoClipAt } from "../../lib/timeline";
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

/**
 * Recuadro invisible que cubre el lienzo y representa el clip de vídeo activo:
 * clic lo selecciona, arrastrar ajusta el encuadre (zoom.x/y) y las esquinas
 * del Transformer ajustan el zoom. El rect nunca se mueve de verdad — cada
 * gesto se traduce al modelo y el nodo se resetea.
 */
function VideoFrameNode({ width, height }: { width: number; height: number }) {
  const ref = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const select = useUiStore((s) => s.select);
  const selection = useUiStore((s) => s.selection);
  const beginTransaction = useProjectStore((s) => s.beginTransaction);
  const updateVideoClip = useProjectStore((s) => s.updateVideoClip);
  // id del clip activo: depende del playhead y de la pista
  const videoTrack = useProjectStore((s) => s.project.tracks.video);
  const activeClipId = useUiStore((s) => videoClipAt(videoTrack, s.playhead)?.id ?? null);
  const selected = !!activeClipId && selection?.kind === "video" && selection.id === activeClipId;

  useEffect(() => {
    if (selected && ref.current && trRef.current) {
      trRef.current.nodes([ref.current]);
    }
  }, [selected]);

  if (!activeClipId) return null;

  const clipNow = () =>
    useProjectStore.getState().project.tracks.video.find((c) => c.id === activeClipId);

  return (
    <>
      <Rect
        ref={ref}
        x={0}
        y={0}
        width={width}
        height={height}
        onMouseDown={() => select({ kind: "video", id: activeClipId })}
        onTap={() => select({ kind: "video", id: activeClipId })}
        draggable={selected}
        onDragStart={() => beginTransaction()}
        onDragMove={(e) => {
          const node = e.target;
          const clip = clipNow();
          if (clip && clip.zoom.scale > 1) {
            // screen(p) = W·(O·(1−s) + p·s) ⇒ ΔO = Δscreen / (W·(1−s))
            const denomX = width * (1 - clip.zoom.scale);
            const denomY = height * (1 - clip.zoom.scale);
            updateVideoClip(
              clip.id,
              {
                zoom: {
                  ...clip.zoom,
                  x: clamp01(clip.zoom.x + node.x() / denomX),
                  y: clamp01(clip.zoom.y + node.y() / denomY),
                },
              },
              { transient: true },
            );
          }
          node.position({ x: 0, y: 0 });
        }}
        onTransformStart={() => beginTransaction()}
        onTransformEnd={(e) => {
          const node = e.target;
          const clip = clipNow();
          if (clip) {
            const factor = Math.max(node.scaleX(), node.scaleY());
            const scale = Math.min(10, Math.max(1, clip.zoom.scale * factor));
            updateVideoClip(clip.id, { zoom: { ...clip.zoom, scale } }, { transient: true });
          }
          node.scale({ x: 1, y: 1 });
          node.position({ x: 0, y: 0 });
        }}
      />
      {selected && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          flipEnabled={false}
          keepRatio
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
        <VideoFrameNode width={width} height={height} />
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
