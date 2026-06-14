import { describe, expect, it } from "vitest";
import { isNvencFailure, parseFfmpegTime, pruneJobMap, sanitizeFileName } from "./exportJobs.js";

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

describe("pruneJobMap", () => {
  const term = (state: "done" | "running") => ({ state }) as { state: "done" | "running" };

  it("descarta los terminados más antiguos hasta no superar el máximo", () => {
    const m = new Map<string, { state: "done" | "running" }>();
    for (let i = 0; i < 5; i++) m.set(`j${i}`, term("done"));
    pruneJobMap(m, 3);
    expect(m.size).toBe(3);
    // se quedan los 3 más recientes (orden de inserción)
    expect([...m.keys()]).toEqual(["j2", "j3", "j4"]);
  });

  it("nunca borra jobs en curso aunque se supere el máximo", () => {
    const m = new Map<string, { state: "done" | "running" }>();
    m.set("a", term("running"));
    m.set("b", term("running"));
    m.set("c", term("done"));
    pruneJobMap(m, 1);
    // solo se puede borrar el terminado; los running se mantienen
    expect([...m.keys()]).toEqual(["a", "b"]);
  });
});

describe("isNvencFailure", () => {
  it("detecta errores típicos de NVENC/CUDA para reintentar en CPU", () => {
    expect(isNvencFailure("[h264_nvenc @ 0x..] No capable devices found")).toBe(true);
    expect(isNvencFailure("Cannot load nvcuda.dll")).toBe(true);
    expect(isNvencFailure("OpenEncodeSessionEx failed: out of memory")).toBe(true);
    expect(isNvencFailure("Driver does not support the required nvenc API version")).toBe(true);
  });

  it("no confunde errores genéricos con fallos de NVENC", () => {
    expect(isNvencFailure("No such file or directory")).toBe(false);
    expect(isNvencFailure("Invalid filtergraph")).toBe(false);
  });
});
