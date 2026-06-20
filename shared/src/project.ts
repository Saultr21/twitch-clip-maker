import { z } from "zod";
import { DEFAULT_SUBTITLE_STYLE, subtitlesSchema } from "./subtitles.js";

export const ASPECT_PRESETS = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
} as const;

const norm = z.number().min(0).max(1);

// Fondo que rellena las zonas que el vídeo no cubre (letterbox):
// negro (defecto), color sólido, copia desenfocada del propio vídeo o imagen
export const backgroundSchema = z
  .object({
    type: z.enum(["black", "color", "blur", "image"]),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    blur: norm, // intensidad del desenfoque (0–1)
    fileName: z.string().optional(), // imagen de fondo (en data/assets)
  })
  .default({ type: "black", color: "#000000", blur: 0.5 });

export const projectSettingsSchema = z.object({
  aspect: z.enum(["9:16", "16:9", "1:1", "4:5", "custom"]),
  width: z.number().int().min(16).max(7680),
  height: z.number().int().min(16).max(7680),
  fps: z.number().int().min(1).max(120),
  background: backgroundSchema,
  // baja la música automáticamente cuando hay voz (ducking) al exportar
  audioDucking: z.boolean().default(false),
  // fundido de entrada/salida del vídeo y audio al exportar (segundos)
  fadeIn: z.number().min(0).max(5).default(0),
  fadeOut: z.number().min(0).max(5).default(0),
  // transición (fundido a negro) entre clips consecutivos al exportar (segundos)
  clipTransition: z.number().min(0).max(2).default(0),
});

export const cropRectSchema = z.object({
  x: norm,
  y: norm,
  w: z.number().min(0.01).max(1),
  h: z.number().min(0.01).max(1),
}).nullable();

export type CropRect = z.infer<typeof cropRectSchema>;

export const videoClipSchema = z
  .object({
    id: z.string().min(1),
    clipId: z.string().min(1),
    timelineStart: z.number().min(0),
    trimIn: z.number().min(0),
    trimOut: z.number().min(0),
    speed: z.number().min(0.25).max(4),
    // scale 1 = fotograma completo visible (contain); >1 amplía y recorta
    zoom: z.object({ x: norm, y: norm, scale: z.number().min(0.1).max(10) }),
    filters: z.object({
      brightness: z.number().min(-1).max(1),
      contrast: z.number().min(0).max(2),
      saturation: z.number().min(0).max(3),
      hue: z.number().min(-180).max(180),
      grayscale: z.number().min(0).max(1),
    }),
    crop: cropRectSchema.default(null),
    // opacidad de la capa (1 = opaca). Sin efecto hasta la fase de compositación
    opacity: norm.default(1),
  })
  .refine((c) => c.trimOut > c.trimIn, { message: "trimOut debe ser mayor que trimIn" });

export const videoTrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  clips: z.array(videoClipSchema),
});

export type VideoTrack = z.infer<typeof videoTrackSchema>;

const overlayWindow = {
  start: z.number().min(0),
  end: z.number().min(0),
  rotation: z.number().min(-360).max(360),
  opacity: norm,
};

export const textOverlaySchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  fontFamily: z.string().min(1),
  fontSize: z.number().min(0.005).max(1),
  // hex estricto: estos valores acaban dentro del filter_complex de FFmpeg
  fill: z.string().regex(/^#[0-9a-f]{6}$/i),
  stroke: z.string().regex(/^$|^#[0-9a-f]{6}$/i),
  strokeWidth: z.number().min(0).max(0.1),
  shadow: z.boolean(),
  x: norm,
  y: norm,
  ...overlayWindow,
});

export const imageOverlaySchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  fileName: z.string().min(1),
  x: norm,
  y: norm,
  width: norm,
  height: norm,
  crop: cropRectSchema.default(null),
  ...overlayWindow,
});

export const videoLayerSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("video"),
  name: z.string().default(""),
  clips: z.array(videoClipSchema),
});
export const imageLayerSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("image"),
  name: z.string().default(""),
  items: z.array(imageOverlaySchema),
});
export const textLayerSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("text"),
  name: z.string().default(""),
  items: z.array(textOverlaySchema),
});
export const layerSchema = z.discriminatedUnion("kind", [
  videoLayerSchema, imageLayerSchema, textLayerSchema,
]);
export type VideoLayer = z.infer<typeof videoLayerSchema>;
export type ImageLayer = z.infer<typeof imageLayerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type Layer = z.infer<typeof layerSchema>;

export const audioTrackSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  fileName: z.string().min(1),
  volume: norm,
  start: z.number().min(0),
  end: z.number().min(0),
  trimIn: z.number().min(0),
  trimOut: z.number().min(0),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  version: z.literal(3),
  settings: projectSettingsSchema,
  tracks: z.object({
    layers: z.array(layerSchema),
    audio: z.array(audioTrackSchema),
  }),
  originalAudioVolume: norm,
  subtitles: subtitlesSchema,
});

export function createVideoTrack(name = ""): VideoTrack {
  return { id: globalThis.crypto.randomUUID(), name, clips: [] };
}

export function createVideoLayer(name = ""): VideoLayer {
  return { id: globalThis.crypto.randomUUID(), kind: "video", name, clips: [] };
}
export function createImageLayer(name = ""): ImageLayer {
  return { id: globalThis.crypto.randomUUID(), kind: "image", name, items: [] };
}
export function createTextLayer(name = ""): TextLayer {
  return { id: globalThis.crypto.randomUUID(), kind: "text", name, items: [] };
}

export function videoLayers(p: Project): VideoLayer[] {
  return p.tracks.layers.filter((l): l is VideoLayer => l.kind === "video");
}
export function imageLayers(p: Project): ImageLayer[] {
  return p.tracks.layers.filter((l): l is ImageLayer => l.kind === "image");
}
export function textLayers(p: Project): TextLayer[] {
  return p.tracks.layers.filter((l): l is TextLayer => l.kind === "text");
}
/** Todos los clips de vídeo (todas las capas vídeo), en orden de capa. */
export function allVideoClips(p: Project): VideoClip[] {
  return videoLayers(p).flatMap((l) => l.clips);
}
export function imageItems(p: Project): ImageOverlay[] {
  return imageLayers(p).flatMap((l) => l.items);
}
export function textItems(p: Project): TextOverlay[] {
  return textLayers(p).flatMap((l) => l.items);
}

export type Background = z.infer<typeof backgroundSchema>;
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;
export type VideoClip = z.infer<typeof videoClipSchema>;
export type TextOverlay = z.infer<typeof textOverlaySchema>;
export type ImageOverlay = z.infer<typeof imageOverlaySchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type Project = z.infer<typeof projectSchema>;

export function createEmptyProject(name: string): Project {
  return {
    id: globalThis.crypto.randomUUID(),
    name,
    version: 3,
    settings: {
      aspect: "9:16",
      ...ASPECT_PRESETS["9:16"],
      fps: 30,
      background: { type: "black", color: "#000000", blur: 0.5 },
      audioDucking: false,
      fadeIn: 0,
      fadeOut: 0,
      clipTransition: 0,
    },
    tracks: { layers: [createVideoLayer()], audio: [] },
    originalAudioVolume: 1,
    subtitles: { cues: [], style: { ...DEFAULT_SUBTITLE_STYLE }, maxWordsPerCue: 8 },
  };
}

export function createTextOverlay(start: number): TextOverlay {
  return {
    id: globalThis.crypto.randomUUID(),
    content: "Texto",
    fontFamily: "Segoe UI",
    fontSize: 0.06,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 0,
    shadow: true,
    x: 0.5,
    y: 0.5,
    rotation: 0,
    opacity: 1,
    start,
    end: start + 4,
  };
}

export function createImageOverlay(
  assetId: string,
  fileName: string,
  start: number,
  width: number,
  height: number,
): ImageOverlay {
  return {
    id: globalThis.crypto.randomUUID(),
    assetId,
    fileName,
    x: 0.5,
    y: 0.5,
    width,
    height,
    crop: null,
    rotation: 0,
    opacity: 1,
    start,
    end: start + 4,
  };
}

export function createAudioTrack(
  assetId: string,
  fileName: string,
  start: number,
  duration: number,
): AudioTrack {
  return {
    id: globalThis.crypto.randomUUID(),
    assetId,
    fileName,
    volume: 0.8,
    start,
    end: start + duration,
    trimIn: 0,
    trimOut: duration,
  };
}

export function createVideoClip(
  clipId: string,
  timelineStart: number,
  duration: number,
): VideoClip {
  return {
    id: globalThis.crypto.randomUUID(),
    clipId,
    timelineStart,
    trimIn: 0,
    trimOut: duration,
    speed: 1,
    zoom: { x: 0.5, y: 0.5, scale: 1 },
    filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
    crop: null,
    opacity: 1,
  };
}

/**
 * v2 (tracks.video/image/text separados) → v3 (tracks.layers). Pura e idempotente.
 * Orden de capas: vídeo (atrás) → imagen → texto (frente), conservando el z visual de v2.
 * Fase 1: una sola capa de imagen y una de texto (sin trocear por solape; eso se hará
 * en la fase de timeline). El no-solape por carril de imagen/texto se relaja aquí.
 */
export function migrateLayers(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const p = raw as { version?: number; tracks?: any };
  if (p.version !== 2) return raw;
  const t = p.tracks ?? {};
  const videoLayersArr = (Array.isArray(t.video) ? t.video : []).map((trk: any) => ({
    id: trk.id ?? globalThis.crypto.randomUUID(),
    kind: "video", name: trk.name ?? "", clips: trk.clips ?? [],
  }));
  const layers: any[] = [...videoLayersArr];
  if (Array.isArray(t.image) && t.image.length) {
    layers.push({ id: globalThis.crypto.randomUUID(), kind: "image", name: "", items: t.image });
  }
  if (Array.isArray(t.text) && t.text.length) {
    layers.push({ id: globalThis.crypto.randomUUID(), kind: "text", name: "", items: t.text });
  }
  if (layers.length === 0) layers.push({ id: globalThis.crypto.randomUUID(), kind: "video", name: "", clips: [] });
  return { ...p, version: 3, tracks: { layers, audio: t.audio ?? [] } };
}

/**
 * Migra un proyecto crudo (leído de disco/API) al esquema actual. v1 tenía
 * `tracks.video` como array plano de clips; v2 lo envuelve en una sola pista.
 * Pura e idempotente: un proyecto ya v2 se devuelve tal cual.
 */
export function migrateProject(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const p = raw as { version?: number; tracks?: { video?: unknown } };
  if (p.version !== 1) return raw;
  // Copia de los clips (no alias del array de entrada): el proyecto migrado debe
  // ser independiente del crudo para que Immer pueda draftearlo sin mutarlo
  const flat = Array.isArray(p.tracks?.video) ? p.tracks.video.map((c) => ({ ...(c as object) })) : [];
  return {
    ...p,
    version: 2,
    tracks: {
      ...(p.tracks ?? {}),
      video: [{ id: globalThis.crypto.randomUUID(), name: "", clips: flat }],
    },
  };
}
