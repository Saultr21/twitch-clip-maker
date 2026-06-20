import { describe, expect, it } from "vitest";
import {
  ASPECT_PRESETS,
  allVideoClips,
  createAudioTrack,
  createEmptyProject,
  createTextOverlay,
  createVideoTrack,
  migrateProject,
  projectSchema,
} from "./project.js";

describe("createEmptyProject", () => {
  it("crea un proyecto 9:16 válido según el esquema", () => {
    const p = createEmptyProject("mi proyecto");
    expect(p.name).toBe("mi proyecto");
    expect(p.settings.aspect).toBe("9:16");
    expect(p.settings.width).toBe(1080);
    expect(p.settings.height).toBe(1920);
    expect(p.settings.fps).toBe(30);
    expect(p.settings.background.type).toBe("black");
    expect(p.tracks.video).toHaveLength(1);
    expect(p.tracks.video[0].clips).toEqual([]);
    expect(p.tracks.text).toEqual([]);
    expect(p.tracks.image).toEqual([]);
    expect(p.tracks.audio).toEqual([]);
    expect(projectSchema.safeParse(p).success).toBe(true);
  });

  it("un proyecto guardado sin background sigue validando (background por defecto)", () => {
    const p = createEmptyProject("x") as { settings: Record<string, unknown> };
    delete p.settings.background;
    const parsed = projectSchema.safeParse(p);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.settings.background.type).toBe("black");
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
    p.tracks.video[0].clips.push({
      id: "v1", clipId: "c1", timelineStart: 0, trimIn: 5, trimOut: 2, speed: 1,
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
      crop: null, opacity: 1,
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

describe("allVideoClips", () => {
  it("aplana los clips de todas las pistas en orden", () => {
    const p = createEmptyProject("x");
    p.tracks.video[0].clips.push({
      id: "v1", clipId: "c1", timelineStart: 0, trimIn: 0, trimOut: 4, speed: 1,
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
      crop: null, opacity: 1,
    });
    p.tracks.video.push({ id: "t2", name: "", clips: [{
      id: "v2", clipId: "c2", timelineStart: 1, trimIn: 0, trimOut: 4, speed: 1,
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
      crop: null, opacity: 1,
    }] });
    expect(allVideoClips(p).map((c) => c.id)).toEqual(["v1", "v2"]);
  });
});

// Construye un proyecto v1 válido a partir de uno v2 (degradándolo): así el resto
// de subesquemas (settings/subtitles) son por definición válidos y el test solo
// prueba la migración de tracks.video.
function makeV1WithClip() {
  const v2 = createEmptyProject("viejo") as unknown as Record<string, any>;
  const clip = {
    id: "v1", clipId: "c1", timelineStart: 0, trimIn: 0, trimOut: 4, speed: 1,
    zoom: { x: 0.5, y: 0.5, scale: 1 },
    filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
    crop: null,
  };
  return { ...v2, version: 1, tracks: { ...v2.tracks, video: [clip] } };
}

describe("migrateProject", () => {
  it("envuelve el tracks.video plano de v1 en una sola pista (v2)", () => {
    const migrated = projectSchema.parse(migrateProject(makeV1WithClip()));
    expect(migrated.version).toBe(2);
    expect(migrated.tracks.video).toHaveLength(1);
    expect(migrated.tracks.video[0].clips.map((c) => c.id)).toEqual(["v1"]);
    expect(migrated.tracks.video[0].clips[0].opacity).toBe(1); // default aplicado
  });

  it("deja intacto un proyecto que ya es v2", () => {
    const p = createEmptyProject("x");
    expect(migrateProject(p)).toBe(p);
  });
});
