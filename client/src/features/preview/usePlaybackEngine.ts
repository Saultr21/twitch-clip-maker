import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useClipsStore } from "../../stores/clipsStore";
import { usePlayerStore } from "../../stores/playerStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { clipEnd, projectDuration, sourceTimeFor, videoClipAt } from "../../lib/timeline";

const SYNC_TOLERANCE = 0.15; // s de deriva admitida antes de re-sincronizar

export function usePlaybackEngine(videoRef: RefObject<HTMLVideoElement | null>) {
  const rafRef = useRef(0);
  const lastTickRef = useRef(0);

  /** Sincroniza el <video> con el playhead: src, currentTime y play/pause. */
  const sync = useCallback(
    (seeking: boolean) => {
      const video = videoRef.current;
      if (!video) return;
      const { playhead, playing } = useUiStore.getState();
      const project = useProjectStore.getState().project;
      const clips = useClipsStore.getState().clips;
      const active = videoClipAt(project.tracks.video, playhead);

      if (!active) {
        video.pause();
        return;
      }
      const info = clips.find((c) => c.id === active.clipId);
      if (!info) return;
      const src = `/files/${info.fileName}`;
      // getAttribute: video.src devuelve la URL absoluta y rompería la comparación
      if (video.getAttribute("src") !== src) {
        video.src = src;
      }
      video.volume = usePlayerStore.getState().volume;
      const target = sourceTimeFor(active, playhead);
      if (seeking || Math.abs(video.currentTime - target) > SYNC_TOLERANCE) {
        video.currentTime = target;
      }
      if (playing && video.paused) void video.play();
      if (!playing && !video.paused) video.pause();
    },
    [videoRef],
  );

  // El <video> hace avanzar el playhead mientras hay clip activo
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => {
      const { playhead, playing } = useUiStore.getState();
      if (!playing) return;
      const project = useProjectStore.getState().project;
      const active = videoClipAt(project.tracks.video, playhead);
      if (!active) return;
      const t = active.timelineStart + (video.currentTime - active.trimIn) / active.speed;
      if (video.currentTime >= active.trimOut) {
        // fin del bloque: saltar justo después y dejar que el rAF/sync decidan
        useUiStore.getState().setPlayhead(clipEnd(active) + 0.0001);
        sync(true);
      } else {
        useUiStore.getState().setPlayhead(t);
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [videoRef, sync]);

  // rAF: avanza por los huecos y detiene al final del proyecto
  useEffect(() => {
    const unsub = useUiStore.subscribe((s, prev) => {
      if (s.playing === prev.playing) return;
      cancelAnimationFrame(rafRef.current);
      if (!s.playing) {
        sync(false);
        return;
      }
      lastTickRef.current = performance.now();
      const tick = (now: number) => {
        const { playhead, playing } = useUiStore.getState();
        if (!playing) return;
        const project = useProjectStore.getState().project;
        const total = projectDuration(project);
        if (playhead >= total) {
          useUiStore.getState().setPlaying(false);
          useUiStore.getState().setPlayhead(total);
          return;
        }
        const active = videoClipAt(project.tracks.video, playhead);
        if (!active) {
          // hueco: avanza con el reloj
          const delta = (now - lastTickRef.current) / 1000;
          useUiStore.getState().setPlayhead(playhead + delta);
          sync(false);
        }
        lastTickRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
      };
      sync(true);
      rafRef.current = requestAnimationFrame(tick);
    });
    return () => {
      unsub();
      cancelAnimationFrame(rafRef.current);
    };
  }, [sync]);

  /** Mueve el playhead (scrub, clic en regla, transporte). */
  const seek = useCallback(
    (t: number) => {
      const total = projectDuration(useProjectStore.getState().project);
      useUiStore.getState().setPlayhead(Math.min(Math.max(0, t), total));
      sync(true);
    },
    [sync],
  );

  const togglePlay = useCallback(() => {
    const { playing } = useUiStore.getState();
    useUiStore.getState().setPlaying(!playing);
  }, []);

  /** True si el playhead está en un hueco (sin clip de vídeo activo). */
  const inGap = useUiStore((s) => {
    const project = useProjectStore.getState().project;
    return videoClipAt(project.tracks.video, s.playhead) === null;
  });

  return { seek, togglePlay, inGap };
}
