import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimecode } from "../lib/time";
import { useClipsStore } from "../stores/clipsStore";
import { usePlayerStore } from "../stores/playerStore";

const FRAME_STEP = 1 / 30;

export function PreviewPlayer() {
  const clip = useClipsStore((s) =>
    s.clips.find((c) => c.id === s.selectedClipId),
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState(false);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(t, 0), v.duration || 0);
    setTime(v.currentTime);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.volume = volume;
  }, [volume, clip?.id]);

  if (!clip) {
    return (
      <div className="flex-1 grid place-items-center text-muted text-sm bg-canvas">
        Descarga o selecciona un clip para empezar
      </div>
    );
  }

  const controlClass =
    "text-muted hover:text-text disabled:opacity-40 px-1 text-sm";

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-canvas">
      {/* flex (no grid): max-h-full del vídeo necesita altura definida del contenedor */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-hidden">
        <video
          key={clip.id}
          ref={videoRef}
          src={`/files/${clip.fileName}`}
          loop={loop}
          className="max-h-full max-w-full rounded-md shadow-[0_4px_24px_rgba(145,70,255,.15)]"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />
      </div>

      <div className="px-6 pb-4 pt-2 flex flex-col gap-2 shrink-0">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={time}
          onChange={(e) => seek(parseFloat(e.target.value))}
          aria-label="Posición de reproducción"
          className="w-full accent-accent h-1.5"
        />
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={() => seek(0)} aria-label="Ir al inicio" className={controlClass}>⏮</button>
          <button type="button" onClick={() => seek(time - FRAME_STEP)} aria-label="Fotograma anterior" className={controlClass}>◀|</button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pausar" : "Reproducir"}
            className="w-9 h-9 rounded-full bg-accent text-white grid place-items-center text-sm hover:bg-accent-dark"
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button type="button" onClick={() => seek(time + FRAME_STEP)} aria-label="Fotograma siguiente" className={controlClass}>|▶</button>
          <button type="button" onClick={() => seek(duration)} aria-label="Ir al final" className={controlClass}>⏭</button>
          <button
            type="button"
            onClick={() => setLoop((l) => !l)}
            aria-pressed={loop}
            aria-label="Bucle"
            className={`${controlClass} ${loop ? "text-accent" : ""}`}
          >
            🔁
          </button>

          <div className="flex items-center gap-1.5 ml-4">
            <span aria-hidden="true" className="text-muted text-xs">🔊</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              aria-label="Volumen"
              className="w-20 accent-accent h-1"
            />
          </div>

          <span className="font-mono text-[11px] text-muted ml-4">
            {formatTimecode(time)} / {formatTimecode(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
