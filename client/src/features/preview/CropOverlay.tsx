import { useCallback, useEffect, useMemo, useRef } from "react";
import Konva from "konva";
import { Circle, Group, Label, Rect as KonvaRect, Tag, Text as KonvaText, Transformer } from "react-konva";
import { useClipsStore } from "../../stores/clipsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { clampTransformBox, composeCrop } from "../../lib/cropBox";
import type { CropRect } from "@clipforge/shared";
import { allVideoClips, imageItems } from "@clipforge/shared";

interface Bounds { left: number; top: number; w: number; h: number; }

interface Props { canvasW: number; canvasH: number; }

// Botones de confirmar/cancelar anclados bajo la esquina inferior derecha del
// recuadro de recorte. Discretos: monocromos y pequeños para no robar atención.
const BTN_R = 9;           // radio del botón
const BTN_GAP = 6;         // separación entre los dos botones
const BTN_MARGIN = 8;      // separación vertical bajo el borde inferior del rect
const BTN_FILL = "rgba(15,15,18,0.6)";

// Velo sobre lo que queda FUERA del recorte. Opaco para que la zona conservada
// resalte y la vista previa en vivo del recorte se lea con claridad.
const DARK_FILL = "rgba(0,0,0,0.72)";
const LABEL_OFFSET = 22; // altura de la etiqueta "Recortando" sobre el recuadro

function setCursor(e: Konva.KonvaEventObject<MouseEvent>, cursor: string) {
  const stage = e.target.getStage();
  if (stage) stage.container().style.cursor = cursor;
}

/** Botón circular discreto con un glifo centrado, dibujado en Konva. */
function IconButton({ cx, cy, glyph, label, onActivate }: {
  cx: number; cy: number; glyph: string; label: string; onActivate: () => void;
}) {
  const activate = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true; // no arrastrar el rect al pulsar el botón
    onActivate();
  };
  return (
    <Group
      x={cx}
      y={cy}
      onMouseEnter={(e) => setCursor(e, "pointer")}
      onMouseLeave={(e) => setCursor(e, "default")}
      onClick={activate}
      onTap={activate}
    >
      <Circle radius={BTN_R} fill={BTN_FILL} stroke="rgba(255,255,255,0.8)" strokeWidth={1} />
      <KonvaText
        text={glyph}
        x={-BTN_R}
        y={-BTN_R}
        width={BTN_R * 2}
        height={BTN_R * 2}
        align="center"
        verticalAlign="middle"
        fontSize={BTN_R * 1.05}
        fill="rgba(255,255,255,0.92)"
        listening={false}
      />
      {/* etiqueta accesible para lectores de pantalla del nodo Konva */}
      <KonvaText text={label} visible={false} listening={false} />
    </Group>
  );
}

// Recorte neutro (toma el elemento entero)
const FULL: NonNullable<CropRect> = { x: 0, y: 0, w: 1, h: 1 };

/** Recorte ya aplicado al elemento (normalizado, relativo al source), o FULL. */
function getCurrentCrop(selection: { kind: string; id: string } | null): NonNullable<CropRect> {
  if (selection?.kind === "image") {
    return imageItems(useProjectStore.getState().project).find(i => i.id === selection.id)?.crop ?? FULL;
  }
  if (selection?.kind === "video") {
    return allVideoClips(useProjectStore.getState().project).find(v => v.id === selection.id)?.crop ?? FULL;
  }
  return FULL;
}

/**
 * Rect VISIBLE del elemento en el lienzo, ya con su recorte actual aplicado: el
 * recuadro de recorte abraza exactamente lo que se ve (sin margen negro). Un
 * recorte nuevo se interpreta como fracción de este rect y se compone con el
 * existente (ver handleApply).
 */
function computeBounds(
  selection: { kind: string; id: string } | null,
  canvasW: number,
  canvasH: number,
): Bounds | null {
  if (!selection) return null;

  if (selection.kind === "image") {
    // La imagen recortada se estira para llenar su caja (crop nativo de Konva):
    // el rect visible es siempre la caja completa del overlay
    const img = imageItems(useProjectStore.getState().project).find(i => i.id === selection.id);
    if (!img) return null;
    const w = img.width * canvasW;
    const h = img.height * canvasH;
    return { left: img.x * canvasW - w / 2, top: img.y * canvasH - h / 2, w, h };
  }

  if (selection.kind === "video") {
    // El vídeo recortado se muestra MÁS pequeño (sub-rect del fotograma): el rect
    // visible parte de la colocación del frame completo y aplica el recorte actual
    const clip = allVideoClips(useProjectStore.getState().project).find(c => c.id === selection.id);
    if (!clip) return null;
    const info = useClipsStore.getState().clips.find(c => c.id === clip.clipId);
    if (!info) return null;
    const base = Math.min(canvasW / info.width, canvasH / info.height);
    const fullW = info.width * base * clip.zoom.scale;
    const fullH = info.height * base * clip.zoom.scale;
    const c = clip.crop ?? FULL;
    // Tamaño visible (frame × recorte) y posición zoom·(lienzo − tamaño visible),
    // igual que PreviewCanvas/renderRect
    const vW = fullW * c.w;
    const vH = fullH * c.h;
    return {
      left: clip.zoom.x * (canvasW - vW),
      top: clip.zoom.y * (canvasH - vH),
      w: vW,
      h: vH,
    };
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
  const btnRef = useRef<Konva.Group>(null);
  const labelRef = useRef<Konva.Label>(null);

  // Bounds y posición inicial calculados UNA SOLA VEZ al montar. El recuadro
  // arranca pegado al elemento visible (100% de los bounds): el usuario arrastra
  // las asas hacia dentro para recortar más
  const { bounds, init } = useMemo(() => {
    const b = computeBounds(selection, canvasW, canvasH);
    if (!b) return { bounds: null, init: null };
    return { bounds: b, init: { x: 0, y: 0, w: b.w, h: b.h } };
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
    // Los botones cuelgan de la esquina inferior derecha del recuadro
    btnRef.current?.position({ x: rx + rw, y: ry + rh });
    // La etiqueta "Recortando" sigue la esquina superior izquierda
    labelRef.current?.position({ x: rx, y: ry - LABEL_OFFSET });
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

    // Recorte relativo al rect VISIBLE (0..1 dentro de los bounds actuales)
    const relX = Math.max(0, Math.min(1, (rx - b.left) / b.w));
    const relY = Math.max(0, Math.min(1, (ry - b.top) / b.h));
    const relW = Math.max(0.01, Math.min(1, rw / b.w));
    const relH = Math.max(0.01, Math.min(1, rh / b.h));

    // Componer con el recorte existente: los bounds ya reflejan ese recorte, así
    // que el nuevo es una fracción anidada dentro del anterior (acumulativo)
    const crop: CropRect = composeCrop(getCurrentCrop(selection), {
      x: relX, y: relY, w: relW, h: relH,
    });

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
      <KonvaRect ref={topRef}    x={b.left} y={b.top}          width={b.w} height={init.y}                           fill={DARK_FILL} listening={false} />
      <KonvaRect ref={bottomRef} x={b.left} y={initY + init.h} width={b.w} height={Math.max(0, b.h - init.y - init.h)} fill={DARK_FILL} listening={false} />
      <KonvaRect ref={leftRef}   x={b.left} y={initY}          width={init.x}                        height={init.h} fill={DARK_FILL} listening={false} />
      <KonvaRect ref={rightRef}  x={initX + init.w} y={initY}  width={Math.max(0, b.w - init.x - init.w)} height={init.h} fill={DARK_FILL} listening={false} />

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
          // boundBoxFunc opera en coordenadas ABSOLUTAS del stage. El Stage está
          // trasladado (STAGE_MARGIN), así que los bounds del elemento —que están
          // en coordenadas del lienzo— deben desplazarse por el offset del stage
          // antes de recortar. Sin esto el rect se desfasa y "se va loco".
          const stage = trRef.current?.getStage();
          const ox = stage?.x() ?? 0;
          const oy = stage?.y() ?? 0;
          const clamped = clampTransformBox(newBox, {
            left: b.left + ox,
            top: b.top + oy,
            right: b.left + b.w + ox,
            bottom: b.top + b.h + oy,
          });
          return { ...newBox, ...clamped };
        }}
      />
      {/* Indicador "Recortando": sigue la esquina superior izquierda del recuadro */}
      <Label ref={labelRef} x={initX} y={initY - LABEL_OFFSET} listening={false}>
        <Tag fill="rgba(15,15,18,0.7)" cornerRadius={3} />
        <KonvaText text="Recortando" fontSize={11} fill="rgba(255,255,255,0.92)" padding={4} />
      </Label>

      {/* Botones flotantes: ✓ aplica, ✕ cancela. Posición actualizada en
          updateDark; arrancan en la esquina inferior derecha del recuadro */}
      <Group ref={btnRef} x={initX + init.w} y={initY + init.h}>
        <IconButton
          cx={-(BTN_R * 3 + BTN_GAP)}
          cy={BTN_MARGIN + BTN_R}
          glyph="✓"
          label="Aplicar recorte"
          onActivate={handleApply}
        />
        <IconButton
          cx={-BTN_R}
          cy={BTN_MARGIN + BTN_R}
          glyph="✕"
          label="Cancelar recorte"
          onActivate={() => setCropMode(false)}
        />
      </Group>
    </>
  );
}
