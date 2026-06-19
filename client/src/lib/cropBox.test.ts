import { describe, it, expect } from "vitest";
import { clampTransformBox, composeCrop } from "./cropBox";

describe("clampTransformBox", () => {
  it("deja pasar una caja completamente dentro de los límites", () => {
    const bounds = { left: 0, top: 0, right: 200, bottom: 200 };
    const box = { x: 50, y: 50, width: 80, height: 80 };
    expect(clampTransformBox(box, bounds)).toEqual({ x: 50, y: 50, width: 80, height: 80 });
  });

  it("recorta el borde derecho/inferior que sobresale", () => {
    const bounds = { left: 0, top: 0, right: 200, bottom: 200 };
    const box = { x: 100, y: 100, width: 180, height: 180 };
    expect(clampTransformBox(box, bounds)).toEqual({ x: 100, y: 100, width: 100, height: 100 });
  });

  it("clava el borde izquierdo/superior que sobresale", () => {
    const bounds = { left: 0, top: 0, right: 200, bottom: 200 };
    const box = { x: -30, y: -30, width: 100, height: 100 };
    expect(clampTransformBox(box, bounds)).toEqual({ x: 0, y: 0, width: 70, height: 70 });
  });

  it("respeta el tamaño mínimo sin colapsar", () => {
    const bounds = { left: 0, top: 0, right: 200, bottom: 200 };
    const box = { x: 199, y: 199, width: 50, height: 50 };
    const out = clampTransformBox(box, bounds, 20);
    expect(out.width).toBe(20);
    expect(out.height).toBe(20);
  });

  // Regresión: con el Stage trasladado (STAGE_MARGIN=200), tanto la caja como
  // los límites llegan en absolutas. El recorte debe comportarse igual que en
  // origen — NO debe colapsar el rect al redimensionar dentro del área válida.
  it("funciona con límites desplazados por el offset del stage (caso del bug)", () => {
    const margin = 200;
    const bounds = { left: 0 + margin, top: 0 + margin, right: 200 + margin, bottom: 200 + margin };
    // Caja en absolutas: rect a (50,50) del lienzo redimensionado a 120x120
    const box = { x: 50 + margin, y: 50 + margin, width: 120, height: 120 };
    expect(clampTransformBox(box, bounds)).toEqual({
      x: 50 + margin,
      y: 50 + margin,
      width: 120,
      height: 120,
    });
  });
});

describe("composeCrop", () => {
  const FULL = { x: 0, y: 0, w: 1, h: 1 };

  it("sin recorte previo, el recorte relativo pasa tal cual", () => {
    expect(composeCrop(FULL, { x: 0.25, y: 0.1, w: 0.5, h: 0.5 })).toEqual({
      x: 0.25, y: 0.1, w: 0.5, h: 0.5,
    });
  });

  it("aplicar recorte al 100% deja el recorte previo intacto (idempotente)", () => {
    const prev = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    expect(composeCrop(prev, FULL)).toEqual(prev);
  });

  it("anida un recorte dentro de otro (acumulativo)", () => {
    // Sobre un recorte que ya toma el 50% central, recortar la mitad superior izq.
    const prev = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const out = composeCrop(prev, { x: 0, y: 0, w: 0.5, h: 0.5 });
    expect(out.x).toBeCloseTo(0.25);
    expect(out.y).toBeCloseTo(0.25);
    expect(out.w).toBeCloseTo(0.25);
    expect(out.h).toBeCloseTo(0.25);
  });

  it("respeta el tamaño mínimo del recorte compuesto", () => {
    const prev = { x: 0, y: 0, w: 0.02, h: 0.02 };
    const out = composeCrop(prev, { x: 0, y: 0, w: 0.1, h: 0.1 });
    expect(out.w).toBe(0.01);
    expect(out.h).toBe(0.01);
  });

  it("mantiene el rect dentro del source (x+w<=1, y+h<=1)", () => {
    const prev = { x: 0.5, y: 0.5, w: 0.5, h: 0.5 };
    const out = composeCrop(prev, { x: 0.8, y: 0.8, w: 0.5, h: 0.5 });
    expect(out.x + out.w).toBeLessThanOrEqual(1.0000001);
    expect(out.y + out.h).toBeLessThanOrEqual(1.0000001);
  });
});
