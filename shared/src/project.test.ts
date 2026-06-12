import { describe, expect, it } from "vitest";
import {
  ASPECT_PRESETS,
  createAudioTrack,
  createEmptyProject,
  createTextOverlay,
  projectSchema,
} from "./project.js";

describe("createEmptyProject", () => {
  it("crea un proyecto 9:16 válido según el esquema", () => {
    const p = createEmptyProject("mi proyecto");
    expect(p.name).toBe("mi proyecto");
    expect(p.settings).toEqual({ aspect: "9:16", width: 1080, height: 1920, fps: 30 });
    expect(p.tracks).toEqual({ video: [], text: [], image: [], audio: [] });
    expect(projectSchema.safeParse(p).success).toBe(true);
  });
});

describe("projectSchema", () => {
  it("rechaza un aspect desconocido", () => {
    const p = { ...createEmptyProject("x"), settings: { aspect: "21:9", width: 100, height: 100, fps: 30 } };
    expect(projectSchema.safeParse(p).success).toBe(false);
  });

  it("rechaza coordenadas normalizadas fuera de 0–1", () => {
    const p = createEmptyProject("x");
    p.tracks.text.push({ ...createTextOverlay(0), x: 1.5 });
    expect(projectSchema.safeParse(p).success).toBe(false);
  });

  it("rechaza trimOut anterior a trimIn en un clip de vídeo", () => {
    const p = createEmptyProject("x");
    p.tracks.video.push({
      id: "v1", clipId: "c1", timelineStart: 0, trimIn: 5, trimOut: 2, speed: 1,
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
    });
    expect(projectSchema.safeParse(p).success).toBe(false);
  });
});

describe("createAudioTrack", () => {
  it("crea una pista válida según el esquema", () => {
    const p = createEmptyProject("x");
    p.tracks.audio.push(createAudioTrack("a1", "a1.mp3", 2, 30));
    expect(projectSchema.safeParse(p).success).toBe(true);
    expect(p.tracks.audio[0].end).toBe(32);
  });
});

describe("ASPECT_PRESETS", () => {
  it("tiene los cuatro formatos aprobados", () => {
    expect(ASPECT_PRESETS["9:16"]).toEqual({ width: 1080, height: 1920 });
    expect(ASPECT_PRESETS["16:9"]).toEqual({ width: 1920, height: 1080 });
    expect(ASPECT_PRESETS["1:1"]).toEqual({ width: 1080, height: 1080 });
    expect(ASPECT_PRESETS["4:5"]).toEqual({ width: 1080, height: 1350 });
  });
});
