import { create } from "zustand";
import type { ElementKind } from "./projectStore";

export type Tool = "media" | "text" | "image";

export interface Selection {
  kind: ElementKind;
  id: string;
}

interface UiState {
  selection: Selection | null;
  playhead: number;
  playing: boolean;
  pxPerSecond: number;
  activeTool: Tool;
  select: (sel: Selection | null) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setZoom: (px: number) => void;
  setActiveTool: (t: Tool) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selection: null,
  playhead: 0,
  playing: false,
  pxPerSecond: 40,
  activeTool: "media",
  select: (selection) => set({ selection }),
  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (playing) => set({ playing }),
  setZoom: (pxPerSecond) => set({ pxPerSecond: Math.min(400, Math.max(5, pxPerSecond)) }),
  setActiveTool: (activeTool) => set({ activeTool }),
}));
