import { useEffect, useRef } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

const SYNC_TOLERANCE = 0.25;

/**
 * Mantiene un pool de <audio> (uno por pista de música) sincronizado con el
 * playhead: crea/elimina elementos al cambiar el proyecto y ajusta
 * currentTime/volume/play/pause en cada tick relevante.
 */
export function useMusicEngine(): void {
  const poolRef = useRef(new Map<string, HTMLAudioElement>());

  useEffect(() => {
    const sync = () => {
      const { playhead, playing } = useUiStore.getState();
      const tracks = useProjectStore.getState().project.tracks.audio;
      const pool = poolRef.current;

      // eliminar pistas que ya no existen
      for (const [id, el] of pool) {
        if (!tracks.some((t) => t.id === id)) {
          el.pause();
          el.src = "";
          pool.delete(id);
        }
      }

      for (const t of tracks) {
        let el = pool.get(t.id);
        if (!el) {
          el = new Audio(`/assets/${t.fileName}`);
          el.preload = "auto";
          pool.set(t.id, el);
        }
        el.volume = t.volume;
        const active = playhead >= t.start && playhead < t.end;
        if (!active) {
          if (!el.paused) el.pause();
          continue;
        }
        const target = t.trimIn + (playhead - t.start);
        if (Math.abs(el.currentTime - target) > SYNC_TOLERANCE) {
          el.currentTime = target;
        }
        if (playing && el.paused) void el.play();
        if (!playing && !el.paused) el.pause();
      }
    };

    const unsubUi = useUiStore.subscribe(sync);
    const unsubProject = useProjectStore.subscribe(sync);
    sync();
    return () => {
      unsubUi();
      unsubProject();
      for (const el of poolRef.current.values()) {
        el.pause();
        el.src = "";
      }
      poolRef.current.clear();
    };
  }, []);
}
