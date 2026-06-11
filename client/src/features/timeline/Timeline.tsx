import { useMemo } from "react";
import { assignLanes, clipEnd, projectDuration } from "../../lib/timeline";
import { useClipsStore } from "../../stores/clipsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { usePlayback } from "../preview/PreviewArea";
import { TimeRuler } from "./TimeRuler";
import { TrackRow, type BlockDescriptor } from "./TrackRow";

// Componente propio: el playhead cambia a 60fps durante la reproducción y
// suscribirlo aquí evita re-renderizar el Timeline completo en cada frame
function PlayheadLine({ pxPerSecond }: { pxPerSecond: number }) {
  const playhead = useUiStore((s) => s.playhead);
  return (
    <div
      aria-hidden="true"
      className="absolute top-0 bottom-0 w-px bg-accent pointer-events-none"
      style={{ left: 80 + playhead * pxPerSecond }}
    >
      <div className="w-2.5 h-2.5 -ml-[5px] rotate-45 bg-accent" />
    </div>
  );
}

export function Timeline() {
  const { seek } = usePlayback();
  const project = useProjectStore((s) => s.project);
  const moveVideoClip = useProjectStore((s) => s.moveVideoClip);
  const moveOverlay = useProjectStore((s) => s.moveOverlay);
  const trimVideoClip = useProjectStore((s) => s.trimVideoClip);
  const trimOverlay = useProjectStore((s) => s.trimOverlay);
  const pxPerSecond = useUiStore((s) => s.pxPerSecond);
  const setZoom = useUiStore((s) => s.setZoom);
  const clips = useClipsStore((s) => s.clips);

  const duration = projectDuration(project);
  const contentWidth = Math.max(600, (duration + 5) * pxPerSecond);

  const videoBlocks: BlockDescriptor[] = useMemo(
    () =>
      project.tracks.video.map((c) => ({
        id: c.id,
        kind: "video" as const,
        start: c.timelineStart,
        end: clipEnd(c),
        label: clips.find((i) => i.id === c.clipId)?.title ?? "clip",
        color: "bg-accent/25 text-accent-soft",
      })),
    [project.tracks.video, clips],
  );

  const textBlocks: BlockDescriptor[] = project.tracks.text.map((t) => ({
    id: t.id,
    kind: "text" as const,
    start: t.start,
    end: t.end,
    label: t.content || "texto",
    color: "bg-emerald-500/20 text-emerald-200",
  }));

  const imageBlocks: BlockDescriptor[] = project.tracks.image.map((i) => ({
    id: i.id,
    kind: "image" as const,
    start: i.start,
    end: i.end,
    label: i.fileName,
    color: "bg-amber-500/20 text-amber-200",
  }));

  // Texto e imagen pueden solaparse en el tiempo: carriles automáticos
  const textLanes = assignLanes(textBlocks);
  const imageLanes = assignLanes(imageBlocks);

  return (
    <footer className="h-44 bg-surface border-t border-border flex flex-col shrink-0">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-border">
        <span className="text-[10px] text-muted">Línea de tiempo</span>
        <button
          type="button"
          onClick={() => useProjectStore.getState().splitVideoAt(useUiStore.getState().playhead)}
          title="Dividir en el playhead (S)"
          aria-label="Dividir clip en el playhead"
          className="text-muted hover:text-text text-xs px-1.5"
        >
          ✂ Dividir
        </button>
        <button
          type="button"
          onClick={() => {
            const sel = useUiStore.getState().selection;
            if (!sel) return;
            useProjectStore.getState().removeElement(sel.kind, sel.id);
            useUiStore.getState().select(null);
          }}
          title="Eliminar seleccionado (Supr)"
          aria-label="Eliminar elemento seleccionado"
          className="text-muted hover:text-danger text-xs px-1.5"
        >
          🗑 Eliminar
        </button>
        <label htmlFor="tl-zoom" className="ml-auto text-[10px] text-muted">Zoom</label>
        <input
          id="tl-zoom"
          type="range"
          min={5}
          max={400}
          step={5}
          value={pxPerSecond}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="w-28 accent-accent h-1"
        />
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <div className="relative" style={{ width: contentWidth }}>
          <div className="ml-20">
            <TimeRuler duration={duration} pxPerSecond={pxPerSecond} onSeek={seek} />
          </div>
          <TrackRow
            title="Vídeo"
            blocks={videoBlocks}
            pxPerSecond={pxPerSecond}
            onMove={(id, t, transient) => moveVideoClip(id, t, { transient })}
            onTrim={(id, edge, t, transient) => trimVideoClip(id, edge, t, { transient })}
          />
          <TrackRow
            title="Texto"
            blocks={textBlocks}
            pxPerSecond={pxPerSecond}
            lanes={textLanes.lanes}
            laneCount={textLanes.count}
            onMove={(id, t, transient) => moveOverlay("text", id, t, { transient })}
            onTrim={(id, edge, t, transient) => trimOverlay("text", id, edge, t, { transient })}
          />
          <TrackRow
            title="Imagen"
            blocks={imageBlocks}
            pxPerSecond={pxPerSecond}
            lanes={imageLanes.lanes}
            laneCount={imageLanes.count}
            onMove={(id, t, transient) => moveOverlay("image", id, t, { transient })}
            onTrim={(id, edge, t, transient) => trimOverlay("image", id, edge, t, { transient })}
          />
          <PlayheadLine pxPerSecond={pxPerSecond} />
        </div>
      </div>
    </footer>
  );
}
