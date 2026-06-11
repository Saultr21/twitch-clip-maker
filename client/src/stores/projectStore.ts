import { create } from "zustand";
import { produce } from "immer";
import type { ClipInfo, ImageOverlay, Project, TextOverlay } from "@clipforge/shared";
import {
  createEmptyProject,
  createImageOverlay,
  createTextOverlay,
  createVideoClip,
} from "@clipforge/shared";
import { clipDuration, clipEnd, hasOverlap, splitVideoClip, videoClipAt } from "../lib/timeline";
import { useUiStore } from "./uiStore";

// Tras undo/redo el elemento seleccionado puede haber dejado de existir;
// se poda la selección solo en ese caso para no deseleccionar al deshacer ediciones
function pruneSelection(project: Project): void {
  const sel = useUiStore.getState().selection;
  if (!sel) return;
  const track = project.tracks[sel.kind] as Array<{ id: string }>;
  if (!track.some((x) => x.id === sel.id)) useUiStore.getState().select(null);
}

const HISTORY_LIMIT = 100;
const MIN_CLIP_DURATION = 0.1;

export type ElementKind = "video" | "text" | "image";

interface MutateOptions {
  transient?: boolean;
}

interface ProjectState {
  project: Project;
  past: Project[];
  future: Project[];
  dirty: boolean;
  loadProject: (p: Project) => void;
  renameProject: (name: string) => void;
  setAspect: (aspect: Project["settings"]["aspect"], width: number, height: number) => void;
  addVideoClip: (clip: ClipInfo) => void;
  moveVideoClip: (id: string, newStart: number, opts?: MutateOptions) => void;
  trimVideoClip: (id: string, edge: "start" | "end", t: number, opts?: MutateOptions) => void;
  splitVideoAt: (t: number) => void;
  addText: (start: number) => string;
  addImage: (assetId: string, fileName: string, start: number, w: number, h: number) => string;
  updateText: (id: string, patch: Partial<TextOverlay>, opts?: MutateOptions) => void;
  updateImage: (id: string, patch: Partial<ImageOverlay>, opts?: MutateOptions) => void;
  moveOverlay: (kind: "text" | "image", id: string, newStart: number, opts?: MutateOptions) => void;
  trimOverlay: (kind: "text" | "image", id: string, edge: "start" | "end", t: number, opts?: MutateOptions) => void;
  removeElement: (kind: ElementKind, id: string) => void;
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

    loadProject: (p) => set({ project: p, past: [], future: [], dirty: false }),

    renameProject: (name) => mutate((d) => void (d.name = name)),

    setAspect: (aspect, width, height) =>
      mutate((d) => {
        d.settings.aspect = aspect;
        d.settings.width = width;
        d.settings.height = height;
      }),

    addVideoClip: (clip) =>
      mutate((d) => {
        const lastEnd = d.tracks.video.length
          ? Math.max(...d.tracks.video.map(clipEnd))
          : 0;
        d.tracks.video.push(createVideoClip(clip.id, lastEnd, clip.duration));
      }),

    moveVideoClip: (id, newStart, opts) =>
      mutate((d) => {
        const c = d.tracks.video.find((v) => v.id === id);
        if (!c) return;
        const start = Math.max(0, newStart);
        if (hasOverlap(d.tracks.video, start, clipDuration(c), id)) return;
        c.timelineStart = start;
      }, opts),

    trimVideoClip: (id, edge, t, opts) =>
      mutate((d) => {
        const c = d.tracks.video.find((v) => v.id === id);
        if (!c) return;
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

    splitVideoAt: (t) =>
      mutate((d) => {
        const c = videoClipAt(d.tracks.video, t);
        if (!c || t <= c.timelineStart || t >= clipEnd(c)) return;
        const [left, right] = splitVideoClip(c, t);
        const idx = d.tracks.video.findIndex((v) => v.id === c.id);
        d.tracks.video.splice(idx, 1, left, right);
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

    moveOverlay: (kind, id, newStart, opts) =>
      mutate((d) => {
        const o = d.tracks[kind].find((x) => x.id === id);
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
        const track = d.tracks[kind] as Array<{ id: string }>;
        const idx = track.findIndex((x) => x.id === id);
        if (idx !== -1) track.splice(idx, 1);
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
    markSaved: () => set({ dirty: false }),
  };
});
