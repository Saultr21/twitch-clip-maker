import { create } from "zustand";
import { produce } from "immer";
import type { AudioTrack, ClipInfo, CropRect, ImageOverlay, Preset, Project, SubtitleCue, SubtitleStyle, TextOverlay, VideoClip, VideoTrack } from "@clipforge/shared";
import {
  allVideoClips,
  createAudioTrack,
  createEmptyProject,
  createImageOverlay,
  createTextOverlay,
  createVideoClip,
  createVideoTrack,
} from "@clipforge/shared";
import { clipDuration, clipEnd, hasOverlap, splitVideoClip, videoClipAt } from "../lib/timeline";
import { cueEnd, cueStart, redistributeWordTimes, scaleCueWords, shiftCueWords } from "../lib/subtitles";
import { useUiStore } from "./uiStore";

/** Localiza un clip de vídeo por id en cualquier pista. */
function findClipCtx(d: Project, id: string): { track: VideoTrack; clip: VideoClip; index: number } | null {
  for (const track of d.tracks.video) {
    const index = track.clips.findIndex((c) => c.id === id);
    if (index !== -1) return { track, clip: track.clips[index], index };
  }
  return null;
}

/** Pista base (índice 0). Garantizada por createEmptyProject/migrateProject. */
function baseTrack(d: Project): VideoTrack {
  if (d.tracks.video.length === 0) d.tracks.video.push(createVideoTrack());
  return d.tracks.video[0];
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
  if (sel.kind === "video") {
    if (!allVideoClips(project).some((c) => c.id === sel.id)) useUiStore.getState().select(null);
    return;
  }
  const track = project.tracks[sel.kind as "text" | "image" | "audio"] as Array<{ id: string }>;
  if (!track.some((x) => x.id === sel.id)) useUiStore.getState().select(null);
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
  addVideoTrack: () => void;
  removeVideoTrack: (trackId: string) => void;
  moveClipToTrack: (clipId: string, destTrackId: string, newStart: number, opts?: MutateOptions) => void;
  addVideoClip: (clip: ClipInfo) => void;
  addVideoClipAt: (clip: ClipInfo, start: number) => void;
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

    addVideoTrack: () =>
      mutate((d) => {
        d.tracks.video.push(createVideoTrack());
      }),

    removeVideoTrack: (trackId) =>
      mutate((d) => {
        if (d.tracks.video.length <= 1) return; // nunca dejar 0 pistas
        const idx = d.tracks.video.findIndex((t) => t.id === trackId);
        if (idx !== -1) d.tracks.video.splice(idx, 1);
      }),

    moveClipToTrack: (clipId, destTrackId, newStart, opts) =>
      mutate((d) => {
        const ctx = findClipCtx(d, clipId);
        const dest = d.tracks.video.find((t) => t.id === destTrackId);
        if (!ctx || !dest) return;
        const start = Math.max(0, newStart);
        // no-solape en la pista destino (excluye el propio clip si ya estuviera ahí)
        if (hasOverlap(dest.clips, start, clipDuration(ctx.clip), clipId)) return;
        // saca el clip de su pista actual y lo coloca en destino con el nuevo inicio
        ctx.track.clips.splice(ctx.index, 1);
        dest.clips.push({ ...ctx.clip, timelineStart: start });
        dest.clips.sort((a, b) => a.timelineStart - b.timelineStart);
      }, opts),

    addVideoClip: (clip) =>
      mutate((d) => {
        const track = baseTrack(d);
        const lastEnd = track.clips.length ? Math.max(...track.clips.map(clipEnd)) : 0;
        track.clips.push(createVideoClip(clip.id, lastEnd, clip.duration));
      }),

    // suelta el clip en el instante indicado si el hueco está libre; si pisa otro
    // bloque, cae al final de la secuencia (evita solapes en la pista de vídeo)
    addVideoClipAt: (clip, start) =>
      mutate((d) => {
        const track = baseTrack(d);
        const dur = clip.duration;
        const desired = Math.max(0, start);
        const overlaps = track.clips.some(
          (v) => desired < clipEnd(v) && desired + dur > v.timelineStart,
        );
        const lastEnd = track.clips.length ? Math.max(...track.clips.map(clipEnd)) : 0;
        track.clips.push(createVideoClip(clip.id, overlaps ? lastEnd : desired, dur));
      }),

    // al borrar un medio: quita del timeline los bloques que apuntan a esa fuente
    removeVideoClipsBySource: (clipId) =>
      mutate((d) => {
        for (const track of d.tracks.video) {
          track.clips = track.clips.filter((v) => v.clipId !== clipId);
        }
      }),

    // parte el clip en sus tramos con voz (quita los silencios) y los deja
    // pegados desde su inicio; los bloques de vídeo posteriores se desplazan a
    // la izquierda lo recortado (ripple en la pista de vídeo)
    removeSilencesFromClip: (id, silences) => {
      let firstPieceId: string | null = null;
      mutate((d) => {
        const ctx = findClipCtx(d, id);
        if (!ctx) return;
        const c = ctx.clip;
        const segs = nonSilentSegments(c.trimIn, c.trimOut, silences);
        // sin silencios reales (un único segmento == clip entero) o todo silencio
        if (segs.length === 0 || (segs.length === 1 && segs[0][0] === c.trimIn && segs[0][1] === c.trimOut)) {
          return;
        }
        const oldEnd = clipEnd(c);
        let start = c.timelineStart;
        const pieces = segs.map(([a, b]) => {
          const piece = {
            ...c,
            id: globalThis.crypto.randomUUID(),
            trimIn: a,
            trimOut: b,
            timelineStart: start,
            zoom: { ...c.zoom },
            filters: { ...c.filters },
          };
          start += (b - a) / c.speed;
          return piece;
        });
        firstPieceId = pieces[0].id;
        const removed = (c.trimOut - c.trimIn) / c.speed - (start - c.timelineStart);
        // TODO(fase2): el ripple solo desplaza la pista del clip (ctx.track); en
        // multipista habrá que decidir si arrastra también las otras pistas
        ctx.track.clips = ctx.track.clips
          .flatMap((v) => {
            if (v.id === id) return pieces;
            // ripple: los clips que iban después se adelantan lo recortado
            if (v.timelineStart >= oldEnd && removed > 0) {
              return [{ ...v, timelineStart: Math.max(0, v.timelineStart - removed) }];
            }
            return [v];
          })
          .sort((a, b) => a.timelineStart - b.timelineStart);
      });
      // el clip original desapareció: mueve la selección al primer segmento
      if (firstPieceId && useUiStore.getState().selection?.id === id) {
        useUiStore.getState().select({ kind: "video", id: firstPieceId });
      }
    },

    // auto-reframe: parte el clip en segmentos contiguos (misma duración total,
    // sin ripple) y aplica a cada uno el encuadre que centra la cara
    applyReframe: (id, segments) => {
      let firstPieceId: string | null = null;
      mutate((d) => {
        const ctx = findClipCtx(d, id);
        if (!ctx || segments.length === 0) return;
        const c = ctx.clip;
        let start = c.timelineStart;
        const pieces = segments.map((s) => {
          const piece = {
            ...c,
            id: globalThis.crypto.randomUUID(),
            trimIn: s.start,
            trimOut: s.end,
            timelineStart: start,
            zoom: { x: s.zoom.x, y: s.zoom.y, scale: s.zoom.scale },
            filters: { ...c.filters },
          };
          start += (s.end - s.start) / c.speed;
          return piece;
        });
        firstPieceId = pieces[0].id;
        ctx.track.clips = ctx.track.clips
          .flatMap((v) => (v.id === id ? pieces : [v]))
          .sort((a, b) => a.timelineStart - b.timelineStart);
      });
      if (firstPieceId && useUiStore.getState().selection?.id === id) {
        useUiStore.getState().select({ kind: "video", id: firstPieceId });
      }
    },

    moveVideoClip: (id, newStart, opts) =>
      mutate((d) => {
        const ctx = findClipCtx(d, id);
        if (!ctx) return;
        const start = Math.max(0, newStart);
        if (hasOverlap(ctx.track.clips, start, clipDuration(ctx.clip), id)) return;
        ctx.clip.timelineStart = start;
      }, opts),

    trimVideoClip: (id, edge, t, opts) =>
      mutate((d) => {
        const ctx = findClipCtx(d, id);
        if (!ctx) return;
        const c = ctx.clip;
        if (edge === "start") {
          const maxStart = clipEnd(c) - MIN_CLIP_DURATION;
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
        const ctx = findClipCtx(d, id);
        if (ctx) Object.assign(ctx.clip, patch);
      }, opts),

    splitVideoAt: (t) =>
      mutate((d) => {
        // TODO(fase2): parte solo en la pista base; en multipista habrá que
        // partir el clip activo de cada pista (o el de la pista seleccionada)
        const track = baseTrack(d);
        const c = videoClipAt(track.clips, t);
        if (!c || t <= c.timelineStart || t >= clipEnd(c)) return;
        const [left, right] = splitVideoClip(c, t);
        const idx = track.clips.findIndex((v) => v.id === c.id);
        track.clips.splice(idx, 1, left, right);
      }),

    addText: (start) => {
      const overlay = createTextOverlay(start);
      mutate((d) => void d.tracks.text.push(overlay));
      return overlay.id;
    },

    addImage: (assetId, fileName, start, w, h) => {
      const overlay = createImageOverlay(assetId, fileName, start, w, h);
      mutate((d) => void d.tracks.image.push(overlay));
      return overlay.id;
    },

    updateText: (id, patch, opts) =>
      mutate((d) => {
        const o = d.tracks.text.find((t) => t.id === id);
        if (o) Object.assign(o, patch);
      }, opts),

    updateImage: (id, patch, opts) =>
      mutate((d) => {
        const o = d.tracks.image.find((i) => i.id === id);
        if (o) Object.assign(o, patch);
      }, opts),

    setImageCrop: (id, crop) =>
      mutate((d) => {
        const img = d.tracks.image.find((i) => i.id === id);
        if (img) img.crop = crop;
      }),

    setVideoCrop: (id, crop) =>
      mutate((d) => {
        const ctx = findClipCtx(d, id);
        if (ctx) ctx.clip.crop = crop;
      }),

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

    moveOverlay: (kind, id, newStart, opts) =>
      mutate((d) => {
        const o = (d.tracks[kind] as Array<{ id: string; start: number; end: number }>).find((x) => x.id === id);
        if (!o) return;
        const dur = o.end - o.start;
        o.start = Math.max(0, newStart);
        o.end = o.start + dur;
      }, opts),

    trimOverlay: (kind, id, edge, t, opts) =>
      mutate((d) => {
        const o = d.tracks[kind].find((x) => x.id === id);
        if (!o) return;
        if (edge === "start") o.start = Math.min(Math.max(0, t), o.end - MIN_CLIP_DURATION);
        else o.end = Math.max(o.start + MIN_CLIP_DURATION, t);
      }, opts),

    removeElement: (kind, id) =>
      mutate((d) => {
        if (kind === "subtitle") {
          d.subtitles.cues = d.subtitles.cues.filter((c) => c.id !== id);
          return;
        }
        if (kind === "video") {
          const ctx = findClipCtx(d, id);
          if (ctx) ctx.track.clips.splice(ctx.index, 1);
          return;
        }
        const track = d.tracks[kind as "text" | "image" | "audio"] as Array<{ id: string }>;
        const idx = track.findIndex((x) => x.id === id);
        if (idx !== -1) track.splice(idx, 1);
      }),

    setSubtitleCues: (cues) => mutate((d) => void (d.subtitles.cues = cues)),

    // Inserta una frase nueva (2s) en el playhead para rellenar a mano lo que la
    // transcripción no pilló; se mantiene la lista ordenada por tiempo de inicio
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

    applyPreset: (preset) =>
      mutate((d) => {
        d.settings = { ...preset.settings };
        // ids regenerados: aplicar dos veces la misma plantilla no colisiona
        d.tracks.text = preset.text.map((t) => ({ ...t, id: globalThis.crypto.randomUUID() }));
        d.tracks.image = preset.image.map((i) => ({ ...i, id: globalThis.crypto.randomUUID() }));
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
