import { describe, expect, it } from "vitest";
import { clamp01, toNorm, toPx } from "./normalized";

describe("normalized", () => {
  it("convierte de normalizado a píxeles y vuelta", () => {
    expect(toPx(0.5, 1080)).toBe(540);
    expect(toNorm(540, 1080)).toBe(0.5);
  });

  it("toNorm devuelve 0 si la dimensión es 0", () => {
    expect(toNorm(100, 0)).toBe(0);
  });

  it("clamp01 limita a 0–1", () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(1.7)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });
});
