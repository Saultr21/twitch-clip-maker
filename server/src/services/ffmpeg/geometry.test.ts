import { describe, expect, it } from "vitest";
import { renderRect } from "./geometry.js";

describe("renderRect", () => {
  it("contain a 1x: un 16:9 en lienzo 9:16 ocupa todo el ancho, centrado", () => {
    const r = renderRect(1080, 1920, 1920, 1080, { x: 0.5, y: 0.5, scale: 1 });
    expect(r).toEqual({ w: 1080, h: 608, left: 0, top: 656 });
  });

  it("zoom 2x centrado: el doble de tamaño, desplazado a la mitad negativa", () => {
    const r = renderRect(1080, 1920, 1920, 1080, { x: 0.5, y: 0.5, scale: 2 });
    expect(r.w).toBe(2160);
    expect(r.h).toBe(1214); // 1215 → par
    expect(r.left).toBe(-540);
    expect(r.top).toBe(353);
  });

  it("encuadre en una esquina con zoom", () => {
    const r = renderRect(1080, 1920, 1920, 1080, { x: 0, y: 0, scale: 2 });
    expect(r.w).toBe(2160);
    expect(r.h).toBe(1214);
    expect(r.left).toBe(0);
    expect(r.top).toBe(0);
  });

  it("mismo aspecto que el lienzo a 1x: lo llena exacto", () => {
    const r = renderRect(1920, 1080, 1920, 1080, { x: 0.5, y: 0.5, scale: 1 });
    expect(r).toEqual({ w: 1920, h: 1080, left: 0, top: 0 });
  });

  it("ancho y alto siempre pares (requisito de yuv420p)", () => {
    const r = renderRect(1080, 1920, 1313, 777, { x: 0.5, y: 0.5, scale: 1 });
    expect(r.w % 2).toBe(0);
    expect(r.h % 2).toBe(0);
  });
});
