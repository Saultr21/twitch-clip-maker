import { useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Image as KonvaImage, Layer, Line, Rect, Stage, Text as KonvaText, Transformer } from "react-konva";
import { SubtitlesLayer } from "./SubtitlesLayer";
import { CropOverlay } from "./CropOverlay";
import type { ImageOverlay, MediaElement, TextOverlay, VideoClip } from "@clipforge/shared";
import { clamp01 } from "../../lib/normalized";
import { videoClipAt } from "../../lib/timeline";
import { useClipsStore } from "../../stores/clipsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { visibleRect } from "./trackVideo";

interface OverlayLayerProps {
  width: number;  // px del lienzo en pantalla
  height: number;
}

// Margen del Stage alrededor del lienzo: las asas del Transformer siguen
// siendo agarrables cuando el vídeo u overlay desborda el encuadre
const STAGE_MARGIN = 200;

// Imán de las guías de centrado (px en pantalla)
const GUIDE_SNAP_PX = 6;

// Recorte neutro (frame completo)
const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 } as const;

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
 *
 * Ahora parametrizado por `clip` (cualquier pista) en lugar de leer siempre
 * la pista base.
 */
function VideoFrameNode({ clip, width, height, onGuides, cropMode }: {
  clip: VideoClip; width: number; height: number; onGuides: GuidesCallback; cropMode: boolean;
}) {
  const ref = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const lastWheelRef = useRef(0);
  const select = useUiStore((s) => s.select);
  const selection = useUiStore((s) => s.selection);
  const beginTransaction = useProjectStore((s) => s.beginTransaction);
  const updateVideoClip = useProjectStore((s) => s.updateVideoClip);
  const clips = useClipsStore((s) => s.clips);
  const selected = selection?.kind === "video" && selection.id === clip.id;

  useEffect(() => {
    if (selected && ref.current && trRef.current) {
      trRef.current.nodes([ref.current]);
    }
  }, [selected, clip.id]);

  const info = clips.find((c) => c.id === clip.clipId);
  if (!info) return null;

  // Geometría: usa visibleRect (misma fórmula que PreviewCanvas y el export).
  // El recuadro abraza el rect visible (frame con su recorte).
  const r = visibleRect(width, height, info, clip.zoom, clip.crop ?? FULL_CROP);
  const { w: vW, h: vH, left: vLeft, top: vTop } = r;

  // Lee el clip fresco del store (evita stale closure en gestos)
  const clipNow = (): VideoClip | undefined => {
    const project = useProjectStore.getState().project;
    for (const layer of project.tracks.layers) {
      const found = layer.items.find(
        (it): it is MediaElement & { kind: "video" } => it.kind === "video" && it.id === clip.id,
      );
      if (found) return found as unknown as VideoClip;
    }
    return undefined;
  };

  return (
    <>
      <Rect
        ref={ref}
        x={vLeft}
        y={vTop}
        width={vW}
        height={vH}
        fill="transparent"
        onMouseDown={() => select({ kind: "video", id: clip.id })}
        onTap={() => select({ kind: "video", id: clip.id })}
        draggable={selected && !cropMode}
        onDragStart={() => beginTransaction()}
        onDragMove={(e) => {
          const node = e.target;
          const current = clipNow();
          if (!current) return;
          // node.x() es la esquina del rect visible: zoom.x = x / (lienzo − vW)
          const zoom = { ...current.zoom };
          let vGuide = false;
          let hGuide = false;
          if (Math.abs(width - vW) > 1) {
            zoom.x = clamp01(node.x() / (width - vW));
            // imán: el centro del vídeo visible cae sobre el centro del lienzo
            if (Math.abs((zoom.x - 0.5) * (width - vW)) < GUIDE_SNAP_PX) {
              zoom.x = 0.5;
              vGuide = true;
            }
          }
          if (Math.abs(height - vH) > 1) {
            zoom.y = clamp01(node.y() / (height - vH));
            if (Math.abs((zoom.y - 0.5) * (height - vH)) < GUIDE_SNAP_PX) {
              zoom.y = 0.5;
              hGuide = true;
            }
          }
          onGuides(vGuide, hGuide);
          updateVideoClip(current.id, { zoom }, { transient: true });
          // Re-clava el nodo a la posición visible derivada del modelo
          node.position({ x: zoom.x * (width - vW), y: zoom.y * (height - vH) });
        }}
        onDragEnd={() => onGuides(false, false)}
        onTransformStart={() => beginTransaction()}
        // En vivo: cada frame del gesto vuelca la escala al modelo y resetea el
        // nodo (patrón Konva de "reset scale on transform") — el vídeo y el
        // recuadro crecen a la vez mientras arrastras la esquina
        onTransform={(e) => {
          const node = e.target;
          const current = clipNow();
          if (!current || !info) return;
          const baseScale = Math.min(width / info.width, height / info.height);
          const crop = current.crop ?? FULL_CROP;
          const factor = Math.max(node.scaleX(), node.scaleY());
          const scale = Math.min(10, Math.max(0.1, current.zoom.scale * factor));
          const vW2 = info.width * baseScale * scale * crop.w;
          const vH2 = info.height * baseScale * scale * crop.h;
          const zoom = { ...current.zoom, scale };
          if (Math.abs(width - vW2) > 1) zoom.x = clamp01(node.x() / (width - vW2));
          if (Math.abs(height - vH2) > 1) zoom.y = clamp01(node.y() / (height - vH2));
          updateVideoClip(current.id, { zoom }, { transient: true });
          node.scale({ x: 1, y: 1 });
          node.position({ x: zoom.x * (width - vW2), y: zoom.y * (height - vH2) });
        }}
        onTransformEnd={(e) => {
          e.target.scale({ x: 1, y: 1 });
        }}
        // Rueda sobre el vídeo seleccionado: zoom sin depender de las asas
        // (cuando el vídeo desborda el lienzo, las esquinas quedan fuera)
        onWheel={(e) => {
          if (!selected) return;
          e.evt.preventDefault();
          const current = clipNow();
          if (!current) return;
          if (Date.now() - lastWheelRef.current > 500) beginTransaction();
          lastWheelRef.current = Date.now();
          const dir = e.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
          const scale = Math.min(10, Math.max(0.1, current.zoom.scale * dir));
          updateVideoClip(current.id, { zoom: { ...current.zoom, scale } }, { transient: true });
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
  // Suscribirse a la referencia ESTABLE de layers y derivar con useMemo: los
  // selectores videoLayers/imageItems/textItems crean un array nuevo cada llamada,
  // y devolverlos directos desde el selector de Zustand provoca un bucle infinito
  // en useSyncExternalStore ("getSnapshot should be cached") → app en negro.
  const layers = useProjectStore((s) => s.project.tracks.layers);
  const texts = useMemo(
    () => layers.flatMap((l) => l.items.filter((it): it is MediaElement & { kind: "text" } => it.kind === "text") as unknown as TextOverlay[]),
    [layers],
  );
  const images = useMemo(
    () => layers.flatMap((l) => l.items.filter((it): it is MediaElement & { kind: "image" } => it.kind === "image") as unknown as ImageOverlay[]),
    [layers],
  );
  const videoTracks = useMemo(
    () => layers
      .map((l) => ({
        id: l.id,
        name: l.name,
        clips: l.items.filter((it): it is MediaElement & { kind: "video" } => it.kind === "video") as unknown as VideoClip[],
      }))
      .filter((t) => t.clips.length > 0),
    [layers],
  );
  // Guías de centrado: visibles solo mientras un arrastre engancha al centro
  const [guides, setGuides] = useState({ vertical: false, horizontal: false });
  const onGuides: GuidesCallback = (vertical, horizontal) =>
    setGuides((g) =>
      g.vertical === vertical && g.horizontal === horizontal ? g : { vertical, horizontal },
    );

  const visibleTexts = texts.filter((t) => playhead >= t.start && playhead < t.end);
  const visibleImages = images.filter((i) => playhead >= i.start && playhead < i.end);

  // Clips activos por capa (una entrada por capa que tiene clip en el playhead)
  const activeClipsByTrack = videoTracks
    .map((track) => {
      const active = videoClipAt(track.clips, playhead);
      return active ? { track, clip: active } : null;
    })
    .filter((x): x is { track: typeof videoTracks[number]; clip: VideoClip } => x !== null);

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
        {/* Un VideoFrameNode por clip activo de cada pista, en orden natural de
            pista: la base (índice 0) abajo y las pistas superiores encima. Así, al
            clicar una capa superior (su recuadro está encima) se selecciona ella, y
            la base se selecciona/arrastra por sus zonas no tapadas. NO se sube el
            seleccionado encima: si la base (frame completo) fuese encima, taparía
            todo el lienzo e impediría seleccionar los clips superiores. */}
        {activeClipsByTrack.map(({ track, clip }) => (
          <VideoFrameNode
            key={track.id}
            clip={clip}
            width={width}
            height={height}
            onGuides={onGuides}
            cropMode={cropMode}
          />
        ))}
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
          // key liga el recorte a la selección y al tamaño del lienzo: si cambian,
          // CropOverlay se remonta y recalcula sus bounds (no se queda con los del
          // elemento anterior)
          <CropOverlay
            key={`${selection.kind}:${selection.id}:${width}x${height}`}
            canvasW={width}
            canvasH={height}
          />
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
