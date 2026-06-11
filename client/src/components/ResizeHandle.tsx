import { useRef } from "react";

interface ResizeHandleProps {
  orientation: "vertical" | "horizontal"; // vertical = redimensiona anchura
  label: string;
  /** Delta en px desde el último evento (x para vertical, y para horizontal). */
  onDelta: (delta: number) => void;
}

const KEYBOARD_STEP = 16;

/** Separador arrastrable entre zonas de la interfaz, operable también con flechas. */
export function ResizeHandle({ orientation, label, onDelta }: ResizeHandleProps) {
  const lastRef = useRef(0);
  const isVertical = orientation === "vertical";

  return (
    <div
      role="separator"
      aria-orientation={isVertical ? "vertical" : "horizontal"}
      aria-label={label}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        lastRef.current = isVertical ? e.clientX : e.clientY;
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const pos = isVertical ? e.clientX : e.clientY;
        onDelta(pos - lastRef.current);
        lastRef.current = pos;
      }}
      onKeyDown={(e) => {
        const grow = isVertical ? "ArrowRight" : "ArrowDown";
        const shrink = isVertical ? "ArrowLeft" : "ArrowUp";
        if (e.code === grow) {
          e.preventDefault();
          onDelta(KEYBOARD_STEP);
        } else if (e.code === shrink) {
          e.preventDefault();
          onDelta(-KEYBOARD_STEP);
        }
      }}
      className={`shrink-0 bg-border hover:bg-accent focus-visible:bg-accent outline-none transition-colors ${
        isVertical ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
      }`}
    />
  );
}
