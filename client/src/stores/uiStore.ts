import { create } from "zustand";
import type { ElementKind } from "./projectStore";

export type Tool = "media" | "text" | "image" | "audio";

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
  /** Tamaños redimensionables de la interfaz (px) */
  timelineHeight: number;
  toolPanelWidth: number;
  propertiesWidth: number;
  select: (sel: Selection | null) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setZoom: (px: number) => void;
  setActiveTool: (t: Tool) => void;
  setTimelineHeight: (px: number) => void;
  setToolPanelWidth: (px: number) => void;
  setPropertiesWidth: (px: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selection: null,
  playhead: 0,
  playing: false,
  pxPerSecond: 40,
  activeTool: "media",
  timelineHeight: 176,
  toolPanelWidth: 224,
  propertiesWidth: 288,
  select: (selection) => set({ selection }),
  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (playing) => set({ playing }),
  setZoom: (pxPerSecond) => set({ pxPerSecond: Math.min(400, Math.max(5, pxPerSecond)) }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setTimelineHeight: (px) => set({ timelineHeight: Math.min(480, Math.max(96, px)) }),
  setToolPanelWidth: (px) => set({ toolPanelWidth: Math.min(420, Math.max(170, px)) }),
  setPropertiesWidth: (px) => set({ propertiesWidth: Math.min(480, Math.max(200, px)) }),
}));
