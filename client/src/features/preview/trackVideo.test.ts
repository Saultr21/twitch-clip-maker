import { describe, expect, it } from "vitest";
import { visibleRect } from "./trackVideo";

describe("visibleRect", () => {
  const info = { width: 1920, height: 1080 };
  it("sin crop: tamaño del frame completo, posición por zoom", () => {
    const r = visibleRect(1080, 1920, info, { x: 0.5, y: 0.5, scale: 1 }, null);
    // base = min(1080/1920, 1920/1080) = 0.5625 → w=1080, h=607.5
    expect(Math.round(r.w)).toBe(1080);
    expect(Math.round(r.fullW)).toBe(1080);
  });
  it("con crop reduce el tamaño visible y posiciona por (lienzo - visible)", () => {
    const r = visibleRect(1080, 1920, info, { x: 1, y: 0.5, scale: 1 }, { x: 0.25, y: 0, w: 0.5, h: 1 });
    expect(Math.round(r.w)).toBe(540); // 1080 * 0.5
    expect(Math.round(r.left)).toBe(1080 - 540); // zoom.x=1 → pegado a la derecha
  });
});
