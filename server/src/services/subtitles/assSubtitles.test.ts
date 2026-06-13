import { describe, expect, it } from "vitest";
import type { SubtitleCue, SubtitleStyle } from "@clipforge/shared";
import { hexToAssColor, toAssTime, buildAss } from "./assSubtitles.js";

const style: SubtitleStyle = {
  fontFamily: "Impact", fontSize: 0.05, fill: "#ffffff", highlight: "#9146ff",
  stroke: "#000000", strokeWidth: 0.004, y: 0.82, uppercase: true,
};

describe("hexToAssColor", () => {
  it("convierte #RRGGBB a &HBBGGRR&", () => {
    expect(hexToAssColor("#ffffff")).toBe("&HFFFFFF&");
    expect(hexToAssColor("#9146ff")).toBe("&HFF4691&");
  });
});

describe("toAssTime", () => {
  it("formatea segundos como h:mm:ss.cs", () => {
    expect(toAssTime(0)).toBe("0:00:00.00");
    expect(toAssTime(75.42)).toBe("0:01:15.42");
  });
});

describe("buildAss", () => {
  const cues: SubtitleCue[] = [
    { id: "c1", words: [
      { text: "Hola", start: 1, end: 1.5 },
      { text: "mundo", start: 1.5, end: 2 },
    ] },
  ];

  it("genera cabecera con PlayRes y una línea Dialogue por cue", () => {
    const ass = buildAss(cues, style, 1080, 1920);
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("Impact");
    expect(ass).toContain("Dialogue: 0,0:00:01.00,0:00:02.00,");
    // palabra en MAYÚSCULAS por uppercase
    expect(ass).toContain("HOLA");
    expect(ass).toContain("MUNDO");
    // override de resaltado por palabra (ms relativos: Hola 0–500, mundo 500–1000)
    expect(ass).toContain("\\t(0,0,\\c&HFF4691&)");
    expect(ass).toContain("\\t(500,500,\\c&HFFFFFF&)");
  });
});
