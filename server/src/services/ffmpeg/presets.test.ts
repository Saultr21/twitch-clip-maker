import { describe, expect, it } from "vitest";
import { buildFfmpegArgs } from "./presets.js";
import type { FilterGraph } from "./filterGraph.js";

const graph: FilterGraph = {
  inputs: [
    { kind: "video", fileName: "clip-1.mp4" },
    { kind: "image", fileName: "a1.png" },
  ],
  filterComplex: "[0:v]null[vcat]",
  videoLabel: "[vcat]",
  audioLabel: "[acat]",
  totalDuration: 5,
};

describe("buildFfmpegArgs", () => {
  it("monta inputs, filtro, maps y salida en orden", () => {
    const args = buildFfmpegArgs(graph, "tiktok", 30, "C:/data/exports/salida.mp4", {
      videoDir: "C:/data/clips",
      imageDir: "C:/data/assets",
    });
    expect(args.slice(0, 5)).toEqual(["-y", "-i", "C:/data/clips/clip-1.mp4", "-i", "C:/data/assets/a1.png"]);
    expect(args).toContain("-filter_complex");
    expect(args[args.indexOf("-filter_complex") + 1]).toBe("[0:v]null[vcat]");
    expect(args).toContain("-map");
    expect(args[args.indexOf("-map") + 1]).toBe("[vcat]");
    expect(args.at(-1)).toBe("C:/data/exports/salida.mp4");
  });

  it("tiktok usa bitrate 8M; youtube 12M; custom CRF 18", () => {
    const opts = { videoDir: "v", imageDir: "i" };
    const tiktok = buildFfmpegArgs(graph, "tiktok", 30, "out.mp4", opts);
    expect(tiktok[tiktok.indexOf("-b:v") + 1]).toBe("8M");
    const youtube = buildFfmpegArgs(graph, "youtube", 30, "out.mp4", opts);
    expect(youtube[youtube.indexOf("-b:v") + 1]).toBe("12M");
    const custom = buildFfmpegArgs(graph, "custom", 30, "out.mp4", opts);
    expect(custom[custom.indexOf("-crf") + 1]).toBe("18");
    expect(custom).not.toContain("-b:v");
  });

  it("incluye los flags comunes de compatibilidad", () => {
    const args = buildFfmpegArgs(graph, "tiktok", 60, "out.mp4", { videoDir: "v", imageDir: "i" });
    expect(args[args.indexOf("-r") + 1]).toBe("60");
    expect(args[args.indexOf("-c:v") + 1]).toBe("libx264");
    expect(args[args.indexOf("-pix_fmt") + 1]).toBe("yuv420p");
    expect(args[args.indexOf("-movflags") + 1]).toBe("+faststart");
    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
  });
});
