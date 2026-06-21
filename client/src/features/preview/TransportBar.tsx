import { useEffect, type RefObject } from "react";
import { SkipBack, StepBack, Play, Pause, StepForward, SkipForward, Repeat, Volume2 } from "lucide-react";
import { formatTimecode } from "../../lib/time";
import { projectDuration } from "../../lib/timeline";
import { usePlayerStore } from "../../stores/playerStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

interface TransportBarProps {
  seek: (t: number) => void;
  togglePlay: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  loop: boolean;
  setLoop: (l: boolean) => void;
}

export function TransportBar({ seek, togglePlay, videoRef, loop, setLoop }: TransportBarProps) {
  const playing = useUiStore((s) => s.playing);
  const playhead = useUiStore((s) => s.playhead);
  const fps = useProjectStore((s) => s.project.settings.fps);
  const duration = useProjectStore((s) => projectDuration(s.project));
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const frame = 1 / fps;

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.volume = volume;
  }, [volume, videoRef]);

  // Bucle: al agotar la duración con loop activo, vuelve al inicio
  useEffect(() => {
    if (loop && !playing && duration > 0 && playhead >= duration) {
      seek(0);
      useUiStore.getState().setPlaying(true);
    }
  }, [loop, playing, playhead, duration, seek]);

  const controlClass = "text-muted hover:text-text disabled:opacity-40 px-1 text-sm";

  return (
    <div className="px-6 pb-3 pt-2 flex flex-col gap-2 shrink-0 bg-canvas">
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.01}
        value={Math.min(playhead, duration)}
        onChange={(e) => seek(parseFloat(e.target.value))}
        disabled={duration === 0}
        aria-label="Posición de reproducción"
        className="w-full accent-accent h-1.5"
      />
      {/* 3 columnas: izq. vacía · centro (controles + tiempo debajo) · der. (volumen).
          El grid de 3 fracciones iguales mantiene los controles centrados respecto
          a TODA la barra, como en los editores profesionales. */}
      <div className="grid grid-cols-3 items-center">
        <div aria-hidden="true" />
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={() => seek(0)} aria-label="Ir al inicio" className={controlClass}><SkipBack size={16} aria-hidden="true" /></button>
            <button type="button" onClick={() => seek(playhead - frame)} aria-label="Fotograma anterior" className={controlClass}><StepBack size={16} aria-hidden="true" /></button>
            <button
              type="button"
              onClick={togglePlay}
              disabled={duration === 0}
              aria-label={playing ? "Pausar" : "Reproducir"}
              className="w-9 h-9 rounded-full bg-accent text-white grid place-items-center hover:bg-accent-dark disabled:opacity-40"
            >
              {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
            </button>
            <button type="button" onClick={() => seek(playhead + frame)} aria-label="Fotograma siguiente" className={controlClass}><StepForward size={16} aria-hidden="true" /></button>
            <button type="button" onClick={() => seek(duration)} aria-label="Ir al final" className={controlClass}><SkipForward size={16} aria-hidden="true" /></button>
            <button
              type="button"
              onClick={() => setLoop(!loop)}
              aria-pressed={loop}
              aria-label="Bucle"
              className={`${controlClass} ${loop ? "text-accent" : ""}`}
            >
              <Repeat size={16} aria-hidden="true" />
            </button>
          </div>
          <span className="font-mono text-[11px] text-muted tabular-nums">
            {formatTimecode(playhead)} / {formatTimecode(duration)}
          </span>
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <Volume2 size={16} aria-hidden="true" className="text-muted" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            aria-label="Volumen"
            className="w-24 accent-accent h-1"
          />
        </div>
      </div>
    </div>
  );
}
