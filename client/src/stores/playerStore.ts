import { create } from "zustand";

interface PlayerState {
  volume: number;
  setVolume: (volume: number) => void;
}

// Fuera de PreviewPlayer para sobrevivir al remontaje por key={clip.id}
export const usePlayerStore = create<PlayerState>((set) => ({
  volume: 1,
  setVolume: (volume) => set({ volume }),
}));
