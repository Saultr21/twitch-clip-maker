import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Image as KonvaImage, Layer, Rect, Stage, Text as KonvaText, Transformer } from "react-konva";
import type { ImageOverlay, TextOverlay } from "@clipforge/shared";
import { clamp01 } from "../../lib/normalized";
import { videoClipAt } from "../../lib/timeline";
import { useClipsStore } from "../../stores/clipsStore";
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
 * Recuadro que abraza al vídeo del clip activo (misma geometría que el <video>
 * del lienzo): clic lo selecciona, arrastrar lo reposiciona (zoom.x/y) y las
 * esquinas del Transformer cambian el zoom. La posición del nodo deriva del
 * modelo en cada render, así que los gestos son updates transitorias.
 */
function VideoFrameNode({ width, height }: { width: number; height: number }) {
  const ref = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const select = useUiStore((s) => s.select);
  const selection = useUiStore((s) => s.selection);
  const beginTransaction = useProjectStore((s) => s.beginTransaction);
  const updateVideoClip = useProjectStore((s) => s.updateVideoClip);
  const clips = useClipsStore((s) => s.clips);
  // clip activo: depende del playhead y de la pista (referencias estables)
  const videoTrack = useProjectStore((s) => s.project.tracks.video);
  const activeClip = useUiStore((s) => videoClipAt(videoTrack, s.playhead));
  const selected =
    !!activeClip && selection?.kind === "video" && selection.id === activeClip.id;

  useEffect(() => {
    if (selected && ref.current && trRef.current) {
      trRef.current.nodes([ref.current]);
    }
  }, [selected, activeClip?.id]);

  const info = activeClip ? clips.find((c) => c.id === activeClip.clipId) : undefined;
  if (!activeClip || !info) return null;

  // Misma geometría que el <video> de PreviewCanvas (base = contain)
  const baseScale = Math.min(width / info.width, height / info.height);
  const w = info.width * baseScale * activeClip.zoom.scale;
  const h = info.height * baseScale * activeClip.zoom.scale;
  const left = activeClip.zoom.x * (width - w);
  const top = activeClip.zoom.y * (height - h);

  const clipNow = () =>
    useProjectStore.getState().project.tracks.video.find((c) => c.id === activeClip.id);

  return (
    <>
      <Rect
        ref={ref}
        x={left}
        y={top}
        width={w}
        height={h}
        fill="transparent"
        onMouseDown={() => select({ kind: "video", id: activeClip.id })}
        onTap={() => select({ kind: "video", id: activeClip.id })}
        draggable={selected}
        onDragStart={() => beginTransaction()}
        onDragMove={(e) => {
          const node = e.target;
          const clip = clipNow();
          if (!clip) return;
          // left = zoom.x·(lienzo − w) ⇒ zoom.x = x / (lienzo − w), por eje
          const zoom = { ...clip.zoom };
          if (Math.abs(width - w) > 1) zoom.x = clamp01(node.x() / (width - w));
          if (Math.abs(height - h) > 1) zoom.y = clamp01(node.y() / (height - h));
          updateVideoClip(clip.id, { zoom }, { transient: true });
        }}
        onTransformStart={() => beginTransaction()}
        onTransformEnd={(e) => {
          const node = e.target;
          const clip = clipNow();
          if (clip) {
            const factor = Math.max(node.scaleX(), node.scaleY());
            const scale = Math.min(10, Math.max(0.1, clip.zoom.scale * factor));
            const w2 = info.width * baseScale * scale;
            const h2 = info.height * baseScale * scale;
            const zoom = { ...clip.zoom, scale };
            if (Math.abs(width - w2) > 1) zoom.x = clamp01(node.x() / (width - w2));
            if (Math.abs(height - h2) > 1) zoom.y = clamp01(node.y() / (height - h2));
            updateVideoClip(clip.id, { zoom }, { transient: true });
          }
          node.scale({ x: 1, y: 1 });
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
