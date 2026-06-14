import { describe, expect, it } from "vitest";
import { needsTranscode } from "./uploadVideo.js";

describe("needsTranscode", () => {
  it("conserva mp4 con H.264 y webm con códecs web", () => {
    expect(needsTranscode("mp4", "h264")).toBe(false);
    expect(needsTranscode("webm", "vp9")).toBe(false);
    expect(needsTranscode("webm", "vp8")).toBe(false);
    expect(needsTranscode("webm", "av1")).toBe(false);
  });

  it("transcodifica contenedores no-web o códecs no reproducibles", () => {
    expect(needsTranscode("mov", "h264")).toBe(true); // mov: a mp4
    expect(needsTranscode("mkv", "h264")).toBe(true);
    expect(needsTranscode("avi", "mpeg4")).toBe(true);
    expect(needsTranscode("mp4", "hevc")).toBe(true); // HEVC en mp4: no reproducible
    expect(needsTranscode("webm", "vp7")).toBe(true);
    expect(needsTranscode("mp4", null)).toBe(true);
  });

  it("es indiferente a mayúsculas en la extensión", () => {
    expect(needsTranscode("MP4", "h264")).toBe(false);
  });
});
