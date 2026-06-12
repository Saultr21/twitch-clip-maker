import { z } from "zod";

export const ASPECT_PRESETS = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
} as const;

const norm = z.number().min(0).max(1);

export const projectSettingsSchema = z.object({
  aspect: z.enum(["9:16", "16:9", "1:1", "4:5", "custom"]),
  width: z.number().int().min(16).max(7680),
  height: z.number().int().min(16).max(7680),
  fps: z.number().int().min(1).max(120),
});

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
  })
  .refine((c) => c.trimOut > c.trimIn, { message: "trimOut debe ser mayor que trimIn" });

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
  ...overlayWindow,
});

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
  version: z.literal(1),
  settings: projectSettingsSchema,
  tracks: z.object({
    video: z.array(videoClipSchema),
    text: z.array(textOverlaySchema),
    image: z.array(imageOverlaySchema),
    audio: z.array(audioTrackSchema),
  }),
  originalAudioVolume: norm,
});

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
    version: 1,
    settings: { aspect: "9:16", ...ASPECT_PRESETS["9:16"], fps: 30 },
    tracks: { video: [], text: [], image: [], audio: [] },
    originalAudioVolume: 1,
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
    rotation: 0,
    opacity: 1,
    start,
    end: start + 4,
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
  };
}
