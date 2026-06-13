import { describe, expect, it } from "vitest";
import { parseWhisperJson } from "./parseWhisperJson.js";

const sample = {
  transcription: [
    {
      offsets: { from: 0, to: 1200 },
      text: " Hola mundo",
      tokens: [
        { text: "[_BEG_]", offsets: { from: 0, to: 0 } },
        { text: " Ho", offsets: { from: 0, to: 200 } },
        { text: "la", offsets: { from: 200, to: 400 } },
        { text: " mundo", offsets: { from: 400, to: 1200 } },
      ],
    },
    {
      offsets: { from: 1200, to: 2000 },
      text: " adiós",
      tokens: [{ text: " adiós", offsets: { from: 1200, to: 2000 } }],
    },
  ],
};

describe("parseWhisperJson", () => {
  it("agrupa tokens en palabras y segmentos en cues, en SEGUNDOS", () => {
    const cues = parseWhisperJson(JSON.stringify(sample));
    expect(cues).toHaveLength(2);
    expect(cues[0].words.map((w) => w.text)).toEqual(["Hola", "mundo"]);
    expect(cues[0].words[0]).toEqual({ text: "Hola", start: 0, end: 0.4 });
    expect(cues[0].words[1]).toEqual({ text: "mundo", start: 0.4, end: 1.2 });
    expect(cues[1].words[0]).toEqual({ text: "adiós", start: 1.2, end: 2 });
  });

  it("descarta tokens especiales y segmentos sin palabras reales", () => {
    const onlySpecial = {
      transcription: [
        { offsets: { from: 0, to: 100 }, text: "", tokens: [{ text: "[_TT_5]", offsets: { from: 0, to: 100 } }] },
      ],
    };
    expect(parseWhisperJson(JSON.stringify(onlySpecial))).toEqual([]);
  });

  it("descarta anotaciones entre corchetes aunque lleven espacio delante", () => {
    const music = {
      transcription: [
        {
          offsets: { from: 0, to: 8000 },
          text: " [Música]",
          tokens: [{ text: " [Música]", offsets: { from: 0, to: 8000 } }],
        },
        {
          offsets: { from: 8000, to: 9000 },
          text: " (aplausos)",
          tokens: [{ text: " (aplausos)", offsets: { from: 8000, to: 9000 } }],
        },
      ],
    };
    expect(parseWhisperJson(JSON.stringify(music))).toEqual([]);
  });

  it("descarta una anotación reensamblada desde varios tokens y quita el guion de turno", () => {
    const split = {
      transcription: [
        {
          offsets: { from: 0, to: 8000 },
          text: " (música)",
          tokens: [
            { text: " (", offsets: { from: 0, to: 100 } },
            { text: "música", offsets: { from: 100, to: 7000 } },
            { text: ")", offsets: { from: 7000, to: 8000 } },
          ],
        },
        {
          offsets: { from: 8000, to: 9000 },
          text: " -Hola",
          tokens: [{ text: " -Hola", offsets: { from: 8000, to: 9000 } }],
        },
      ],
    };
    const cues = parseWhisperJson(JSON.stringify(split));
    expect(cues).toHaveLength(1); // la (música) se descarta
    expect(cues[0].words[0].text).toBe("Hola"); // sin el guion de cambio de turno
  });

  it("ancla los tiempos al offset del segmento cuando los tokens son relativos (VAD/DTW)", () => {
    // con VAD los offsets de token empiezan en 0 aunque la voz esté a 9.76s;
    // el offset del segmento sí es el tiempo real
    const vad = {
      transcription: [
        {
          offsets: { from: 9760, to: 13330 },
          text: " Only one moment.",
          tokens: [
            { text: "[_BEG_]", offsets: { from: 0, to: 0 } },
            { text: " Only", offsets: { from: 0, to: 370 } },
            { text: " one", offsets: { from: 370, to: 650 } },
            { text: " moment", offsets: { from: 650, to: 1210 } },
          ],
        },
      ],
    };
    const cues = parseWhisperJson(JSON.stringify(vad));
    expect(cues).toHaveLength(1);
    const w = cues[0].words;
    // la 1.ª palabra se ancla a 9.76s (no a 0) y se conservan las duraciones
    expect(w[0].text).toBe("Only");
    expect(w[0].start).toBeCloseTo(9.76, 5);
    expect(w[0].end).toBeCloseTo(10.13, 5);
    expect(w[1].text).toBe("one");
    expect(w[1].start).toBeCloseTo(10.13, 5);
    expect(w[2].text).toBe("moment");
    expect(w[2].end).toBeCloseTo(10.97, 5);
  });

  it("lanza con JSON inválido", () => {
    expect(() => parseWhisperJson("{no json")).toThrow();
  });
});
