import { describe, expect, it } from "vitest";
import { atempoChain } from "./speed.js";

describe("atempoChain", () => {
  it("velocidad 1 no genera filtros", () => {
    expect(atempoChain(1)).toEqual([]);
  });

  it("velocidades dentro del rango de atempo van directas", () => {
    expect(atempoChain(2)).toEqual(["atempo=2"]);
    expect(atempoChain(0.5)).toEqual(["atempo=0.5"]);
    expect(atempoChain(1.5)).toEqual(["atempo=1.5"]);
  });

  it("velocidades por debajo de 0.5 se encadenan", () => {
    expect(atempoChain(0.25)).toEqual(["atempo=0.5", "atempo=0.5"]);
    expect(atempoChain(0.4)).toEqual(["atempo=0.5", "atempo=0.8"]);
  });
});
