import { create } from "zustand";
import { produce } from "immer";
import type { AudioTrack, ClipInfo, CropRect, ImageOverlay, MediaElement, MediaLayer, Preset, Project, SubtitleCue, SubtitleStyle, TextOverlay, VideoClip } from "@clipforge/shared";
import {
  createAudioTrack,
  createEmptyProject,
  createImageOverlay,
  createMediaLayer,
  createTextOverlay,
  createVideoClip,
} from "@clipforge/shared";
import { clipEnd, splitVideoClip, videoClipAt } from "../lib/timeline";
import { cueEnd, cueStart, redistributeWordTimes, scaleCueWords, shiftCueWords } from "../lib/subtitles";
import { useUiStore } from "./uiStore";

// ── Helpers internos sobre capas media (v4) ──────────────────────────────────

/** Primera capa media. La crea si no hay ninguna. */
function mediaLayerFor(d: Project): MediaLayer {
  let base = d.tracks.layers[0];
  if (!base) {
    base = createMediaLayer();
    d.tracks.layers.push(base);
  }
  return base;
}

/** Busca un elemento por id en TODOS los items de TODAS las capas (cualquier kind). */
function findElement(
  d: Project,
  id: string,
): { layer: MediaLayer; item: MediaElement; index: number } | null {
  for (const layer of d.tracks.layers) {
    const index = layer.items.findIndex((it) => it.id === id);
    if (index !== -1) return { layer, item: layer.items[index], index };
  }
  return null;
}

/**
 * No-solape en una capa media contra TODOS los items (cualquier kind).
 * Para items de vídeo, duración = (trimOut - trimIn) / speed.
 * Para imagen/texto, duración = end - start.
 * La ventana de un item = [start, start + duration).
 */
function overlaps(
  items: MediaElement[],
  start: number,
  end: number,
  ignoreId?: string,
): boolean {
  return items.some((it) => {
    if (it.id === ignoreId) return false;
    let itStart: number;
    let itEnd: number;
    if (it.kind === "video") {
      itStart = it.timelineStart;
      itEnd = itStart + (it.trimOut - it.trimIn) / it.speed;
    } else {
      itStart = it.start;
      itEnd = it.end;
    }
    return start < itEnd && end > itStart;
  });
}

// Tras undo/redo el elemento seleccionado puede haber dejado de existir;
// se poda la selección solo en ese caso para no deseleccionar al deshacer ediciones
function pruneSelection(project: Project): void {
  const sel = useUiStore.getState().selection;
  if (!sel) return;
  if (sel.kind === "subtitle") {
    if (!project.subtitles.cues.some((c) => c.id === sel.id)) useUiStore.getState().select(null);
    return;
  }
  if (sel.kind === "audio") {
    if (!project.tracks.audio.some((x) => x.id === sel.id)) useUiStore.getState().select(null);
    return;
  }
  // video / image / text — buscar en items de todas las capas
  const found = project.tracks.layers.some((l) => l.items.some((it) => it.id === sel.id));
  if (!found) useUiStore.getState().select(null);
}

const HISTORY_LIMIT = 100;
const MIN_CLIP_DURATION = 0.1;

/** Tramos NO silenciosos dentro de [trimIn, trimOut] (tiempo de archivo): el
 *  complemento de los silencios, ya recortados, ordenados y fusionados. Pura. */
export function nonSilentSegments(
  trimIn: number,
  trimOut: number,
  silences: Array<{ start: number; end: number }>,
): Array<[number, number]> {
  const within = silences
    .map((s) => ({ start: Math.max(trimIn, s.start), end: Math.min(trimOut, s.end) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const s of within) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  const segs: Array<[number, number]> = [];
  let cur = trimIn;
  for (const s of merged) {
    if (s.start > cur) segs.push([cur, s.start]);
    cur = s.end;
  }
  if (cur < trimOut) segs.push([cur, trimOut]);
  return segs;
}

export type ElementKind = "video" | "text" | "image" | "audio" | "subtitle";

interface MutateOptions {
  transient?: boolean;
}

interface ProjectState {
  project: Project;
  past: Project[];
  future: Project[];
  dirty: boolean;
  /** Nombre con el que el proyecto existe en disco; difiere de project.name tras renombrar. */
  savedName: string;
  loadProject: (p: Project) => void;
  renameProject: (name: string) => void;
  setAspect: (aspect: Project["settings"]["aspect"], width: number, height: number) => void;
  setBackground: (patch: Partial<Project["settings"]["background"]>) => void;
  setAudioDucking: (on: boolean) => void;
  setFade: (patch: { fadeIn?: number; fadeOut?: number; clipTransition?: number }) => void;
  /** Crea una capa media vacía. Con `atIndex` la inserta en esa posición del
   *  array (0 = fondo); sin él, la añade al final (frente). Devuelve su id. */
  addMediaLayer: (atIndex?: number) => string;
  reorderLayer: (fromIndex: number, toIndex: number) => void;
  removeLayer: (id: string) => void;
  /** Alterna la visibilidad de una capa media (ojito). */
  toggleLayerHidden: (id: string) => void;
  /** Alterna el silencio del audio de una capa media. */
  toggleLayerMuted: (id: string) => void;
  /** Alterna el silencio de una pista de música. */
  toggleAudioMuted: (id: string) => void;
  moveElementToLayer: (elementId: string, destLayerId: string, newStart: number) => void;
  addVideoClip: (clip: ClipInfo) => void;
  addVideoClipAt: (clip: ClipInfo, start: number) => void;
  addVideoClipToTrack: (clip: ClipInfo, layerId: string, start: number) => void;
  removeVideoClipsBySource: (clipId: string) => void;
  removeSilencesFromClip: (id: string, silences: Array<{ start: number; end: number }>) => void;
  applyReframe: (
    id: string,
    segments: Array<{ start: number; end: number; zoom: { x: number; y: number; scale: number } }>,
  ) => void;
  moveVideoClip: (id: string, newStart: number, opts?: MutateOptions) => void;
  trimVideoClip: (id: string, edge: "start" | "end", t: number, opts?: MutateOptions) => void;
  updateVideoClip: (id: string, patch: Partial<VideoClip>, opts?: MutateOptions) => void;
  splitVideoAt: (t: number) => void;
  addText: (start: number) => string;
  addImage: (assetId: string, fileName: string, start: number, w: number, h: number) => string;
  updateText: (id: string, patch: Partial<TextOverlay>, opts?: MutateOptions) => void;
  updateImage: (id: string, patch: Partial<ImageOverlay>, opts?: MutateOptions) => void;
  setImageCrop: (id: string, crop: CropRect) => void;
  setVideoCrop: (id: string, crop: CropRect) => void;
  moveOverlay: (kind: "text" | "image" | "audio", id: string, newStart: number, opts?: MutateOptions) => void;
  trimOverlay: (kind: "text" | "image", id: string, edge: "start" | "end", t: number, opts?: MutateOptions) => void;
  addAudio: (assetId: string, fileName: string, start: number, duration: number) => string;
  trimAudio: (id: string, edge: "start" | "end", t: number, opts?: MutateOptions) => void;
  updateAudio: (id: string, patch: Partial<AudioTrack>, opts?: MutateOptions) => void;
  removeElement: (kind: ElementKind, id: string) => void;
  setSubtitleCues: (cues: SubtitleCue[]) => void;
  addCue: (start: number) => string;
  updateCueText: (id: string, text: string) => void;
  moveCue: (id: string, newStart: number, opts?: MutateOptions) => void;
  trimCue: (id: string, edge: "start" | "end", t: number, opts?: MutateOptions) => void;
  removeCue: (id: string) => void;
  setSubtitleStyle: (patch: Partial<SubtitleStyle>) => void;
  setMaxWordsPerCue: (n: number) => void;
  clearSubtitles: () => void;
  applyPreset: (preset: Preset) => void;
  setOriginalAudioVolume: (v: number) => void;
  beginTransaction: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  markSaved: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const mutate = (fn: (draft: Project) => void, opts?: MutateOptions) =>
    set((s) => ({
      project: produce(s.project, fn),
      past: opts?.transient ? s.past : [...s.past.slice(-(HISTORY_LIMIT - 1)), s.project],
      future: opts?.transient ? s.future : [],
      dirty: true,
    }));

  return {
    project: createEmptyProject("proyecto-sin-titulo"),
    past: [],
    future: [],
    dirty: false,
    savedName: "proyecto-sin-titulo",

    loadProject: (p) => set({ project: p, past: [], future: [], dirty: false, savedName: p.name }),

    renameProject: (name) => mutate((d) => void (d.name = name)),

    setAspect: (aspect, width, height) =>
      mutate((d) => {
        d.settings.aspect = aspect;
        d.settings.width = width;
        d.settings.height = height;
      }),

    setAudioDucking: (on) => mutate((d) => void (d.settings.audioDucking = on)),

    setFade: (patch) =>
      mutate((d) => {
        if (patch.fadeIn !== undefined) d.settings.fadeIn = patch.fadeIn;
        if (patch.fadeOut !== undefined) d.settings.fadeOut = patch.fadeOut;
        if (patch.clipTransition !== undefined) d.settings.clipTransition = patch.clipTransition;
      }),

    setBackground: (patch) =>
      mutate((d) => {
        Object.assign(d.settings.background, patch);
      }),

    // ── Ops de capas ──────────────────────────────────────────────────────────

    addMediaLayer: (atIndex?: number) => {
      const layer = createMediaLayer();
      mutate((d) => {
        if (atIndex === undefined) {
          d.tracks.layers.push(layer);
        } else {
          const i = Math.max(0, Math.min(d.tracks.layers.length, atIndex));
          d.tracks.layers.splice(i, 0, layer);
        }
      });
      return layer.id;
    },

    reorderLayer: (fromIndex, toIndex) => {
      const n = get().project.tracks.layers.length;
      if (fromIndex < 0 || fromIndex >= n) return;
      const to = Math.max(0, Math.min(n - 1, toIndex));
      if (fromIndex === to) return;
      mutate((d) => {
        const [moved] = d.tracks.layers.splice(fromIndex, 1);
        d.tracks.layers.splice(to, 0, moved);
      });
    },

    removeLayer: (id) =>
      mutate((d) => {
        const idx = d.tracks.layers.findIndex((l) => l.id === id);
        if (idx === -1) return;
        d.tracks.layers.splice(idx, 1);
        if (d.tracks.layers.length === 0) d.tracks.layers.push(createMediaLayer());
      }),

    toggleLayerHidden: (id) =>
      mutate((d) => {
        const l = d.tracks.layers.find((x) => x.id === id);
        if (l) l.hidden = !l.hidden;
      }),

    toggleLayerMuted: (id) =>
      mutate((d) => {
        const l = d.tracks.layers.find((x) => x.id === id);
        if (l) l.muted = !l.muted;
      }),

    toggleAudioMuted: (id) =>
      mutate((d) => {
        const a = d.tracks.audio.find((x) => x.id === id);
        if (a) a.muted = !a.muted;
      }),

    moveElementToLayer: (elementId, destLayerId, newStart) =>
      mutate((d) => {
        const destLayer = d.tracks.layers.find((l) => l.id === destLayerId);
        if (!destLayer) return;

        const ctx = findElement(d, elementId);
        if (!ctx) return;

        const item = ctx.item;
        const start = Math.max(0, newStart);

        let end: number;
        if (item.kind === "video") {
          end = start + (item.trimOut - item.trimIn) / item.speed;
        } else {
          end = start + (item.end - item.start);
        }

        if (overlaps(destLayer.items, start, end, elementId)) return;

        // Saca el item de la capa origen
        ctx.layer.items.splice(ctx.index, 1);

        // Inserta en destino con el nuevo start
        if (item.kind === "video") {
          destLayer.items.push({ ...item, timelineStart: start });
          destLayer.items.sort((a, b) => {
            const aStart = a.kind === "video" ? a.timelineStart : a.start;
            const bStart = b.kind === "video" ? b.timelineStart : b.start;
            return aStart - bStart;
          });
        } else {
          const duration = item.end - item.start;
          destLayer.items.push({ ...item, start, end: start + duration });
          destLayer.items.sort((a, b) => {
            const aStart = a.kind === "video" ? a.timelineStart : a.start;
            const bStart = b.kind === "video" ? b.timelineStart : b.start;
            return aStart - bStart;
          });
        }
      }),

    // ── Ops de clips de vídeo ─────────────────────────────────────────────────

    addVideoClip: (clip) =>
      mutate((d) => {
        const layer = mediaLayerFor(d);
        const videoItems = layer.items.filter((it): it is MediaElement & { kind: "video" } => it.kind === "video");
        const lastEnd = videoItems.length ? Math.max(...videoItems.map((v) => v.timelineStart + (v.trimOut - v.trimIn) / v.speed)) : 0;
        const newClip = createVideoClip(clip.id, lastEnd, clip.duration);
        layer.items.push({ ...newClip, kind: "video" });
      }),

    addVideoClipAt: (clip, start) =>
      mutate((d) => {
        const layer = mediaLayerFor(d);
        const dur = clip.duration;
        const desired = Math.max(0, start);
        const end = desired + dur;
        const hasOvlp = overlaps(layer.items, desired, end);
        const videoItems = layer.items.filter((it): it is MediaElement & { kind: "video" } => it.kind === "video");
        const lastEnd = videoItems.length ? Math.max(...videoItems.map((v) => v.timelineStart + (v.trimOut - v.trimIn) / v.speed)) : 0;
        const newClip = createVideoClip(clip.id, hasOvlp ? lastEnd : desired, dur);
        layer.items.push({ ...newClip, kind: "video" });
      }),

    addVideoClipToTrack: (clip, layerId, start) =>
      mutate((d) => {
        const layer = d.tracks.layers.find((l) => l.id === layerId);
        if (!layer) return;
        const dur = clip.duration;
        const desired = Math.max(0, start);
        const end = desired + dur;
        const hasOvlp = overlaps(layer.items, desired, end);
        const videoItems = layer.items.filter((it): it is MediaElement & { kind: "video" } => it.kind === "video");
        const lastEnd = videoItems.length ? Math.max(...videoItems.map((v) => v.timelineStart + (v.trimOut - v.trimIn) / v.speed)) : 0;
        const newClip = createVideoClip(clip.id, hasOvlp ? lastEnd : desired, dur);
        // En capas superiores (no índice 0) el clip entra como PiP: a media escala
        const layerIndex = d.tracks.layers.findIndex((l) => l.id === layerId);
        if (layerIndex !== 0) newClip.zoom = { x: 0.5, y: 0.5, scale: 0.5 };
        layer.items.push({ ...newClip, kind: "video" });
        layer.items.sort((a, b) => {
          const aS = a.kind === "video" ? a.timelineStart : a.start;
          const bS = b.kind === "video" ? b.timelineStart : b.start;
          return aS - bS;
        });
      }),

    removeVideoClipsBySource: (clipId) =>
      mutate((d) => {
        for (const l of d.tracks.layers) {
          l.items = l.items.filter((it) => !(it.kind === "video" && it.clipId === clipId));
        }
      }),

    removeSilencesFromClip: (id, silences) => {
      let firstPieceId: string | null = null;
      mutate((d) => {
        const ctx = findElement(d, id);
        if (!ctx || ctx.item.kind !== "video") return;
        const c = ctx.item;
        const segs = nonSilentSegments(c.trimIn, c.trimOut, silences);
        if (segs.length === 0 || (segs.length === 1 && segs[0][0] === c.trimIn && segs[0][1] === c.trimOut)) {
          return;
        }
        const oldEnd = c.timelineStart + (c.trimOut - c.trimIn) / c.speed;
        let start = c.timelineStart;
        const pieces: MediaElement[] = segs.map(([a, b]) => {
          const piece: MediaElement = {
            ...c,
            id: globalThis.crypto.randomUUID(),
            trimIn: a,
            trimOut: b,
            timelineStart: start,
            zoom: { ...c.zoom },
            filters: { ...c.filters },
            kind: "video",
          };
          start += (b - a) / c.speed;
          return piece;
        });
        firstPieceId = pieces[0].id;
        const removed = (c.trimOut - c.trimIn) / c.speed - (start - c.timelineStart);
        ctx.layer.items = ctx.layer.items
          .flatMap((it) => {
            if (it.id === id) return pieces;
            if (it.kind === "video" && it.timelineStart >= oldEnd && removed > 0) {
              return [{ ...it, timelineStart: Math.max(0, it.timelineStart - removed) }];
            }
            return [it];
          })
          .sort((a, b) => {
            const aS = a.kind === "video" ? a.timelineStart : a.start;
            const bS = b.kind === "video" ? b.timelineStart : b.start;
            return aS - bS;
          });
      });
      if (firstPieceId && useUiStore.getState().selection?.id === id) {
        useUiStore.getState().select({ kind: "video", id: firstPieceId });
      }
    },

    applyReframe: (id, segments) => {
      let firstPieceId: string | null = null;
      mutate((d) => {
        const ctx = findElement(d, id);
        if (!ctx || ctx.item.kind !== "video" || segments.length === 0) return;
        const c = ctx.item;
        let start = c.timelineStart;
        const pieces: MediaElement[] = segments.map((s) => {
          const piece: MediaElement = {
            ...c,
            id: globalThis.crypto.randomUUID(),
            trimIn: s.start,
            trimOut: s.end,
            timelineStart: start,
            zoom: { x: s.zoom.x, y: s.zoom.y, scale: s.zoom.scale },
            filters: { ...c.filters },
            kind: "video",
          };
          start += (s.end - s.start) / c.speed;
          return piece;
        });
        firstPieceId = pieces[0].id;
        ctx.layer.items = ctx.layer.items
          .flatMap((it) => (it.id === id ? pieces : [it]))
          .sort((a, b) => {
            const aS = a.kind === "video" ? a.timelineStart : a.start;
            const bS = b.kind === "video" ? b.timelineStart : b.start;
            return aS - bS;
          });
      });
      if (firstPieceId && useUiStore.getState().selection?.id === id) {
        useUiStore.getState().select({ kind: "video", id: firstPieceId });
      }
    },

    moveVideoClip: (id, newStart, opts) =>
      mutate((d) => {
        const ctx = findElement(d, id);
        if (!ctx || ctx.item.kind !== "video") return;
        const clip = ctx.item;
        const start = Math.max(0, newStart);
        const end = start + (clip.trimOut - clip.trimIn) / clip.speed;
        if (overlaps(ctx.layer.items, start, end, id)) return;
        clip.timelineStart = start;
      }, opts),

    trimVideoClip: (id, edge, t, opts) =>
      mutate((d) => {
        const ctx = findElement(d, id);
        if (!ctx || ctx.item.kind !== "video") return;
        const c = ctx.item;
        if (edge === "start") {
          const dur = (c.trimOut - c.trimIn) / c.speed;
          const maxStart = c.timelineStart + dur - MIN_CLIP_DURATION;
          const newTimelineStart = Math.min(Math.max(0, t), maxStart);
          const delta = (newTimelineStart - c.timelineStart) * c.speed;
          const newTrimIn = Math.max(0, c.trimIn + delta);
          c.timelineStart = newTimelineStart;
          c.trimIn = Math.min(newTrimIn, c.trimOut - MIN_CLIP_DURATION);
        } else {
          const cutSource = c.trimIn + Math.max(MIN_CLIP_DURATION, t - c.timelineStart) * c.speed;
          c.trimOut = Math.max(c.trimIn + MIN_CLIP_DURATION, cutSource);
        }
      }, opts),

    updateVideoClip: (id, patch, opts) =>
      mutate((d) => {
        const ctx = findElement(d, id);
        if (ctx && ctx.item.kind === "video") Object.assign(ctx.item, patch);
      }, opts),

    splitVideoAt: (t) =>
      mutate((d) => {
        const layer = mediaLayerFor(d);
        // Busca el clip de vídeo activo bajo t en la capa base
        const videoClips = layer.items.filter((it): it is MediaElement & { kind: "video" } => it.kind === "video");
        const c = videoClipAt(videoClips, t);
        if (!c || t <= c.timelineStart || t >= clipEnd(c)) return;
        const [left, right] = splitVideoClip(c, t);
        const idx = layer.items.findIndex((it) => it.id === c.id);
        layer.items.splice(idx, 1, { ...left, kind: "video" }, { ...right, kind: "video" });
      }),

    setVideoCrop: (id, crop) =>
      mutate((d) => {
        const ctx = findElement(d, id);
        if (ctx && ctx.item.kind === "video") ctx.item.crop = crop;
      }),

    // ── Ops de imagen ─────────────────────────────────────────────────────────

    addImage: (assetId, fileName, start, w, h) => {
      const overlay = createImageOverlay(assetId, fileName, start, w, h);
      mutate((d) => {
        const layer = mediaLayerFor(d);
        const duration = overlay.end - overlay.start;
        const end = start + duration;
        const hasOvlp = overlaps(layer.items, start, end);
        const lastEnd = layer.items.length
          ? Math.max(...layer.items.map((it) => (it.kind === "video" ? it.timelineStart + (it.trimOut - it.trimIn) / it.speed : it.end)))
          : 0;
        const effectiveStart = hasOvlp ? lastEnd : Math.max(0, start);
        overlay.start = effectiveStart;
        overlay.end = effectiveStart + duration;
        layer.items.push({ ...overlay, kind: "image" });
      });
      return overlay.id;
    },

    updateImage: (id, patch, opts) =>
      mutate((d) => {
        const ctx = findElement(d, id);
        if (ctx && ctx.item.kind === "image") Object.assign(ctx.item, patch);
      }, opts),

    setImageCrop: (id, crop) =>
      mutate((d) => {
        const ctx = findElement(d, id);
        if (ctx && ctx.item.kind === "image") ctx.item.crop = crop;
      }),

    // ── Ops de texto ──────────────────────────────────────────────────────────

    addText: (start) => {
      const overlay = createTextOverlay(start);
      mutate((d) => {
        const layer = mediaLayerFor(d);
        const duration = overlay.end - overlay.start;
        const end = start + duration;
        const hasOvlp = overlaps(layer.items, start, end);
        const lastEnd = layer.items.length
          ? Math.max(...layer.items.map((it) => (it.kind === "video" ? it.timelineStart + (it.trimOut - it.trimIn) / it.speed : it.end)))
          : 0;
        const effectiveStart = hasOvlp ? lastEnd : Math.max(0, start);
        overlay.start = effectiveStart;
        overlay.end = effectiveStart + duration;
        layer.items.push({ ...overlay, kind: "text" });
      });
      return overlay.id;
    },

    updateText: (id, patch, opts) =>
      mutate((d) => {
        const ctx = findElement(d, id);
        if (ctx && ctx.item.kind === "text") Object.assign(ctx.item, patch);
      }, opts),

    // ── Ops de overlay genéricas ──────────────────────────────────────────────

    moveOverlay: (kind, id, newStart, opts) =>
      mutate((d) => {
        if (kind === "audio") {
          // El audio puede solaparse (varias pistas de música): sin no-solape
          const a = d.tracks.audio.find((x) => x.id === id);
          if (!a) return;
          const dur = a.end - a.start;
          a.start = Math.max(0, newStart);
          a.end = a.start + dur;
          return;
        }
        const ctx = findElement(d, id);
        if (!ctx || ctx.item.kind === "video") return;
        const item = ctx.item;
        const dur = item.end - item.start;
        const start = Math.max(0, newStart);
        const end = start + dur;
        if (overlaps(ctx.layer.items, start, end, id)) return;
        item.start = start;
        item.end = end;
      }, opts),

    trimOverlay: (_kind, id, edge, t, opts) =>
      mutate((d) => {
        const ctx = findElement(d, id);
        if (!ctx || ctx.item.kind === "video") return;
        const o = ctx.item;
        if (edge === "start") o.start = Math.min(Math.max(0, t), o.end - MIN_CLIP_DURATION);
        else o.end = Math.max(o.start + MIN_CLIP_DURATION, t);
      }, opts),

    // ── Ops de audio ──────────────────────────────────────────────────────────

    addAudio: (assetId, fileName, start, duration) => {
      const track = createAudioTrack(assetId, fileName, start, duration);
      mutate((d) => void d.tracks.audio.push(track));
      return track.id;
    },

    trimAudio: (id, edge, t, opts) =>
      mutate((d) => {
        const a = d.tracks.audio.find((x) => x.id === id);
        if (!a) return;
        if (edge === "start") {
          const newStart = Math.min(Math.max(0, t), a.end - MIN_CLIP_DURATION);
          const delta = newStart - a.start;
          a.trimIn = Math.max(0, a.trimIn + delta);
          a.start = newStart;
        } else {
          const maxEnd = a.start + (a.trimOut - a.trimIn);
          a.end = Math.min(Math.max(a.start + MIN_CLIP_DURATION, t), maxEnd);
        }
      }, opts),

    updateAudio: (id, patch, opts) =>
      mutate((d) => {
        const a = d.tracks.audio.find((x) => x.id === id);
        if (a) Object.assign(a, patch);
      }, opts),

    // ── Eliminar elemento genérico ────────────────────────────────────────────

    removeElement: (kind, id) =>
      mutate((d) => {
        if (kind === "subtitle") {
          d.subtitles.cues = d.subtitles.cues.filter((c) => c.id !== id);
          return;
        }
        if (kind === "audio") {
          const idx = d.tracks.audio.findIndex((x) => x.id === id);
          if (idx !== -1) d.tracks.audio.splice(idx, 1);
          return;
        }
        // video / image / text — buscar en items de todas las capas
        const ctx = findElement(d, id);
        if (ctx) ctx.layer.items.splice(ctx.index, 1);
      }),

    // ── Ops de subtítulos ─────────────────────────────────────────────────────

    setSubtitleCues: (cues) => mutate((d) => void (d.subtitles.cues = cues)),

    addCue: (start) => {
      const id = globalThis.crypto.randomUUID();
      mutate((d) => {
        d.subtitles.cues.push({ id, words: [{ text: "Nueva frase", start, end: start + 2 }] });
        d.subtitles.cues.sort((a, b) => cueStart(a) - cueStart(b));
      });
      return id;
    },

    updateCueText: (id, text) =>
      mutate((d) => {
        const i = d.subtitles.cues.findIndex((c) => c.id === id);
        if (i !== -1) d.subtitles.cues[i] = redistributeWordTimes(d.subtitles.cues[i], text);
      }),

    moveCue: (id, newStart, opts) =>
      mutate((d) => {
        const i = d.subtitles.cues.findIndex((c) => c.id === id);
        if (i === -1) return;
        const delta = Math.max(0, newStart) - cueStart(d.subtitles.cues[i]);
        d.subtitles.cues[i] = shiftCueWords(d.subtitles.cues[i], delta);
      }, opts),

    trimCue: (id, edge, t, opts) =>
      mutate((d) => {
        const i = d.subtitles.cues.findIndex((c) => c.id === id);
        if (i === -1) return;
        const c = d.subtitles.cues[i];
        const start = edge === "start" ? Math.min(t, cueEnd(c) - 0.1) : cueStart(c);
        const end = edge === "end" ? Math.max(t, cueStart(c) + 0.1) : cueEnd(c);
        d.subtitles.cues[i] = scaleCueWords(c, start, end);
      }, opts),

    removeCue: (id) =>
      mutate((d) => {
        d.subtitles.cues = d.subtitles.cues.filter((c) => c.id !== id);
      }),

    setSubtitleStyle: (patch) =>
      mutate((d) => void Object.assign(d.subtitles.style, patch)),

    setMaxWordsPerCue: (n) =>
      mutate((d) => void (d.subtitles.maxWordsPerCue = Number.isFinite(n) ? Math.max(1, Math.min(30, n)) : d.subtitles.maxWordsPerCue)),

    clearSubtitles: () => mutate((d) => void (d.subtitles.cues = [])),

    // ── Preset ────────────────────────────────────────────────────────────────

    applyPreset: (preset) =>
      mutate((d) => {
        d.settings = { ...preset.settings };
        // Conserva las capas que tienen clips de vídeo; elimina las que solo tenían imagen/texto
        // En v4 todas las capas son MediaLayer: conservamos todas y eliminamos los items
        // de imagen/texto (se repondrán desde el preset). Los items de vídeo se conservan.
        for (const layer of d.tracks.layers) {
          layer.items = layer.items.filter((it) => it.kind === "video");
        }
        // Añadir imagen y texto del preset en una nueva capa media
        const presetItems: MediaElement[] = [
          ...preset.image.map((i) => ({ ...i, id: globalThis.crypto.randomUUID(), kind: "image" as const })),
          ...preset.text.map((t) => ({ ...t, id: globalThis.crypto.randomUUID(), kind: "text" as const })),
        ];
        if (presetItems.length > 0) {
          const newLayer = createMediaLayer();
          newLayer.items = presetItems;
          d.tracks.layers.push(newLayer);
        }
      }),

    setOriginalAudioVolume: (v) => mutate((d) => void (d.originalAudioVolume = v)),

    beginTransaction: () =>
      set((s) => ({
        past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.project],
        future: [],
      })),

    undo: () => {
      set((s) => {
        const prev = s.past.at(-1);
        if (!prev) return s;
        return {
          project: prev,
          past: s.past.slice(0, -1),
          future: [s.project, ...s.future],
          dirty: true,
        };
      });
      pruneSelection(get().project);
    },

    redo: () => {
      set((s) => {
        const next = s.future[0];
        if (!next) return s;
        return {
          project: next,
          past: [...s.past, s.project],
          future: s.future.slice(1),
          dirty: true,
        };
      });
      pruneSelection(get().project);
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
    markSaved: () => set((s) => ({ dirty: false, savedName: s.project.name })),
  };
});
