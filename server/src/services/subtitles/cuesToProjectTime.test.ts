import { describe, expect, it } from "vitest";
import type { SubtitleCue, VideoClip } from "@clipforge/shared";
import { cuesToProjectTime } from "./cuesToProjectTime.js";

function clip(over: Partial<VideoClip>): VideoClip {
  return {
    id: "v1", clipId: "c1", timelineStart: 10, trimIn: 2, trimOut: 8, speed: 1,
    zoom: { x: 0.5, y: 0.5, scale: 1 },
    filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
    crop: null,
    ...over,
  };
}

const cues: SubtitleCue[] = [
  { id: "a", words: [{ text: "fuera", start: 0, end: 1 }] }, // antes de trimIn=2 → se descarta
  { id: "b", words: [{ text: "dentro", start: 3, end: 5 }] }, // 3→ proyecto 10+(3-2)=11
];

describe("cuesToProjectTime", () => {
  it("desplaza al tiempo de proyecto y descarta palabras fuera del recorte", () => {
    const r = cuesToProjectTime(cues, clip({}));
    expect(r).toHaveLength(1);
    expect(r[0].words[0]).toEqual({ text: "dentro", start: 11, end: 13 });
  });

  it("la velocidad comprime los tiempos", () => {
    const r = cuesToProjectTime(
      [{ id: "b", words: [{ text: "x", start: 4, end: 6 }] }],
      clip({ speed: 2 }),
    );
    // start: 10 + (4-2)/2 = 11 ; end: 10 + (6-2)/2 = 12
    expect(r[0].words[0]).toEqual({ text: "x", start: 11, end: 12 });
  });

  it("recorta palabras parcialmente dentro al borde del recorte", () => {
    const r = cuesToProjectTime(
      [{ id: "b", words: [{ text: "borde", start: 1, end: 3 }] }], // 1<trimIn=2
      clip({}),
    );
    // start recortado a trimIn=2 → proyecto 10 ; end 3 → 11
    expect(r[0].words[0]).toEqual({ text: "borde", start: 10, end: 11 });
  });
});
