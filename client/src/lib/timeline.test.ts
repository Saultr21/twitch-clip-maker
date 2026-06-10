import { describe, expect, it } from "vitest";
import { createEmptyProject, createVideoClip, createTextOverlay } from "@clipforge/shared";
import {
  clipDuration,
  clipEnd,
  findSnapPoints,
  hasOverlap,
  projectDuration,
  snapTime,
  sourceTimeFor,
  splitVideoClip,
  videoClipAt,
} from "./timeline";

function clip(start: number, trimIn: number, trimOut: number) {
  const c = createVideoClip("c1", start, trimOut);
  return { ...c, trimIn, trimOut };
}

describe("duraciones", () => {
  it("clipDuration y clipEnd respetan el recorte", () => {
    const c = clip(2, 1, 5); // 4s de material desde t=2
    expect(clipDuration(c)).toBe(4);
    expect(clipEnd(c)).toBe(6);
  });

  it("projectDuration es el final más tardío de cualquier pista", () => {
    const p = createEmptyProject("x");
    p.tracks.video.push(clip(0, 0, 10));
    p.tracks.text.push({ ...createTextOverlay(8), end: 15 });
    expect(projectDuration(p)).toBe(15);
  });

  it("projectDuration de un proyecto vacío es 0", () => {
    expect(projectDuration(createEmptyProject("x"))).toBe(0);
  });
});

describe("videoClipAt y sourceTimeFor", () => {
  const a = clip(0, 0, 5);
  const b = clip(7, 2, 6); // hueco entre t=5 y t=7

  it("encuentra el clip activo en un instante", () => {
    expect(videoClipAt([a, b], 3)?.id).toBe(a.id);
    expect(videoClipAt([a, b], 8)?.id).toBe(b.id);
  });

  it("devuelve null en un hueco y al final", () => {
    expect(videoClipAt([a, b], 6)).toBeNull();
    expect(videoClipAt([a, b], 99)).toBeNull();
  });

  it("mapea tiempo de línea a tiempo de archivo fuente", () => {
    expect(sourceTimeFor(b, 8)).toBe(3); // trimIn 2 + (8-7)
  });
});

describe("hasOverlap", () => {
  const a = clip(0, 0, 5);
  it("detecta solapamiento y respeta excludeId", () => {
    expect(hasOverlap([a], 3, 4)).toBe(true);
    expect(hasOverlap([a], 5, 4)).toBe(false); // contiguo no solapa
    expect(hasOverlap([a], 3, 4, a.id)).toBe(false);
  });
});

describe("snapping", () => {
  it("findSnapPoints incluye 0 y los bordes de todos los bloques", () => {
    const p = createEmptyProject("x");
    const a = clip(2, 0, 5);
    p.tracks.video.push(a);
    const points = findSnapPoints(p, a.id);
    expect(points).toContain(0);
    expect(points).not.toContain(2); // los bordes del propio bloque excluido no cuentan
  });

  it("snapTime ajusta dentro del umbral y respeta fuera de él", () => {
    expect(snapTime(4.93, [5], 0.1)).toBe(5);
    expect(snapTime(4.7, [5], 0.1)).toBe(4.7);
  });
});

describe("splitVideoClip", () => {
  it("divide en dos clips contiguos que conservan el material", () => {
    const c = clip(2, 1, 9); // 8s desde t=2 hasta t=10
    const [left, right] = splitVideoClip(c, 5); // corte a 3s del inicio del bloque
    expect(left.trimIn).toBe(1);
    expect(left.trimOut).toBe(4);
    expect(left.timelineStart).toBe(2);
    expect(right.trimIn).toBe(4);
    expect(right.trimOut).toBe(9);
    expect(right.timelineStart).toBe(5);
    expect(right.id).not.toBe(left.id);
  });

  it("lanza si el corte cae fuera del bloque", () => {
    const c = clip(2, 1, 9);
    expect(() => splitVideoClip(c, 1)).toThrow();
    expect(() => splitVideoClip(c, 10)).toThrow();
  });
});
