import { useMemo } from "react";

interface TimeRulerProps {
  duration: number;
  pxPerSecond: number;
  onSeek: (t: number) => void;
}

/** Intervalo de marca "bonito" según el zoom: ≥80px entre marcas mayores. */
function tickInterval(pxPerSecond: number): number {
  const candidates = [0.5, 1, 2, 5, 10, 30, 60];
  return candidates.find((c) => c * pxPerSecond >= 80) ?? 60;
}

export function TimeRuler({ duration, pxPerSecond, onSeek }: TimeRulerProps) {
  const interval = tickInterval(pxPerSecond);
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= duration + interval; t += interval) out.push(t);
    return out;
  }, [duration, interval]);

  return (
    <div
      role="presentation"
      className="relative h-6 border-b border-border cursor-pointer select-none"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientX - rect.left) / pxPerSecond);
      }}
    >
      {ticks.map((t) => (
        <span
          key={t}
          className="absolute top-0 h-full border-l border-border-2 pl-1 text-[9px] text-muted font-mono"
          style={{ left: t * pxPerSecond }}
        >
          {t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}` : `${t}s`}
        </span>
      ))}
    </div>
  );
}
