import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Image as KonvaImage, Layer, Line, Rect, Stage, Text as KonvaText, Transformer } from "react-konva";
import { SubtitlesLayer } from "./SubtitlesLayer";
import { CropOverlay } from "./CropOverlay";
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

// Margen del Stage alrededor del lienzo: las asas del Transformer siguen
// siendo agarrables cuando el vídeo u overlay desborda el encuadre
const STAGE_MARGIN = 200;

// Imán de las guías de centrado (px en pantalla)
const GUIDE_SNAP_PX = 6;

type GuidesCallback = (vertical: boolean, horizontal: boolean) => void;

/** Si pos está a menos del imán del centro del eje, engancha al centro. */
function snapToCenter(pos: number, dimension: number): { pos: number; snapped: boolean } {
  return Math.abs(pos - dimension / 2) < GUIDE_SNAP_PX
    ? { pos: dimension / 2, snapped: true }
    : { pos, snapped: false };
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

function ImageNode({ overlay, width, height, selected, onGuides, cropMode }: {
  overlay: ImageOverlay; width: number; height: number; selected: boolean; onGuides: GuidesCallback; cropMode: boolean;
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
        {...(overlay.crop && img ? {
          crop: {
            x: overlay.crop.x * img.naturalWidth,
            y: overlay.crop.y * img.naturalHeight,
            width: overlay.crop.w * img.naturalWidth,
            height: overlay.crop.h * img.naturalHeight,
          }
        } : {})}
        draggable={!cropMode}
        onMouseDown={() => select({ kind: "image", id: overlay.id })}
        onTap={() => select({ kind: "image", id: overlay.id })}
        onDragStart={() => beginTransaction()}
        onDragMove={(e) => {
          const sx = snapToCenter(e.target.x(), width);
          const sy = snapToCenter(e.target.y(), height);
          e.target.position({ x: sx.pos, y: sy.pos });
          onGuides(sx.snapped, sy.snapped);
          updateImage(
            overlay.id,
            { x: clamp01(sx.pos / width), y: clamp01(sy.pos / height) },
            { transient: true },
          );
        }}
        onDragEnd={() => onGuides(false, false)}
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
      {selected && !cropMode && <Transformer ref={trRef} rotateEnabled flipEnabled={false} />}
    </>
  );
}

function TextNode({ overlay, width, height, selected, onGuides }: {
  overlay: TextOverlay; width: number; height: number; selected: boolean; onGuides: GuidesCallback;
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
        onDragMove={(e) => {
          const sx = snapToCenter(e.target.x(), width);
          const sy = snapToCenter(e.target.y(), height);
          e.target.position({ x: sx.pos, y: sy.pos });
          onGuides(sx.snapped, sy.snapped);
          updateText(
            overlay.id,
            { x: clamp01(sx.pos / width), y: clamp01(sy.pos / height) },
            { transient: true },
          );
        }}
        onDragEnd={() => onGuides(false, false)}
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
function VideoFrameNode({ width, height, onGuides, cropMode }: {
  width: number; height: number; onGuides: GuidesCallback; cropMode: boolean;
}) {
  const ref = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const lastWheelRef = useRef(0);
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
        draggable={selected && !cropMode}
        onDragStart={() => beginTransaction()}
        onDragMove={(e) => {
          const node = e.target;
          const clip = clipNow();
          if (!clip) return;
          // left = zoom.x·(lienzo − w) ⇒ zoom.x = x / (lienzo − w), por eje
          const zoom = { ...clip.zoom };
          let vGuide = false;
          let hGuide = false;
          if (Math.abs(width - w) > 1) {
            zoom.x = clamp01(node.x() / (width - w));
            // imán al centro: el centro del vídeo cae sobre el centro del lienzo
            if (Math.abs((zoom.x - 0.5) * (width - w)) < GUIDE_SNAP_PX) {
              zoom.x = 0.5;
              vGuide = true;
            }
          }
          if (Math.abs(height - h) > 1) {
            zoom.y = clamp01(node.y() / (height - h));
            if (Math.abs((zoom.y - 0.5) * (height - h)) < GUIDE_SNAP_PX) {
              zoom.y = 0.5;
              hGuide = true;
            }
          }
          onGuides(vGuide, hGuide);
          updateVideoClip(clip.id, { zoom }, { transient: true });
          // Re-clava el nodo a la posición derivada del modelo: si el clamp o el
          // imán lo detuvieron, el recuadro no debe seguir al puntero
          node.position({ x: zoom.x * (width - w), y: zoom.y * (height - h) });
        }}
        onDragEnd={() => onGuides(false, false)}
        onTransformStart={() => beginTransaction()}
        // En vivo: cada frame del gesto vuelca la escala al modelo y resetea el
        // nodo (patrón Konva de "reset scale on transform") — el vídeo y el
        // recuadro crecen a la vez mientras arrastras la esquina
        onTransform={(e) => {
          const node = e.target;
          const clip = clipNow();
          if (!clip) return;
          const factor = Math.max(node.scaleX(), node.scaleY());
          const scale = Math.min(10, Math.max(0.1, clip.zoom.scale * factor));
          const w2 = info.width * baseScale * scale;
          const h2 = info.height * baseScale * scale;
          const zoom = { ...clip.zoom, scale };
          if (Math.abs(width - w2) > 1) zoom.x = clamp01(node.x() / (width - w2));
          if (Math.abs(height - h2) > 1) zoom.y = clamp01(node.y() / (height - h2));
          updateVideoClip(clip.id, { zoom }, { transient: true });
          node.scale({ x: 1, y: 1 });
          node.position({ x: zoom.x * (width - w2), y: zoom.y * (height - h2) });
        }}
        onTransformEnd={(e) => {
          e.target.scale({ x: 1, y: 1 });
        }}
        // Rueda sobre el vídeo seleccionado: zoom sin depender de las asas
        // (cuando el vídeo desborda el lienzo, las esquinas quedan fuera)
        onWheel={(e) => {
          if (!selected) return;
          e.evt.preventDefault();
          const clip = clipNow();
          if (!clip) return;
          if (Date.now() - lastWheelRef.current > 500) beginTransaction();
          lastWheelRef.current = Date.now();
          const dir = e.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
          const scale = Math.min(10, Math.max(0.1, clip.zoom.scale * dir));
          updateVideoClip(clip.id, { zoom: { ...clip.zoom, scale } }, { transient: true });
        }}
      />
      {selected && !cropMode && (
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
  const cropMode = useUiStore((s) => s.cropMode);
  const texts = useProjectStore((s) => s.project.tracks.text);
  const images = useProjectStore((s) => s.project.tracks.image);
  // Guías de centrado: visibles solo mientras un arrastre engancha al centro
  const [guides, setGuides] = useState({ vertical: false, horizontal: false });
  const onGuides: GuidesCallback = (vertical, horizontal) =>
    setGuides((g) =>
      g.vertical === vertical && g.horizontal === horizontal ? g : { vertical, horizontal },
    );

  const visibleTexts = texts.filter((t) => playhead >= t.start && playhead < t.end);
  const visibleImages = images.filter((i) => playhead >= i.start && playhead < i.end);

  return (
    <Stage
      width={width + STAGE_MARGIN * 2}
      height={height + STAGE_MARGIN * 2}
      // x/y trasladan la escena: los nodos siguen usando coordenadas del lienzo
      x={STAGE_MARGIN}
      y={STAGE_MARGIN}
      className="absolute"
      style={{ left: -STAGE_MARGIN, top: -STAGE_MARGIN }}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) select(null);
      }}
    >
      <Layer>
        <VideoFrameNode width={width} height={height} onGuides={onGuides} cropMode={cropMode} />
        {visibleImages.map((o) => (
          <ImageNode
            key={o.id}
            overlay={o}
            width={width}
            height={height}
            selected={selection?.kind === "image" && selection.id === o.id}
            onGuides={onGuides}
            cropMode={cropMode}
          />
        ))}
        {visibleTexts.map((o) => (
          <TextNode
            key={o.id}
            overlay={o}
            width={width}
            height={height}
            selected={selection?.kind === "text" && selection.id === o.id}
            onGuides={onGuides}
          />
        ))}
        <SubtitlesLayer width={width} height={height} onGuides={onGuides} />
        {cropMode && (selection?.kind === "image" || selection?.kind === "video") && (
          <CropOverlay canvasW={width} canvasH={height} />
        )}
        {guides.vertical && (
          <Line
            points={[width / 2, -STAGE_MARGIN, width / 2, height + STAGE_MARGIN]}
            stroke="#ff4d6a"
            strokeWidth={1}
            listening={false}
          />
        )}
        {guides.horizontal && (
          <Line
            points={[-STAGE_MARGIN, height / 2, width + STAGE_MARGIN, height / 2]}
            stroke="#ff4d6a"
            strokeWidth={1}
            listening={false}
          />
        )}
      </Layer>
    </Stage>
  );
}
