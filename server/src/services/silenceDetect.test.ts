import { describe, expect, it } from "vitest";
import { parseSilenceLog } from "./silenceDetect.js";

describe("parseSilenceLog", () => {
  it("empareja silence_start/silence_end en rangos", () => {
    const log = [
      "[silencedetect @ 0x] silence_start: 0.999977",
      "[silencedetect @ 0x] silence_end: 2.50005 | silence_duration: 1.50007",
      "[silencedetect @ 0x] silence_start: 3.49998",
      "[silencedetect @ 0x] silence_end: 5.00005 | silence_duration: 1.50007",
    ].join("\n");
    expect(parseSilenceLog(log)).toEqual([
      { start: 0.999977, end: 2.50005 },
      { start: 3.49998, end: 5.00005 },
    ]);
  });

  it("ignora un silence_start sin su end (fin de archivo abierto)", () => {
    const log = "silence_start: 1.0\nsilence_end: 2.0\nsilence_start: 4.0";
    expect(parseSilenceLog(log)).toEqual([{ start: 1, end: 2 }]);
  });

  it("descarta rangos degenerados y recorta inicios negativos a 0", () => {
    const log = "silence_start: -0.001\nsilence_end: 0\nsilence_start: 1\nsilence_end: 1";
    expect(parseSilenceLog(log)).toEqual([]);
  });

  it("sin coincidencias devuelve vacío", () => {
    expect(parseSilenceLog("nada que ver aquí")).toEqual([]);
  });
});
