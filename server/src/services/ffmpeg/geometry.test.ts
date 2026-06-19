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

  it("crop reduce el tamaño visible manteniendo la escala del frame completo", () => {
    // 16:9 en 9:16 a 1x ocupa 1080x608. Recortar al 50% de ancho/alto deja
    // 540x304 (misma escala, mitad de tamaño visible), NO se reescala a contain
    const r = renderRect(1080, 1920, 1920, 1080, { x: 0.5, y: 0.5, scale: 1 }, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(r.w).toBe(540);
    expect(r.h).toBe(304); // 608*0.5=304
  });

  it("crop permite posicionar el vídeo a los bordes (el límite usa el tamaño visible)", () => {
    // Mismo caso: con vW=540 < 1080, zoom.x=0 lo pega a la izquierda y zoom.x=1 a
    // la derecha (antes, con el frame completo de 1080, no había margen horizontal)
    const crop = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const izq = renderRect(1080, 1920, 1920, 1080, { x: 0, y: 0.5, scale: 1 }, crop);
    const der = renderRect(1080, 1920, 1920, 1080, { x: 1, y: 0.5, scale: 1 }, crop);
    expect(izq.left).toBe(0);
    expect(der.left).toBe(1080 - 540); // 540
  });
});
