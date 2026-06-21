import { useCallback, useEffect, useRef, type RefObject } from "react";
import { videoTracks } from "@clipforge/shared";
import { useClipsStore } from "../../stores/clipsStore";
import { usePlayerStore } from "../../stores/playerStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { clipEnd, projectDuration, sourceTimeFor, videoClipAt } from "../../lib/timeline";

const SYNC_TOLERANCE = 0.15; // s de deriva admitida antes de re-sincronizar

export function usePlaybackEngine(
  videoRef: RefObject<HTMLVideoElement | null>,
  overlayVideos: RefObject<Map<string, HTMLVideoElement>>,
) {
  const rafRef = useRef(0);
  const lastTickRef = useRef(0);

  /**
   * Sincroniza los <video> esclavos (pistas superiores) con el playhead.
   * Si no hay esclavos registrados, es un no-op (proyecto de una sola pista).
   */
  const syncOverlays = useCallback(
    (seeking: boolean) => {
      const map = overlayVideos.current;
      if (!map || map.size === 0) return;
      const { playhead, playing } = useUiStore.getState();
      const project = useProjectStore.getState().project;
      const clips = useClipsStore.getState().clips;
      const volume = usePlayerStore.getState().volume;
      for (const track of videoTracks(project).slice(1)) {
        const el = map.get(track.id);
        if (!el) continue;
        const active = videoClipAt(track.clips, playhead);
        if (!active) {
          if (!el.paused) el.pause();
          continue;
        }
        const info = clips.find((c) => c.id === active.clipId);
        if (!info) continue;
        const src = `/files/${info.fileName}`;
        if (el.getAttribute("src") !== src) el.src = src;
        // Volumen del transporte × volumen propio del clip.
        el.volume = volume * active.volume;
        if (el.playbackRate !== active.speed) el.playbackRate = active.speed;
        const target = sourceTimeFor(active, playhead);
        if (seeking || Math.abs(el.currentTime - target) > SYNC_TOLERANCE) el.currentTime = target;
        if (playing && el.paused) void el.play().catch(() => {});
        if (!playing && !el.paused) el.pause();
      }
    },
    [overlayVideos],
  );

  /** Sincroniza el <video> base con el playhead: src, currentTime y play/pause. */
  const sync = useCallback(
    (seeking: boolean) => {
      const video = videoRef.current;
      if (!video) return;
      const { playhead, playing } = useUiStore.getState();
      const project = useProjectStore.getState().project;
      const clips = useClipsStore.getState().clips;
      const active = videoClipAt(videoTracks(project)[0]?.clips ?? [], playhead);

      if (!active) {
        video.pause();
        syncOverlays(seeking);
        return;
      }
      const info = clips.find((c) => c.id === active.clipId);
      if (!info) return;
      const src = `/files/${info.fileName}`;
      // getAttribute: video.src devuelve la URL absoluta y rompería la comparación
      if (video.getAttribute("src") !== src) {
        video.src = src;
      }
      // Volumen del transporte × volumen propio del clip.
      video.volume = usePlayerStore.getState().volume * active.volume;
      if (video.playbackRate !== active.speed) video.playbackRate = active.speed;
      const target = sourceTimeFor(active, playhead);
      if (seeking || Math.abs(video.currentTime - target) > SYNC_TOLERANCE) {
        video.currentTime = target;
      }
      if (playing && video.paused) void video.play();
      if (!playing && !video.paused) video.pause();
      syncOverlays(seeking);
    },
    [videoRef, syncOverlays],
  );

  // Ediciones del proyecto (añadir/recortar/mover clips) re-sincronizan el
  // <video> aunque esté en pausa — p. ej. mostrar el primer fotograma al añadir
  useEffect(() => {
    const unsub = useProjectStore.subscribe(() => sync(false));
    return unsub;
  }, [sync]);

  // Cambiar el volumen del transporte re-aplica volumen (= transporte × clip) a
  // los <video> base y esclavos, también en pausa.
  useEffect(() => {
    const unsub = usePlayerStore.subscribe(() => sync(false));
    return unsub;
  }, [sync]);

  // rAF: única fuente de avance del playhead mientras reproduce. Leer
  // video.currentTime por frame (60fps) — en vez del evento "timeupdate", que
  // solo dispara ~4 veces/seg — mantiene el resaltado karaoke al ritmo real.
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
        const active = videoClipAt(videoTracks(project)[0]?.clips ?? [], playhead);
        const video = videoRef.current;
        if (active && video) {
          if (video.currentTime >= active.trimOut) {
            // fin del bloque recortado: saltar justo después y resincronizar
            useUiStore.getState().setPlayhead(clipEnd(active) + 0.0001);
            sync(true);
          } else {
            // posición real del <video> mapeada a tiempo de proyecto
            const t = active.timelineStart + (video.currentTime - active.trimIn) / active.speed;
            useUiStore.getState().setPlayhead(t);
          }
        } else {
          // hueco: avanza con el reloj de pared
          const delta = (now - lastTickRef.current) / 1000;
          useUiStore.getState().setPlayhead(playhead + delta);
          sync(false);
        }
        // Corregir deriva de los esclavos cada frame (además del sync principal)
        syncOverlays(false);
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
  }, [sync, syncOverlays, videoRef]);

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
    return videoClipAt(videoTracks(project)[0]?.clips ?? [], s.playhead) === null;
  });

  return { seek, togglePlay, inGap };
}
