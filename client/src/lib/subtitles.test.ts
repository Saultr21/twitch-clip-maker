import { describe, expect, it } from "vitest";
import type { SubtitleCue } from "@clipforge/shared";
import {
  activeWordIndex,
  cueEnd,
  cueStart,
  redistributeWordTimes,
  scaleCueWords,
  shiftCueWords,
} from "./subtitles";

const cue: SubtitleCue = {
  id: "c1",
  words: [
    { text: "Hola", start: 1, end: 1.4 },
    { text: "mundo", start: 1.4, end: 2 },
  ],
};

describe("bounds y palabra activa", () => {
  it("cueStart/cueEnd usan la primera y última palabra", () => {
    expect(cueStart(cue)).toBe(1);
    expect(cueEnd(cue)).toBe(2);
  });

  it("activeWordIndex encuentra la palabra bajo el instante (o -1)", () => {
    expect(activeWordIndex(cue, 1.2)).toBe(0);
    expect(activeWordIndex(cue, 1.6)).toBe(1);
    expect(activeWordIndex(cue, 5)).toBe(-1);
  });
});

describe("shiftCueWords", () => {
  it("desplaza todas las palabras por delta sin bajar de 0", () => {
    const r = shiftCueWords(cue, 2);
    expect(r.words[0]).toEqual({ text: "Hola", start: 3, end: 3.4 });
    const back = shiftCueWords(cue, -5);
    expect(back.words[0].start).toBe(0); // recortado a 0
  });
});

describe("scaleCueWords", () => {
  it("remapea linealmente las palabras al nuevo rango", () => {
    const r = scaleCueWords(cue, 0, 4); // duración 1→4, x4
    expect(r.words[0].text).toBe("Hola");
    expect(r.words[0].start).toBe(0);
    expect(r.words[0].end).toBeCloseTo(1.6, 5);
    expect(r.words[1].text).toBe("mundo");
    expect(r.words[1].start).toBeCloseTo(1.6, 5);
    expect(r.words[1].end).toBe(4);
  });
});

describe("redistributeWordTimes", () => {
  it("reparte el rango de la cue entre las palabras del nuevo texto", () => {
    const r = redistributeWordTimes(cue, "uno dos tres");
    expect(r.words.map((w) => w.text)).toEqual(["uno", "dos", "tres"]);
    expect(r.words[0].start).toBe(1);
    expect(r.words[2].end).toBe(2);
    // tres palabras en [1,2] → ~0.333 cada una
    expect(r.words[1].start).toBeCloseTo(1.333, 2);
  });

  it("texto vacío deja una palabra vacía que cubre todo el rango", () => {
    const r = redistributeWordTimes(cue, "   ");
    expect(r.words).toHaveLength(1);
    expect(r.words[0]).toEqual({ text: "", start: 1, end: 2 });
  });
});
