import { describe, expect, it } from "vitest";
import { censorWord, censorCues } from "./profanity";

describe("censorWord", () => {
  it("censura el núcleo conservando puntuación y mayúscula inicial", () => {
    expect(censorWord("mierda")).toBe("m*****");
    expect(censorWord("Mierda!")).toBe("M*****!");
    expect(censorWord("¡puta?")).toBe("¡p***?");
  });
  it("no toca palabras normales", () => {
    expect(censorWord("hola")).toBe("hola");
    expect(censorWord("Spain")).toBe("Spain");
  });
  it("es insensible a mayúsculas para detectar", () => {
    expect(censorWord("JODER")).toBe("J****");
  });
});

describe("censorCues", () => {
  it("censura las palabras de todas las cues sin tocar los tiempos", () => {
    const cues = [
      { id: "c0", words: [
        { text: "menudo", start: 0, end: 0.5 },
        { text: "cabrón", start: 0.5, end: 1 },
      ] },
    ];
    const out = censorCues(cues);
    expect(out[0].words[0].text).toBe("menudo");
    expect(out[0].words[1].text).toBe("c*****");
    expect(out[0].words[1].start).toBe(0.5);
  });
});
