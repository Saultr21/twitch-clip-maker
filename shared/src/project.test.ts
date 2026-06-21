import { describe, expect, it } from "vitest";
import {
  ASPECT_PRESETS,
  allVideoClips,
  createAudioTrack,
  createEmptyProject,
  createImageLayer,
  createImageOverlay,
  createMediaLayer,
  createTextLayer,
  createTextOverlay,
  createVideoLayer,
  imageItems,
  layerItems,
  mediaLayers,
  migrateMedia,
  migrateLayers,
  migrateProject,
  projectSchema,
  textItems,
  videoLayers,
} from "./project.js";
import { DEFAULT_SUBTITLE_STYLE } from "./subtitles.js";

describe("createEmptyProject", () => {
  it("crea un proyecto 9:16 válido según el esquema v4", () => {
    const p = createEmptyProject("mi proyecto");
    expect(p.name).toBe("mi proyecto");
    expect(p.version).toBe(4);
    expect(p.settings.aspect).toBe("9:16");
    expect(p.settings.width).toBe(1080);
    expect(p.settings.height).toBe(1920);
    expect(p.settings.fps).toBe(30);
    expect(p.settings.background.type).toBe("black");
    expect(p.tracks.layers).toHaveLength(1);
    expect(p.tracks.layers[0]).toMatchObject({ items: [] });
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

describe("projectSchema v4", () => {
  it("rechaza un aspect desconocido", () => {
    const p = { ...createEmptyProject("x"), settings: { aspect: "21:9", width: 100, height: 100, fps: 30 } };
    expect(projectSchema.safeParse(p).success).toBe(false);
  });

  it("rechaza coordenadas normalizadas fuera de 0–1 en un item de texto", () => {
    const p = createEmptyProject("x");
    p.tracks.layers[0].items.push({ ...createTextOverlay(0), kind: "text", x: 1.5 });
    expect(projectSchema.safeParse(p).success).toBe(false);
  });

  it("rechaza trimOut anterior a trimIn en un elemento de vídeo", () => {
    const p = createEmptyProject("x");
    p.tracks.layers[0].items.push({
      kind: "video",
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
  it("aplana los items de vídeo de todas las capas en orden", () => {
    const p = createEmptyProject("x");
    p.tracks.layers[0].items.push({
      kind: "video",
      id: "v1", clipId: "c1", timelineStart: 0, trimIn: 0, trimOut: 4, speed: 1,
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
      crop: null, opacity: 1,
    });
    p.tracks.layers.push({
      id: "layer2", name: "", items: [{
        kind: "video",
        id: "v2", clipId: "c2", timelineStart: 1, trimIn: 0, trimOut: 4, speed: 1,
        zoom: { x: 0.5, y: 0.5, scale: 1 },
        filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
        crop: null, opacity: 1,
      }],
    });
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

// Construye un proyecto v1 válido para probar migrateProject (v1→v2).
function makeV1WithClip() {
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
    const migratedV2 = migrateProject(makeV1WithClip()) as Record<string, any>;
    expect(migratedV2.version).toBe(2);
    expect(migratedV2.tracks.video).toHaveLength(1);
    expect(migratedV2.tracks.video[0].clips[0].id).toBe("v1");
    // Encadenado con migrateLayers+migrateMedia lleva a v4 válido
    const migrated = projectSchema.parse(migrateMedia(migrateLayers(migratedV2)));
    expect(migrated.version).toBe(4);
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
    const v5 = { version: 5, tracks: {} };
    expect(migrateProject(v5)).toBe(v5);
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

describe("capas media — selectores v4", () => {
  it("createEmptyProject arranca con una MediaLayer vacía (v4)", () => {
    const p = createEmptyProject("x");
    expect(p.version).toBe(4);
    expect(p.tracks.layers).toHaveLength(1);
    expect(p.tracks.layers[0]).toMatchObject({ items: [] });
    expect(p.tracks.audio).toEqual([]);
    expect(projectSchema.safeParse(p).success).toBe(true);
  });

  it("mediaLayers devuelve todas las capas del proyecto", () => {
    const p = createEmptyProject("x");
    const layer2 = createMediaLayer("capa2");
    p.tracks.layers.push(layer2);
    expect(mediaLayers(p)).toHaveLength(2);
  });

  it("layerItems devuelve los items de una capa", () => {
    const layer = createMediaLayer("test");
    const text = { ...createTextOverlay(0), kind: "text" as const };
    layer.items.push(text);
    expect(layerItems(layer)).toHaveLength(1);
  });

  it("allVideoClips, imageItems, textItems filtran por kind entre todas las capas", () => {
    const p = createEmptyProject("x");
    p.tracks.layers[0].items.push(
      { kind: "video", id: "v1", clipId: "c1", timelineStart: 0, trimIn: 0, trimOut: 4,
        speed: 1, zoom: { x: 0.5, y: 0.5, scale: 1 },
        filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
        crop: null, opacity: 1 },
      { ...createImageOverlay("a", "a.png", 0, 0.2, 0.2), kind: "image" as const },
      { ...createTextOverlay(0), kind: "text" as const },
    );
    expect(allVideoClips(p)).toHaveLength(1);
    expect(imageItems(p)).toHaveLength(1);
    expect(textItems(p)).toHaveLength(1);
  });

  it("videoLayers/imageLayers/textLayers devuelven [] (deprecadas en v4)", () => {
    const p = createEmptyProject("x");
    expect(videoLayers(p)).toEqual([]);
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
    const v3 = migrateLayers(v2) as Record<string, any>;
    expect(v3.version).toBe(3);
    const kinds = v3.tracks.layers.map((l: any) => l.kind);
    expect(kinds).toEqual(["video", "image", "text"]);
  });

  it("idempotente: un proyecto v3 se devuelve igual", () => {
    // Construimos un v3 raw directamente
    const v3raw = {
      id: "p1", name: "x", version: 3,
      settings: { ...RAW_SETTINGS },
      tracks: {
        layers: [{ id: "l1", kind: "video", name: "", clips: [] }],
        audio: [],
      },
      originalAudioVolume: 1,
      subtitles: { ...RAW_SUBTITLES },
    };
    expect(migrateLayers(v3raw)).toBe(v3raw);
  });

  it("idempotente: un proyecto v4 se devuelve igual (migrateLayers no toca v4)", () => {
    const p = createEmptyProject("x");
    expect(migrateLayers(p)).toBe(p);
  });
});

describe("migrateMedia", () => {
  const baseV3 = {
    id: "p1", name: "x", version: 3,
    settings: { ...RAW_SETTINGS },
    originalAudioVolume: 1,
    subtitles: { ...RAW_SUBTITLES },
  };

  it("convierte v3 (capas tipadas) en v4 con MediaLayers e items etiquetados por kind", () => {
    const clip = {
      id: "v1", clipId: "c1", timelineStart: 0, trimIn: 0, trimOut: 4, speed: 1,
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
      crop: null, opacity: 1,
    };
    const img = createImageOverlay("a", "a.png", 0, 0.2, 0.2);
    const txt = createTextOverlay(0);
    const v3 = {
      ...baseV3,
      tracks: {
        layers: [
          { id: "lv", kind: "video", name: "video-capa", clips: [clip] },
          { id: "li", kind: "image", name: "img-capa", items: [img] },
          { id: "lt", kind: "text", name: "txt-capa", items: [txt] },
        ],
        audio: [],
      },
    };
    const result = migrateMedia(v3) as Record<string, any>;
    expect(result.version).toBe(4);
    expect(result.tracks.layers).toHaveLength(3);
    // Capa vídeo
    expect(result.tracks.layers[0]).toMatchObject({ id: "lv", name: "video-capa" });
    expect(result.tracks.layers[0].items[0]).toMatchObject({ id: "v1", kind: "video" });
    // Capa imagen
    expect(result.tracks.layers[1]).toMatchObject({ id: "li", name: "img-capa" });
    expect(result.tracks.layers[1].items[0]).toMatchObject({ id: img.id, kind: "image" });
    // Capa texto
    expect(result.tracks.layers[2]).toMatchObject({ id: "lt", name: "txt-capa" });
    expect(result.tracks.layers[2].items[0]).toMatchObject({ id: txt.id, kind: "text" });
  });

  it("conserva el orden de las capas (z)", () => {
    const v3 = {
      ...baseV3,
      tracks: {
        layers: [
          { id: "l1", kind: "text", name: "primero", items: [] },
          { id: "l2", kind: "video", name: "segundo", clips: [] },
          { id: "l3", kind: "image", name: "tercero", items: [] },
        ],
        audio: [],
      },
    };
    const result = migrateMedia(v3) as Record<string, any>;
    expect(result.tracks.layers.map((l: any) => l.id)).toEqual(["l1", "l2", "l3"]);
  });

  it("idempotente: un proyecto v4 se devuelve igual", () => {
    const p = createEmptyProject("x");
    expect(migrateMedia(p)).toBe(p);
  });

  it("no toca proyectos v1/v2 (los ignora)", () => {
    const v1 = { version: 1, tracks: {} };
    expect(migrateMedia(v1)).toBe(v1);
    const v2 = { version: 2, tracks: {} };
    expect(migrateMedia(v2)).toBe(v2);
  });

  it("el resultado v4 pasa el projectSchema tras la cadena completa v1→v4", () => {
    const clip = {
      id: "v1", clipId: "c1", timelineStart: 0, trimIn: 0, trimOut: 4, speed: 1,
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
      crop: null,
    };
    const v1 = {
      id: "proj1", name: "test-v1", version: 1,
      settings: { ...RAW_SETTINGS },
      tracks: { video: [clip], text: [], image: [], audio: [] },
      originalAudioVolume: 1,
      subtitles: { ...RAW_SUBTITLES },
    };
    const migrated = migrateMedia(migrateLayers(migrateProject(v1)));
    const parsed = projectSchema.safeParse(migrated);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.version).toBe(4);
      expect(parsed.data.tracks.layers[0].items[0]).toMatchObject({ id: "v1", kind: "video" });
    }
  });

  // Factories legacy siguen funcionando (se usan en tests de migración v3)
  it("createVideoLayer/createImageLayer/createTextLayer siguen disponibles", () => {
    const vl = createVideoLayer("test");
    expect(vl.kind).toBe("video");
    const il = createImageLayer();
    expect(il.kind).toBe("image");
    const tl = createTextLayer();
    expect(tl.kind).toBe("text");
  });
});
