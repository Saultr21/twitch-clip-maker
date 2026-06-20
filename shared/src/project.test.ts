import { describe, expect, it } from "vitest";
import {
  ASPECT_PRESETS,
  allVideoClips,
  createAudioTrack,
  createEmptyProject,
  createImageLayer,
  createImageOverlay,
  createTextLayer,
  createTextOverlay,
  createVideoLayer,
  imageItems,
  migrateLayers,
  migrateProject,
  projectSchema,
  textItems,
  videoLayers,
} from "./project.js";
import { DEFAULT_SUBTITLE_STYLE } from "./subtitles.js";

describe("createEmptyProject", () => {
  it("crea un proyecto 9:16 válido según el esquema", () => {
    const p = createEmptyProject("mi proyecto");
    expect(p.name).toBe("mi proyecto");
    expect(p.settings.aspect).toBe("9:16");
    expect(p.settings.width).toBe(1080);
    expect(p.settings.height).toBe(1920);
    expect(p.settings.fps).toBe(30);
    expect(p.settings.background.type).toBe("black");
    expect(p.tracks.layers).toHaveLength(1);
    expect(p.tracks.layers[0]).toMatchObject({ kind: "video", clips: [] });
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

  it("rechaza coordenadas normalizadas fuera de 0–1 en un item de texto", () => {
    const p = createEmptyProject("x");
    const textLayer = createTextLayer();
    textLayer.items.push({ ...createTextOverlay(0), x: 1.5 });
    p.tracks.layers.push(textLayer);
    expect(projectSchema.safeParse(p).success).toBe(false);
  });

  it("rechaza trimOut anterior a trimIn en un clip de vídeo", () => {
    const p = createEmptyProject("x");
    const videoLayer = p.tracks.layers[0];
    if (videoLayer.kind !== "video") throw new Error("expected video layer");
    videoLayer.clips.push({
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
  it("aplana los clips de todas las capas de vídeo en orden", () => {
    const p = createEmptyProject("x");
    const firstLayer = p.tracks.layers[0];
    if (firstLayer.kind !== "video") throw new Error("expected video layer");
    firstLayer.clips.push({
      id: "v1", clipId: "c1", timelineStart: 0, trimIn: 0, trimOut: 4, speed: 1,
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
      crop: null, opacity: 1,
    });
    p.tracks.layers.push({ id: "t2", kind: "video", name: "", clips: [{
      id: "v2", clipId: "c2", timelineStart: 1, trimIn: 0, trimOut: 4, speed: 1,
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
      crop: null, opacity: 1,
    }] });
    expect(allVideoClips(p).map((c) => c.id)).toEqual(["v1", "v2"]);
  });
});

const RAW_SETTINGS = {
  aspect: "9:16",
  width: 1080,
  height: 1920,
  fps: 30,
  background: { type: "black", color: "#000000", blur: 0.5 },
  audioDucking: false,
  fadeIn: 0,
  fadeOut: 0,
  clipTransition: 0,
} as const;

const RAW_SUBTITLES = {
  cues: [],
  style: { ...DEFAULT_SUBTITLE_STYLE },
  maxWordsPerCue: 8,
} as const;

// Construye un proyecto v2 válido (con la nueva estructura v3 como base pero degradado a v2)
// para probar migrateProject (v1→v2). migrateProject ahora lleva a v2, migrateLayers lleva a v3.
function makeV1WithClip() {
  // Usamos un objeto raw directamente (no createEmptyProject que da v3)
  const clip = {
    id: "v1", clipId: "c1", timelineStart: 0, trimIn: 0, trimOut: 4, speed: 1,
    zoom: { x: 0.5, y: 0.5, scale: 1 },
    filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
    crop: null,
  };
  return {
    id: "proj1",
    name: "viejo",
    version: 1,
    settings: { ...RAW_SETTINGS },
    tracks: { video: [clip], text: [], image: [], audio: [] },
    originalAudioVolume: 1,
    subtitles: { ...RAW_SUBTITLES },
  };
}

describe("migrateProject", () => {
  it("envuelve el tracks.video plano de v1 en una sola pista (v2)", () => {
    // migrateProject solo lleva a v2 — la validación con projectSchema v3 requiere también migrateLayers
    const migratedV2 = migrateProject(makeV1WithClip()) as Record<string, any>;
    expect(migratedV2.version).toBe(2);
    expect(migratedV2.tracks.video).toHaveLength(1);
    expect(migratedV2.tracks.video[0].clips[0].id).toBe("v1");
    // Encadenado con migrateLayers lleva a v3 válido
    const migrated = projectSchema.parse(migrateLayers(migratedV2));
    expect(migrated.version).toBe(3);
  });

  it("deja intacto un proyecto que ya es v2", () => {
    const v2raw = {
      id: "p1", name: "x", version: 2,
      settings: { ...RAW_SETTINGS },
      tracks: { video: [{ id: "t1", name: "", clips: [] }], text: [], image: [], audio: [] },
      originalAudioVolume: 1,
      subtitles: { ...RAW_SUBTITLES },
    };
    expect(migrateProject(v2raw)).toBe(v2raw);
  });

  it("devuelve sin tocar entradas de versión desconocida o malformadas", () => {
    const v4 = { version: 4, tracks: {} };
    expect(migrateProject(v4)).toBe(v4);
    expect(migrateProject(null)).toBe(null);
    expect(migrateProject("corrupto")).toBe("corrupto");
  });

  it("no aliasa el array de clips del proyecto de entrada (independencia para Immer)", () => {
    const v1 = makeV1WithClip();
    const migrated = migrateProject(v1) as { tracks: { video: { clips: unknown[] }[] } };
    expect(migrated.tracks.video[0].clips).not.toBe(v1.tracks.video);
    expect(migrated.tracks.video[0].clips[0]).not.toBe(v1.tracks.video[0]);
  });
});

describe("capas — selectores", () => {
  it("createEmptyProject arranca con una capa de vídeo vacía", () => {
    const p = createEmptyProject("x");
    expect(p.tracks.layers).toHaveLength(1);
    expect(p.tracks.layers[0]).toMatchObject({ kind: "video", clips: [] });
    expect(p.tracks.audio).toEqual([]);
    expect(projectSchema.safeParse(p).success).toBe(true);
  });
  it("selectores reconstruyen vistas por tipo en orden", () => {
    const p = createEmptyProject("x");
    p.tracks.layers.push({ id: "i1", kind: "image", name: "", items: [
      createImageOverlay("a", "a.png", 0, 0.2, 0.2),
    ] });
    p.tracks.layers.push({ id: "t1", kind: "text", name: "", items: [createTextOverlay(0)] });
    expect(videoLayers(p)).toHaveLength(1);
    expect(imageItems(p)).toHaveLength(1);
    expect(textItems(p)).toHaveLength(1);
    expect(allVideoClips(p)).toEqual([]);
  });
});

describe("migrateLayers", () => {
  it("convierte v2 (video/image/text) en v3 con capas en orden vídeo→imagen→texto", () => {
    const v2 = {
      id: "p1", name: "x", version: 2,
      settings: { ...RAW_SETTINGS },
      tracks: {
        video: [{ id: "tk", name: "", clips: [] }],
        image: [createImageOverlay("a", "a.png", 0, 0.2, 0.2)],
        text: [createTextOverlay(0)],
        audio: [],
      },
      originalAudioVolume: 1,
      subtitles: { ...RAW_SUBTITLES },
    };
    const migrated = projectSchema.parse(migrateLayers(v2));
    expect(migrated.version).toBe(3);
    const kinds = migrated.tracks.layers.map((l) => l.kind);
    expect(kinds).toEqual(["video", "image", "text"]); // vídeo atrás, texto al frente
  });
  it("idempotente: un proyecto v3 se devuelve igual", () => {
    const p = createEmptyProject("x");
    expect(migrateLayers(p)).toBe(p);
  });
});
