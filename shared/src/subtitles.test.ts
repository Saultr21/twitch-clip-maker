import { describe, expect, it } from "vitest";
import { createSubtitleCue, DEFAULT_SUBTITLE_STYLE, subtitlesSchema } from "./subtitles.js";

describe("subtitlesSchema", () => {
  it("acepta cues con palabras y el estilo por defecto", () => {
    const cue = createSubtitleCue([
      { text: "Hola", start: 0, end: 0.4 },
      { text: "mundo", start: 0.4, end: 0.9 },
    ]);
    const subs = { cues: [cue], style: DEFAULT_SUBTITLE_STYLE };
    expect(subtitlesSchema.safeParse(subs).success).toBe(true);
  });

  it("rechaza una cue sin palabras", () => {
    const subs = { cues: [{ id: "c1", words: [] }], style: DEFAULT_SUBTITLE_STYLE };
    expect(subtitlesSchema.safeParse(subs).success).toBe(false);
  });

  it("rechaza un color de estilo no hex", () => {
    const subs = { cues: [], style: { ...DEFAULT_SUBTITLE_STYLE, highlight: "rojo" } };
    expect(subtitlesSchema.safeParse(subs).success).toBe(false);
  });

  it("aplica el valor por defecto cuando subtitles está ausente", () => {
    const parsed = subtitlesSchema.parse(undefined);
    expect(parsed.cues).toEqual([]);
    expect(parsed.style.highlight).toBe("#9146ff");
  });
});
