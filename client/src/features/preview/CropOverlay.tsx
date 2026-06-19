import { useCallback, useEffect, useMemo, useRef } from "react";
import Konva from "konva";
import { Rect as KonvaRect, Transformer } from "react-konva";
import { useClipsStore } from "../../stores/clipsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import type { CropRect } from "@clipforge/shared";

interface Bounds { left: number; top: number; w: number; h: number; }

interface Props { canvasW: number; canvasH: number; }

function computeBounds(
  selection: { kind: string; id: string } | null,
  canvasW: number,
  canvasH: number,
): Bounds | null {
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
    const info = useClipsStore.getState().clips.find(c => c.id === clip.clipId);
    if (!info) return null;
    const base = Math.min(canvasW / info.width, canvasH / info.height);
    const w = info.width * base * clip.zoom.scale;
    const h = info.height * base * clip.zoom.scale;
    return { left: clip.zoom.x * (canvasW - w), top: clip.zoom.y * (canvasH - h), w, h };
  }

  return null;
}

function getExistingCropPx(
  selection: { kind: string; id: string } | null,
  b: Bounds,
): { x: number; y: number; w: number; h: number } | null {
  if (selection?.kind === "image") {
    const c = useProjectStore.getState().project.tracks.image.find(i => i.id === selection.id)?.crop;
    if (c) return { x: c.x * b.w, y: c.y * b.h, w: c.w * b.w, h: c.h * b.h };
  }
  if (selection?.kind === "video") {
    const c = useProjectStore.getState().project.tracks.video.find(v => v.id === selection.id)?.crop;
    if (c) return { x: c.x * b.w, y: c.y * b.h, w: c.w * b.w, h: c.h * b.h };
  }
  return null;
}

export function CropOverlay({ canvasW, canvasH }: Props) {
  const selection = useUiStore(s => s.selection);
  const setCropMode = useUiStore(s => s.setCropMode);
  const setImageCrop = useProjectStore(s => s.setImageCrop);
  const setVideoCrop = useProjectStore(s => s.setVideoCrop);

  // Refs para los nodos Konva — gestionados de forma imperativa durante la interacción
  const rectRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const topRef = useRef<Konva.Rect>(null);
  const bottomRef = useRef<Konva.Rect>(null);
  const leftRef = useRef<Konva.Rect>(null);
  const rightRef = useRef<Konva.Rect>(null);

  // Bounds y posición inicial calculados UNA SOLA VEZ al montar
  const { bounds, init } = useMemo(() => {
    const b = computeBounds(selection, canvasW, canvasH);
    if (!b) return { bounds: null, init: null };
    const existing = getExistingCropPx(selection, b);
    // Sin crop previo: 80% centrado para que sea movible de inmediato
    const pad = b.w * 0.1;
    const padH = b.h * 0.1;
    const crop = existing ?? { x: pad, y: padH, w: b.w - pad * 2, h: b.h - padH * 2 };
    return { bounds: b, init: crop };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo en montaje

  // Adjuntar Transformer al rect tras montar
  useEffect(() => {
    if (rectRef.current && trRef.current) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, []);

  // Actualiza las 4 zonas oscuras leyendo el estado ACTUAL del nodo Konva
  const updateDark = useCallback(() => {
    const b = bounds;
    const rect = rectRef.current;
    if (!b || !rect) return;

    const rx = rect.x();
    const ry = rect.y();
    const rw = rect.width() * Math.abs(rect.scaleX());
    const rh = rect.height() * Math.abs(rect.scaleY());

    topRef.current?.setAttrs({ x: b.left, y: b.top, width: b.w, height: Math.max(0, ry - b.top) });
    bottomRef.current?.setAttrs({ x: b.left, y: ry + rh, width: b.w, height: Math.max(0, b.top + b.h - ry - rh) });
    leftRef.current?.setAttrs({ x: b.left, y: ry, width: Math.max(0, rx - b.left), height: rh });
    rightRef.current?.setAttrs({ x: rx + rw, y: ry, width: Math.max(0, b.left + b.w - rx - rw), height: rh });
    rect.getLayer()?.batchDraw();
  }, [bounds]);

  // Aplicar: lee la posición actual del nodo Konva (no del estado React)
  const handleApply = useCallback(() => {
    const b = bounds;
    const rect = rectRef.current;
    if (!b || !rect || !selection) return;

    const rx = rect.x();
    const ry = rect.y();
    const rw = rect.width() * Math.abs(rect.scaleX());
    const rh = rect.height() * Math.abs(rect.scaleY());

    const crop: CropRect = {
      x: Math.max(0, Math.min(1, (rx - b.left) / b.w)),
      y: Math.max(0, Math.min(1, (ry - b.top) / b.h)),
      w: Math.max(0.01, Math.min(1, rw / b.w)),
      h: Math.max(0.01, Math.min(1, rh / b.h)),
    };

    if (selection.kind === "image") setImageCrop(selection.id, crop);
    if (selection.kind === "video") setVideoCrop(selection.id, crop);
    setCropMode(false);
  }, [bounds, selection, setImageCrop, setVideoCrop, setCropMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); handleApply(); }
      if (e.key === "Escape") { e.preventDefault(); setCropMode(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleApply, setCropMode]);

  if (!bounds || !init) return null;

  const b = bounds;
  const initX = b.left + init.x;
  const initY = b.top + init.y;

  return (
    <>
      {/* Las 4 zonas oscuras — sus props iniciales no cambian: se actualizan solo via setAttrs imperativo */}
      <KonvaRect ref={topRef}    x={b.left} y={b.top}          width={b.w} height={init.y}                           fill="rgba(0,0,0,0.6)" listening={false} />
      <KonvaRect ref={bottomRef} x={b.left} y={initY + init.h} width={b.w} height={Math.max(0, b.h - init.y - init.h)} fill="rgba(0,0,0,0.6)" listening={false} />
      <KonvaRect ref={leftRef}   x={b.left} y={initY}          width={init.x}                        height={init.h} fill="rgba(0,0,0,0.6)" listening={false} />
      <KonvaRect ref={rightRef}  x={initX + init.w} y={initY}  width={Math.max(0, b.w - init.x - init.w)} height={init.h} fill="rgba(0,0,0,0.6)" listening={false} />

      {/* Rect del crop — las props iniciales no cambian tras el montaje */}
      <KonvaRect
        ref={rectRef}
        x={initX}
        y={initY}
        width={init.w}
        height={init.h}
        fill="transparent"
        stroke="white"
        strokeWidth={1.5}
        draggable
        onDragMove={(e) => {
          const node = e.target as Konva.Rect;
          const nw = node.width() * Math.abs(node.scaleX());
          const nh = node.height() * Math.abs(node.scaleY());
          // Clamp dentro de los bounds del elemento
          const cx = Math.max(b.left, Math.min(b.left + b.w - nw, node.x()));
          const cy = Math.max(b.top,  Math.min(b.top  + b.h - nh, node.y()));
          node.position({ x: cx, y: cy });
          updateDark();
        }}
        onTransform={() => {
          // Actualizar zonas oscuras en tiempo real mientras el usuario arrastra un asa
          updateDark();
        }}
        onTransformEnd={() => {
          const node = rectRef.current;
          if (!node) return;
          // Reset scale → aplicar al width/height (patrón estándar de Konva)
          const newW = Math.max(20, node.width()  * node.scaleX());
          const newH = Math.max(20, node.height() * node.scaleY());
          node.width(newW);
          node.height(newH);
          node.scaleX(1);
          node.scaleY(1);
          trRef.current?.forceUpdate();
          updateDark();
        }}
      />
      <Transformer
        ref={trRef}
        rotateEnabled={false}
        flipEnabled={false}
        borderDash={[4, 4]}
        boundBoxFunc={(_, newBox) => {
          // Constrañir el transform dentro de los bounds del elemento
          const x = Math.max(b.left, newBox.x);
          const y = Math.max(b.top,  newBox.y);
          const r = Math.min(b.left + b.w, newBox.x + newBox.width);
          const bot = Math.min(b.top  + b.h, newBox.y + newBox.height);
          return { ...newBox, x, y, width: Math.max(20, r - x), height: Math.max(20, bot - y) };
        }}
      />
    </>
  );
}
