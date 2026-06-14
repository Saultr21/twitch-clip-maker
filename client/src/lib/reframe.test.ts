import { describe, expect, it } from "vitest";
import { coverScale, panFor, reframeZoom, groupSamples, buildReframeSegments } from "./reframe";

describe("coverScale", () => {
  it("16:9 dentro de 9:16 escala para cubrir (~3.16x)", () => {
    expect(coverScale(1920, 1080, 1080, 1920)).toBeCloseTo(3.16, 2);
  });
  it("mismo aspecto = 1x", () => {
    expect(coverScale(1080, 1920, 1080, 1920)).toBeCloseTo(1, 5);
  });
});

describe("panFor", () => {
  it("centra (0.5) cuando la cara está en el medio", () => {
    expect(panFor(0.5, 3413, 1080)).toBeCloseTo(0.5, 2);
  });
  it("clampa a los extremos", () => {
    expect(panFor(0, 3413, 1080)).toBe(0);
    expect(panFor(1, 3413, 1080)).toBe(1);
  });
  it("0.5 si no hay margen para desplazar en ese eje", () => {
    expect(panFor(0.2, 1080, 1080)).toBe(0.5);
    expect(panFor(0.9, 900, 1080)).toBe(0.5);
  });
});

describe("reframeZoom", () => {
  it("16:9→9:16: cara a la derecha desplaza el encuadre a la derecha, eje vertical centrado", () => {
    const z = reframeZoom({ x: 0.8, y: 0.5 }, 1920, 1080, 1080, 1920);
    expect(z.scale).toBeCloseTo(3.16, 2);
    expect(z.x).toBeGreaterThan(0.7);
    expect(z.y).toBeCloseTo(0.5, 5); // el vertical queda exactamente cubierto
  });
  it("cara centrada → encuadre centrado", () => {
    const z = reframeZoom({ x: 0.5, y: 0.5 }, 1920, 1080, 1080, 1920);
    expect(z.x).toBeCloseTo(0.5, 2);
  });
});

describe("groupSamples", () => {
  it("muestras estables → un solo segmento que cubre el recorte", () => {
    const s = [
      { t: 0, x: 0.5, y: 0.5 },
      { t: 1, x: 0.52, y: 0.5 },
      { t: 2, x: 0.49, y: 0.5 },
    ];
    const g = groupSamples(s, 0, 3);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ start: 0, end: 3 });
    expect(g[0].x).toBeCloseTo(0.503, 2);
  });

  it("un salto grande de la cara abre un segmento nuevo", () => {
    const s = [
      { t: 0, x: 0.2, y: 0.5 },
      { t: 1, x: 0.2, y: 0.5 },
      { t: 2, x: 0.8, y: 0.5 },
      { t: 3, x: 0.8, y: 0.5 },
    ];
    const g = groupSamples(s, 0, 4, { minSeg: 0.3 });
    expect(g.length).toBe(2);
    expect(g[0].start).toBe(0);
    expect(g[g.length - 1].end).toBe(4);
    expect(g[0].x).toBeCloseTo(0.2, 2);
    expect(g[1].x).toBeCloseTo(0.8, 2);
  });

  it("sin muestras → un segmento centrado en todo el recorte", () => {
    expect(groupSamples([], 0, 5)).toEqual([{ start: 0, end: 5, x: 0.5, y: 0.5 }]);
  });
});

describe("buildReframeSegments", () => {
  it("produce segmentos con encuadre listo, cubriendo el recorte", () => {
    const samples = [
      { t: 0, x: 0.3, y: 0.5 },
      { t: 1, x: 0.3, y: 0.5 },
      { t: 2, x: 0.75, y: 0.5 },
      { t: 3, x: 0.75, y: 0.5 },
    ];
    const segs = buildReframeSegments(samples, { trimIn: 0, trimOut: 4 }, { width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { minSeg: 0.3 });
    expect(segs.length).toBe(2);
    expect(segs[0].start).toBe(0);
    expect(segs[segs.length - 1].end).toBe(4);
    expect(segs[0].zoom.scale).toBeCloseTo(3.16, 2);
    // la cara más a la derecha → encuadre más a la derecha
    expect(segs[1].zoom.x).toBeGreaterThan(segs[0].zoom.x);
  });
});
