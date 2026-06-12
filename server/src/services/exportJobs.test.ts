import { describe, expect, it } from "vitest";
import { parseFfmpegTime, sanitizeFileName } from "./exportJobs.js";

describe("parseFfmpegTime", () => {
  it("extrae los segundos de una línea de progreso de stderr", () => {
    expect(
      parseFfmpegTime("frame=  120 fps= 30 q=28.0 size=512kB time=00:00:04.50 bitrate=900kbits/s"),
    ).toBe(4.5);
  });

  it("soporta horas y minutos", () => {
    expect(parseFfmpegTime("time=01:02:03.25")).toBe(3723.25);
  });

  it("con varias líneas en el mismo chunk se queda con el último time=", () => {
    expect(parseFfmpegTime("time=00:00:01.00 ...\ntime=00:00:02.50 ...")).toBe(2.5);
  });

  it("devuelve null si la línea no tiene time=", () => {
    expect(parseFfmpegTime("Stream mapping:")).toBeNull();
    expect(parseFfmpegTime("")).toBeNull();
  });
});

describe("sanitizeFileName", () => {
  it("limpia separadores y fuerza extensión mp4", () => {
    expect(sanitizeFileName("mi vídeo!! (final)")).toBe("mi vídeo final.mp4");
    expect(sanitizeFileName("../../etc/passwd")).toBe("etcpasswd.mp4");
    expect(sanitizeFileName("clip.mp4")).toBe("clip.mp4");
  });

  it("lanza con nombres vacíos tras sanear", () => {
    expect(() => sanitizeFileName("../..")).toThrow();
  });
});
