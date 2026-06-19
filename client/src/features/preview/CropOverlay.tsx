import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Rect as KonvaRect, Transformer } from "react-konva";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import type { CropRect } from "@clipforge/shared";

interface Bounds { left: number; top: number; w: number; h: number; }
interface CropPx { x: number; y: number; w: number; h: number; }

interface Props { canvasW: number; canvasH: number; }

function computeBounds(selection: { kind: string; id: string } | null, canvasW: number, canvasH: number): Bounds | null {
  if (!selection) return null;
  if (selection.kind === "image") {
    const img = useProjectStore.getState().project.tracks.image.find(i => i.id === selection.id);
    if (!img) return null;
    const w = img.width * canvasW;
    const h = img.height * canvasH;
    return { left: img.x * canvasW - w / 2, top: img.y * canvasH - h / 2, w, h };
  }
  if (selection.kind === "video") {
    const clip = useProjectStore.getState().project.tracks.video.find(c => c.id === selection.id);
    if (!clip) return null;
    // For video bounds, use the canvas dimensions approximation
    const w = canvasW * clip.zoom.scale;
    const h = canvasH * clip.zoom.scale;
    return { left: clip.zoom.x * (canvasW - w), top: clip.zoom.y * (canvasH - h), w, h };
  }
  return null;
}

function initialCropPx(selection: { kind: string; id: string } | null, bounds: Bounds): CropPx {
  if (selection?.kind === "image") {
    const img = useProjectStore.getState().project.tracks.image.find(i => i.id === selection.id);
    const c = img?.crop;
    if (c) return { x: c.x * bounds.w, y: c.y * bounds.h, w: c.w * bounds.w, h: c.h * bounds.h };
  }
  if (selection?.kind === "video") {
    const clip = useProjectStore.getState().project.tracks.video.find(c => c.id === selection.id);
    const c = clip?.crop;
    if (c) return { x: c.x * bounds.w, y: c.y * bounds.h, w: c.w * bounds.w, h: c.h * bounds.h };
  }
  return { x: 0, y: 0, w: bounds.w, h: bounds.h };
}

export function CropOverlay({ canvasW, canvasH }: Props) {
  const selection = useUiStore(s => s.selection);
  const setCropMode = useUiStore(s => s.setCropMode);
  const setImageCrop = useProjectStore(s => s.setImageCrop);
  const setVideoCrop = useProjectStore(s => s.setVideoCrop);
  const rectRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const bounds = computeBounds(selection, canvasW, canvasH);
  const [crop, setCrop] = useState<CropPx>(() =>
    bounds ? initialCropPx(selection, bounds) : { x: 0, y: 0, w: canvasW, h: canvasH }
  );

  useEffect(() => {
    if (rectRef.current && trRef.current) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, []);

  const handleApply = () => {
    if (!bounds || !selection) return;
    const normalizedCrop: CropRect = {
      x: Math.max(0, Math.min(1, crop.x / bounds.w)),
      y: Math.max(0, Math.min(1, crop.y / bounds.h)),
      w: Math.max(0.01, Math.min(1 - crop.x / bounds.w, crop.w / bounds.w)),
      h: Math.max(0.01, Math.min(1 - crop.y / bounds.h, crop.h / bounds.h)),
    };
    if (selection.kind === "image") setImageCrop(selection.id, normalizedCrop);
    if (selection.kind === "video") setVideoCrop(selection.id, normalizedCrop);
    setCropMode(false);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); handleApply(); }
      if (e.key === "Escape") { e.preventDefault(); setCropMode(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, bounds, selection]);

  if (!bounds) return null;

  const absX = bounds.left + crop.x;
  const absY = bounds.top + crop.y;

  const updateFromNode = (node: Konva.Rect) => {
    const newW = Math.max(20, node.width() * node.scaleX());
    const newH = Math.max(20, node.height() * node.scaleY());
    setCrop({
      x: node.x() - bounds.left,
      y: node.y() - bounds.top,
      w: newW,
      h: newH,
    });
    node.width(newW);
    node.height(newH);
    node.scaleX(1);
    node.scaleY(1);
  };

  return (
    <>
      {/* Dark areas around crop */}
      <KonvaRect x={bounds.left} y={bounds.top} width={bounds.w} height={crop.y} fill="rgba(0,0,0,0.6)" listening={false} />
      <KonvaRect x={bounds.left} y={absY + crop.h} width={bounds.w} height={Math.max(0, bounds.h - crop.y - crop.h)} fill="rgba(0,0,0,0.6)" listening={false} />
      <KonvaRect x={bounds.left} y={absY} width={crop.x} height={crop.h} fill="rgba(0,0,0,0.6)" listening={false} />
      <KonvaRect x={absX + crop.w} y={absY} width={Math.max(0, bounds.w - crop.x - crop.w)} height={crop.h} fill="rgba(0,0,0,0.6)" listening={false} />

      {/* Crop rect — draggable + transformer */}
      <KonvaRect
        ref={rectRef}
        x={absX}
        y={absY}
        width={crop.w}
        height={crop.h}
        fill="transparent"
        stroke="white"
        strokeWidth={1.5}
        draggable
        dragBoundFunc={(pos) => ({
          x: Math.max(bounds.left, Math.min(bounds.left + bounds.w - crop.w, pos.x)),
          y: Math.max(bounds.top, Math.min(bounds.top + bounds.h - crop.h, pos.y)),
        })}
        onDragMove={(e) => setCrop(c => ({
          ...c,
          x: e.target.x() - bounds.left,
          y: e.target.y() - bounds.top,
        }))}
        onTransformEnd={(e) => updateFromNode(e.target as Konva.Rect)}
      />
      <Transformer
        ref={trRef}
        rotateEnabled={false}
        flipEnabled={false}
        borderDash={[4, 4]}
        boundBoxFunc={(_, newBox) => {
          const x = Math.max(bounds.left, newBox.x);
          const y = Math.max(bounds.top, newBox.y);
          const r = Math.min(bounds.left + bounds.w, newBox.x + newBox.width);
          const b = Math.min(bounds.top + bounds.h, newBox.y + newBox.height);
          return { ...newBox, x, y, width: Math.max(20, r - x), height: Math.max(20, b - y) };
        }}
      />
    </>
  );
}
