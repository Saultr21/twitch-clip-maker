import { create } from "zustand";
import type { ClipInfo, DownloadEvent } from "@clipforge/shared";

interface ClipsState {
  clips: ClipInfo[];
  selectedClipId: string | null;
  downloading: boolean;
  downloadProgress: number;
  downloadError: string | null;
  uploading: boolean;
  fetchClips: () => Promise<void>;
  selectClip: (id: string) => void;
  downloadClip: (url: string) => Promise<void>;
  uploadClip: (file: File) => Promise<void>;
  removeClip: (id: string) => Promise<boolean>;
}

export const useClipsStore = create<ClipsState>((set) => ({
  clips: [],
  selectedClipId: null,
  downloading: false,
  downloadProgress: 0,
  downloadError: null,
  uploading: false,

  fetchClips: async () => {
    try {
      const res = await fetch("/api/clips");
      if (!res.ok) throw new Error(res.statusText);
      set({ clips: (await res.json()) as ClipInfo[] });
    } catch {
      set({ downloadError: "No se pudo cargar la lista de clips" });
    }
  },

  selectClip: (id) => set({ selectedClipId: id }),

  uploadClip: async (file) => {
    set({ uploading: true, downloadError: null });
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/clips/upload", { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error);
      }
      const clip = (await res.json()) as ClipInfo;
      set((s) => ({ clips: [clip, ...s.clips], selectedClipId: clip.id }));
    } catch (err) {
      set({ downloadError: err instanceof Error ? err.message : "Error al subir el vídeo" });
    } finally {
      set({ uploading: false });
    }
  },

  removeClip: async (id) => {
    try {
      const res = await fetch(`/api/clips/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error();
      set((s) => ({
        clips: s.clips.filter((c) => c.id !== id),
        selectedClipId: s.selectedClipId === id ? null : s.selectedClipId,
      }));
      return true;
    } catch {
      set({ downloadError: "No se pudo borrar el clip" });
      return false;
    }
  },

  downloadClip: async (url) => {
    set({ downloading: true, downloadProgress: 0, downloadError: null });
    try {
      const res = await fetch("/api/clips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        throw new Error(body.error);
      }
      if (!res.body) throw new Error("Respuesta de descarga sin cuerpo");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: DownloadEvent;
          try {
            event = JSON.parse(line) as DownloadEvent;
          } catch {
            continue;
          }
          if (event.type === "progress") {
            set({ downloadProgress: event.percent });
          } else if (event.type === "error") {
            throw new Error(event.message);
          } else {
            set((s) => ({
              clips: [event.clip, ...s.clips],
              selectedClipId: event.clip.id,
            }));
          }
        }
      }
    } catch (err) {
      set({
        downloadError:
          err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      set({ downloading: false });
    }
  },
}));
