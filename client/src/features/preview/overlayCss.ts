import type { CSSProperties } from "react";
import type { ImageOverlay, TextOverlay } from "@clipforge/shared";

/**
 * Devuelve los CSSProperties para posicionar una imagen overlay en HTML,
 * con la MISMA geometría que usa ImageNode en Konva:
 * - origen = centro del elemento (translate -50%,-50%)
 * - left = overlay.x * W, top = overlay.y * H
 * - width = overlay.width * W, height = overlay.height * H
 * - rotation en grados
 * - opacity
 * - crop (normalizado x,y,w,h sobre la imagen natural) → object-fit+clip-path
 *   que recorta el mismo área visible que el crop de Konva
 */
export function imageOverlayStyle(
  overlay: ImageOverlay,
  W: number,
  H: number,
): CSSProperties {
  const left = overlay.x * W;
  const top = overlay.y * H;
  const w = overlay.width * W;
  const h = overlay.height * H;

  // El contenedor tiene el tamaño del rect visible (= mismo tamaño que el nodo
  // Konva). Cuando hay crop, recortamos con overflow:hidden y la <img> interna
  // (imageInnerStyle) se expande al frame completo y se desplaza.
  return {
    position: "absolute",
    left,
    top,
    width: w,
    height: h,
    transform: `translate(-50%, -50%) rotate(${overlay.rotation}deg)`,
    opacity: overlay.opacity,
    overflow: overlay.crop ? "hidden" : undefined,
    pointerEvents: "none",
  };
}

/**
 * Devuelve los CSSProperties para posicionar el IMG interno cuando hay crop.
 * Cuando no hay crop, la imagen llena el contenedor (no se necesita este helper).
 */
export function imageInnerStyle(overlay: ImageOverlay, W: number, H: number): CSSProperties {
  if (!overlay.crop) {
    return {
      position: "absolute",
      width: "100%",
      height: "100%",
      objectFit: "fill" as const,
    };
  }
  const { x: cx, y: cy, w: cw, h: ch } = overlay.crop;
  const containerW = overlay.width * W;
  const containerH = overlay.height * H;
  return {
    position: "absolute",
    left: -((cx / cw) * containerW),
    top: -((cy / ch) * containerH),
    width: containerW / cw,
    height: containerH / ch,
    objectFit: "fill" as const,
    maxWidth: "none",
  };
}

/**
 * Devuelve los CSSProperties para posicionar un texto overlay en HTML,
 * con la MISMA geometría que usa TextNode en Konva:
 * - origen = centro del elemento (translate -50%,-50%)
 * - left = overlay.x * W, top = overlay.y * H
 * - fontSize = overlay.fontSize * H
 * - fontFamily, color = fill
 * - -webkit-text-stroke = strokeWidth*H + " " + stroke (si strokeWidth > 0)
 * - text-shadow cuando overlay.shadow (blur~fontSize*0.15, negro, opacidad 0.8)
 * - opacity, white-space:nowrap
 */
export function textOverlayStyle(
  overlay: TextOverlay,
  W: number,
  H: number,
): CSSProperties {
  const left = overlay.x * W;
  const top = overlay.y * H;
  const fontSize = overlay.fontSize * H;

  const shadow = overlay.shadow
    ? `0 0 ${fontSize * 0.15}px rgba(0,0,0,0.8)`
    : undefined;

  const strokeWidth = overlay.strokeWidth * H;
  const webkitTextStroke =
    strokeWidth > 0 && overlay.stroke
      ? `${strokeWidth}px ${overlay.stroke}`
      : undefined;

  return {
    position: "absolute",
    left,
    top,
    transform: `translate(-50%, -50%) rotate(${overlay.rotation}deg)`,
    fontFamily: overlay.fontFamily,
    fontSize,
    color: overlay.fill,
    WebkitTextStroke: webkitTextStroke,
    textShadow: shadow,
    opacity: overlay.opacity,
    whiteSpace: "nowrap",
    pointerEvents: "none",
    lineHeight: 1,
    userSelect: "none",
  };
}
