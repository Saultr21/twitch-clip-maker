import { useEffect, useRef, useState } from "react";
import { Crop, Scissors, Trash2 } from "lucide-react";
import type { VideoClip } from "@clipforge/shared";
import { assignLanes, clipEnd, projectDuration } from "../../lib/timeline";
import { cueStart, cueEnd } from "../../lib/subtitles";
import { useClipsStore } from "../../stores/clipsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { usePlayback } from "../preview/PreviewArea";
import { TimeRuler } from "./TimeRuler";
import { TrackRow, type BlockDescriptor } from "./TrackRow";

// Referencia estable para el fallback de "sin clips": evita crear un array nuevo
// por render, que rompería la memoización de los hooks que dependen de los clips.
// (Fase 1: solo la pista base; en multipista esto será por pista.)
const EMPTY_CLIPS: never[] = [];

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

// Franja de drop en el hueco por encima/debajo del grupo de carriles de vídeo.
// Acepta clips de Medios (DnD nativo, tipo application/x-clip-id) y llama onDrop
// para crear una pista nueva y colocar el clip.
// IMPORTANTE: este componente es HERMANO de <div ref={videoLanesRef}>, NO hijo,
// para que videoLanesRef.current.children contenga solo carriles de vídeo y el
// mapeo Y→carril de handleVideoMoveEnd siga siendo correcto.
function GapDrop({
  position,
  pxPerSecond,
  onDrop,
}: {
  position: "top" | "bottom";
  pxPerSecond: number;
  onDrop: (pos: "top" | "bottom", t: number, clipId: string) => void;
}) {
  const [active, setActive] = useState(false);
  return (
    <div className="flex">
      <div className="w-20 shrink-0 border-r border-border bg-surface sticky left-0 z-10" />
      <div
        className={`flex-1 h-2 ${active ? "bg-accent/30 ring-1 ring-inset ring-accent" : ""}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/x-clip-id")) {
            e.preventDefault();
            setActive(true);
          }
        }}
        onDragLeave={() => setActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setActive(false);
          const clipId = e.dataTransfer.getData("application/x-clip-id");
          if (!clipId) return;
          const rect = e.currentTarget.getBoundingClientRect();
          onDrop(position, Math.max(0, (e.clientX - rect.left) / pxPerSecond), clipId);
        }}
      />
    </div>
  );
}

export function Timeline({ height }: { height: number }) {
  const { seek } = usePlayback();
  const project = useProjectStore((s) => s.project);
  const moveVideoClip = useProjectStore((s) => s.moveVideoClip);
  const moveOverlay = useProjectStore((s) => s.moveOverlay);
  const trimVideoClip = useProjectStore((s) => s.trimVideoClip);
  const trimOverlay = useProjectStore((s) => s.trimOverlay);
  const trimAudio = useProjectStore((s) => s.trimAudio);
  const moveCue = useProjectStore((s) => s.moveCue);
  const trimCue = useProjectStore((s) => s.trimCue);
  const subtitleCues = useProjectStore((s) => s.project.subtitles.cues);
  const pxPerSecond = useUiStore((s) => s.pxPerSecond);
  const setZoom = useUiStore((s) => s.setZoom);
  const clips = useClipsStore((s) => s.clips);
  const hasSelection = useUiStore((s) => s.selection !== null);
  const cropMode = useUiStore((s) => s.cropMode);
  const setCropMode = useUiStore((s) => s.setCropMode);
  const selection = useUiStore((s) => s.selection);
  const canCrop = selection?.kind === "image" || selection?.kind === "video";
  const dirty = useProjectStore((s) => s.dirty);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoLanesRef = useRef<HTMLDivElement>(null);
  // Clips de la pista base (Fase 1: única pista). Referencia estable vía EMPTY_CLIPS.
  const baseClips = project.tracks.video[0]?.clips ?? EMPTY_CLIPS;
  const videoCount = baseClips.length;
  const prevVideoCount = useRef(videoCount);
  // Scroll al clip recién añadido por el usuario (no al restaurar sesión: dirty=false)
  useEffect(() => {
    if (videoCount > prevVideoCount.current && dirty && scrollRef.current && baseClips.length > 0) {
      const last = baseClips[baseClips.length - 1];
      const left = 80 + last.timelineStart * pxPerSecond - 60;
      scrollRef.current.scrollLeft = Math.max(0, left);
    }
    prevVideoCount.current = videoCount;
  }, [videoCount, baseClips, pxPerSecond, dirty]);
  const canSplit = baseClips.length > 0;

  const duration = projectDuration(project);
  const contentWidth = Math.max(600, (duration + 5) * pxPerSecond);

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

  const audioBlocks: BlockDescriptor[] = project.tracks.audio.map((a) => ({
    id: a.id,
    kind: "audio" as const,
    start: a.start,
    end: a.end,
    label: a.fileName,
    color: "bg-sky-500/20 text-sky-200",
    waveform: { kind: "asset" as const, fileName: a.fileName, trimIn: a.trimIn, trimOut: a.trimOut },
  }));

  const subtitleBlocks: BlockDescriptor[] = subtitleCues.map((c) => ({
    id: c.id,
    kind: "subtitle" as const,
    start: cueStart(c),
    end: cueEnd(c),
    label: c.words.map((w) => w.text).join(" "),
    color: "bg-pink-500/20 text-pink-200",
  }));

  const videoTracks = project.tracks.video;
  const blocksForTrack = (clipsOfTrack: VideoClip[]): BlockDescriptor[] =>
    clipsOfTrack.map((c) => {
      const info = clips.find((i) => i.id === c.clipId);
      return {
        id: c.id, kind: "video" as const, start: c.timelineStart, end: clipEnd(c),
        label: info?.title ?? "clip", color: "bg-accent/25 text-accent-soft",
        waveform: info ? { kind: "clip" as const, fileName: info.fileName, trimIn: c.trimIn, trimOut: c.trimOut } : undefined,
      };
    });

  const handleVideoMoveEnd = (clipId: string, clientY: number, start: number) => {
    const cont = videoLanesRef.current;
    if (!cont) return;
    const contRect = cont.getBoundingClientRect();

    // Si el puntero cae por ENCIMA del bloque de carriles: crear pista nueva arriba
    if (clientY < contRect.top) {
      const id = useProjectStore.getState().addVideoTrack("top");
      useProjectStore.getState().moveClipToTrack(clipId, id, start);
      return;
    }
    // Si el puntero cae por DEBAJO del bloque de carriles: crear pista nueva abajo
    if (clientY >= contRect.bottom) {
      const id = useProjectStore.getState().addVideoTrack("bottom");
      useProjectStore.getState().moveClipToTrack(clipId, id, start);
      return;
    }

    // order[k] = índice de pista del carril visual k (0 = arriba). Los carriles se
    // renderizan en orden inverso (índice alto arriba = capa superior).
    const order = videoTracks.map((_, i) => i).reverse();
    // Carril destino = el hijo (carril) cuyo rect contiene la Y del puntero. Medir el
    // DOM real evita depender de alturas/bordes fijos y funciona con N pistas.
    // INVARIANTE: cont.children son SOLO carriles TrackRow (las GapDrop son hermanas).
    const lanes = Array.from(cont.children) as HTMLElement[];
    let visualLane = lanes.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return clientY >= r.top && clientY < r.bottom;
    });
    if (visualLane === -1) {
      // dentro del rect del cont pero entre carriles: clampa al primero/último
      visualLane = clientY < contRect.top ? 0 : order.length - 1;
    }
    const destIndex = order[Math.max(0, Math.min(order.length - 1, visualLane))];
    const destTrack = videoTracks[destIndex];
    const srcTrack = videoTracks.find((t) => t.clips.some((c) => c.id === clipId));
    if (!destTrack || !srcTrack || srcTrack.id === destTrack.id) return; // misma pista: no-op
    useProjectStore.getState().moveClipToTrack(clipId, destTrack.id, start);
  };

  // Texto, imagen, audio y subtítulos pueden solaparse en el tiempo: carriles automáticos
  const textLanes = assignLanes(textBlocks);
  const imageLanes = assignLanes(imageBlocks);
  const audioLanes = assignLanes(audioBlocks);
  const subtitleLanes = assignLanes(subtitleBlocks);

  return (
    <footer className="bg-surface border-t border-border flex flex-col shrink-0" style={{ height }}>
      <div className="flex items-center gap-2 px-3 py-1 border-b border-border">
        <span className="text-[10px] text-muted">Línea de tiempo</span>
        <button
          type="button"
          disabled={!canSplit}
          onClick={() => useProjectStore.getState().splitVideoAt(useUiStore.getState().playhead)}
          title="Dividir en el playhead (S)"
          aria-label="Dividir clip en el playhead"
          className="flex items-center gap-1 text-muted hover:text-text disabled:opacity-40 disabled:hover:text-muted text-xs px-1.5"
        >
          <Scissors size={14} aria-hidden="true" />
          Dividir
        </button>
        <button
          type="button"
          disabled={!hasSelection}
          onClick={() => {
            const sel = useUiStore.getState().selection;
            if (!sel) return;
            useProjectStore.getState().removeElement(sel.kind, sel.id);
            useUiStore.getState().select(null);
          }}
          title="Eliminar seleccionado (Supr)"
          aria-label="Eliminar elemento seleccionado"
          className="flex items-center gap-1 text-muted hover:text-danger disabled:opacity-40 disabled:hover:text-muted text-xs px-1.5"
        >
          <Trash2 size={14} aria-hidden="true" />
          Eliminar
        </button>
        {cropMode ? (
          <span className="text-[10px] text-accent-soft ml-2">↩ Enter para aplicar · Esc para cancelar</span>
        ) : (
          <button
            type="button"
            disabled={!canCrop}
            onClick={() => setCropMode(true)}
            title="Recortar elemento (C)"
            aria-label="Recortar elemento seleccionado"
            className="flex items-center gap-1 text-muted hover:text-text disabled:opacity-40 disabled:hover:text-muted text-xs px-1.5"
          >
            <Crop size={14} aria-hidden="true" />
            Recortar
          </button>
        )}
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

      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto">
        <div className="relative" style={{ width: contentWidth }}>
          <div className="ml-20">
            <TimeRuler duration={duration} pxPerSecond={pxPerSecond} onSeek={seek} />
          </div>
          {/* Botón "+" en la columna de etiquetas, encima de los carriles de vídeo */}
          <div className="flex border-b border-border/60">
            <div className="w-20 shrink-0 px-2 py-0.5 border-r border-border bg-surface sticky left-0 z-10">
              <button
                type="button"
                onClick={() => useProjectStore.getState().addVideoTrack("top")}
                title="Añadir pista de vídeo"
                aria-label="Añadir pista de vídeo"
                className="text-muted hover:text-text text-sm leading-none"
              >
                +
              </button>
            </div>
            <div className="flex-1" />
          </div>
          {/* GapDrop superior — hermana de videoLanesRef (no hija) */}
          <GapDrop
            position="top"
            pxPerSecond={pxPerSecond}
            onDrop={(pos, t, clipId) => {
              const clip = clips.find((c) => c.id === clipId);
              if (!clip) return;
              const id = useProjectStore.getState().addVideoTrack(pos);
              useProjectStore.getState().addVideoClipToTrack(clip, id, t);
              useUiStore.getState().select(null);
            }}
          />
          {/* INVARIANTE: videoLanesRef.current.children son SOLO carriles TrackRow */}
          <div ref={videoLanesRef}>
            {videoTracks.map((_, i) => i).reverse().map((i) => {
              const track = videoTracks[i];
              const isBase = i === 0;
              return (
                <TrackRow
                  key={track.id}
                  title={isBase ? "Vídeo" : `Vídeo ${i + 1}`}
                  blocks={blocksForTrack(track.clips)}
                  pxPerSecond={pxPerSecond}
                  onMove={(id, t, transient) => moveVideoClip(id, t, { transient })}
                  onTrim={(id, edge, t, transient) => trimVideoClip(id, edge, t, { transient })}
                  onDropClip={(clipId, t) => {
                    const clip = clips.find((c) => c.id === clipId);
                    if (!clip) return;
                    useProjectStore.getState().addVideoClipToTrack(clip, track.id, t);
                    useUiStore.getState().select(null);
                  }}
                  onRemoveTrack={isBase ? undefined : () => useProjectStore.getState().removeVideoTrack(track.id)}
                  onMoveEnd={handleVideoMoveEnd}
                />
              );
            })}
          </div>
          {/* GapDrop inferior — hermana de videoLanesRef (no hija) */}
          <GapDrop
            position="bottom"
            pxPerSecond={pxPerSecond}
            onDrop={(pos, t, clipId) => {
              const clip = clips.find((c) => c.id === clipId);
              if (!clip) return;
              const id = useProjectStore.getState().addVideoTrack(pos);
              useProjectStore.getState().addVideoClipToTrack(clip, id, t);
              useUiStore.getState().select(null);
            }}
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
          <TrackRow
            title="Música"
            blocks={audioBlocks}
            pxPerSecond={pxPerSecond}
            lanes={audioLanes.lanes}
            laneCount={audioLanes.count}
            onMove={(id, t, transient) => moveOverlay("audio", id, t, { transient })}
            onTrim={(id, edge, t, transient) => trimAudio(id, edge, t, { transient })}
          />
          <TrackRow
            title="Subtítulos"
            blocks={subtitleBlocks}
            pxPerSecond={pxPerSecond}
            lanes={subtitleLanes.lanes}
            laneCount={subtitleLanes.count}
            onMove={(id, t, transient) => moveCue(id, t, { transient })}
            onTrim={(id, edge, t, transient) => trimCue(id, edge, t, { transient })}
          />
          <PlayheadLine pxPerSecond={pxPerSecond} />
        </div>
      </div>
    </footer>
  );
}
