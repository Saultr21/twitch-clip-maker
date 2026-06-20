import { useEffect, useRef, useState } from "react";
import { Crop, Scissors, Trash2 } from "lucide-react";
import type { VideoClip } from "@clipforge/shared";
import { videoLayers } from "@clipforge/shared";
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

// Franja de drop en el hueco por encima/debajo del bloque de carriles.
// Acepta clips de Medios (DnD nativo, tipo application/x-clip-id) y llama onDrop
// para crear una pista nueva y colocar el clip.
// IMPORTANTE: este componente es HERMANO de <div ref={layersContainerRef}>, NO hijo,
// para que layersContainerRef.current.children contenga solo carriles TrackRow y el
// mapeo Y→carril de handleUnifiedMoveEnd siga siendo correcto.
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
  const addImageLayer = useProjectStore((s) => s.addImageLayer);
  const addTextLayer = useProjectStore((s) => s.addTextLayer);
  const reorderLayer = useProjectStore((s) => s.reorderLayer);
  const removeLayer = useProjectStore((s) => s.removeLayer);
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
  const layersContainerRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{
    label: string;
    x: number;
    y: number;
    widthPx: number;
    targetLayerId: string | null;
  } | null>(null);

  // Clips de la capa base (pista de vídeo 0). Referencia estable vía EMPTY_CLIPS.
  const baseClips = videoLayers(project)[0]?.clips ?? EMPTY_CLIPS;
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

  const videoTracks = videoLayers(project);
  const blocksForTrack = (clipsOfTrack: VideoClip[]): BlockDescriptor[] =>
    clipsOfTrack.map((c) => {
      const info = clips.find((i) => i.id === c.clipId);
      return {
        id: c.id, kind: "video" as const, start: c.timelineStart, end: clipEnd(c),
        label: info?.title ?? "clip", color: "bg-accent/25 text-accent-soft",
        waveform: info ? { kind: "clip" as const, fileName: info.fileName, trimIn: c.trimIn, trimOut: c.trimOut } : undefined,
      };
    });

  const audioLanes = assignLanes(audioBlocks);
  const subtitleLanes = assignLanes(subtitleBlocks);

  // Capas unificadas (vídeo + imagen + texto), en orden inverso para render
  const layers = project.tracks.layers;
  const reversedIndices = layers.map((_, i) => i).reverse();

  function blocksForLayer(layer: typeof layers[number]): BlockDescriptor[] {
    if (layer.kind === "video") {
      return blocksForTrack(layer.clips);
    }
    if (layer.kind === "image") {
      return layer.items.map((item) => ({
        id: item.id,
        kind: "image" as const,
        start: item.start,
        end: item.end,
        label: item.fileName,
        color: "bg-amber-500/20 text-amber-200",
      }));
    }
    if (layer.kind === "text") {
      return layer.items.map((item) => ({
        id: item.id,
        kind: "text" as const,
        start: item.start,
        end: item.end,
        label: item.content || "texto",
        color: "bg-emerald-500/20 text-emerald-200",
      }));
    }
    return [];
  }

  function layerTitle(layer: typeof layers[number]): string {
    const videoLayersArr = layers.filter((l) => l.kind === "video");
    const imageLayersArr = layers.filter((l) => l.kind === "image");
    const textLayersArr = layers.filter((l) => l.kind === "text");

    if (layer.kind === "video") {
      const vidIdx = videoLayersArr.findIndex((l) => l.id === layer.id);
      return vidIdx === 0 ? "Vídeo" : `Vídeo ${vidIdx + 1}`;
    }
    if (layer.kind === "image") {
      const imgIdx = imageLayersArr.findIndex((l) => l.id === layer.id);
      return imageLayersArr.length === 1 ? "Imagen" : `Imagen ${imgIdx + 1}`;
    }
    if (layer.kind === "text") {
      const txtIdx = textLayersArr.findIndex((l) => l.id === layer.id);
      return textLayersArr.length === 1 ? "Texto" : `Texto ${txtIdx + 1}`;
    }
    return "Capa";
  }

  /**
   * Mapea una coordenada Y de pantalla al layer que la contiene dentro del
   * bloque unificado, o null si el puntero está fuera.
   */
  const laneAtClientYUnified = (clientY: number): { layerId: string; kind: string } | null => {
    const cont = layersContainerRef.current;
    if (!cont) return null;
    const contRect = cont.getBoundingClientRect();
    if (clientY < contRect.top || clientY >= contRect.bottom) return null;

    const laneEls = Array.from(cont.children) as HTMLElement[];
    let visualLane = laneEls.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return clientY >= r.top && clientY < r.bottom;
    });
    if (visualLane === -1) visualLane = laneEls.length - 1;

    // Los carriles se renderizan en reversedIndices order: visual 0 = capa superior
    const layerIndex = reversedIndices[Math.max(0, Math.min(reversedIndices.length - 1, visualLane))];
    const layer = layers[layerIndex];
    return layer ? { layerId: layer.id, kind: layer.kind } : null;
  };

  const handleUnifiedMoveEnd = (elementId: string, clientY: number, start: number) => {
    setGhost(null);
    const cont = layersContainerRef.current;
    if (!cont) return;
    const contRect = cont.getBoundingClientRect();

    // Detectar la capa origen del elemento
    const sourceLayer = layers.find((layer) => {
      if (layer.kind === "video") return layer.clips.some((c) => c.id === elementId);
      if (layer.kind === "image") return layer.items.some((i) => i.id === elementId);
      if (layer.kind === "text") return layer.items.some((i) => i.id === elementId);
      return false;
    });
    if (!sourceLayer) return;
    const elementKind = sourceLayer.kind;

    // Si el puntero cae por ENCIMA del bloque: crear capa nueva arriba
    if (clientY < contRect.top) {
      if (elementKind === "video") {
        const id = useProjectStore.getState().addVideoTrack("top");
        useProjectStore.getState().moveElementToLayer(elementId, id, start);
      } else if (elementKind === "image") {
        const id = useProjectStore.getState().addImageLayer();
        useProjectStore.getState().moveElementToLayer(elementId, id, start);
      } else if (elementKind === "text") {
        const id = useProjectStore.getState().addTextLayer();
        useProjectStore.getState().moveElementToLayer(elementId, id, start);
      }
      return;
    }

    // Si el puntero cae por DEBAJO del bloque: crear capa nueva abajo
    if (clientY >= contRect.bottom) {
      if (elementKind === "video") {
        const id = useProjectStore.getState().addVideoTrack("bottom");
        useProjectStore.getState().moveElementToLayer(elementId, id, start);
      } else if (elementKind === "image") {
        const id = useProjectStore.getState().addImageLayer();
        useProjectStore.getState().moveElementToLayer(elementId, id, start);
      } else if (elementKind === "text") {
        const id = useProjectStore.getState().addTextLayer();
        useProjectStore.getState().moveElementToLayer(elementId, id, start);
      }
      return;
    }

    // Dentro del bloque: encontrar el carril destino
    const target = laneAtClientYUnified(clientY);
    if (!target) return;
    if (target.kind !== elementKind) return; // kind distinto: no-op
    if (target.layerId === sourceLayer.id) return; // misma capa: no-op
    useProjectStore.getState().moveElementToLayer(elementId, target.layerId, start);
  };

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
        <button
          type="button"
          onClick={() => useProjectStore.getState().addVideoTrack("top")}
          title="Añadir pista de vídeo"
          aria-label="Añadir pista de vídeo"
          className="flex items-center gap-1 text-muted hover:text-text text-xs px-1.5"
        >
          + Vídeo
        </button>
        <button
          type="button"
          onClick={() => addImageLayer()}
          title="Añadir capa de imagen"
          aria-label="Añadir capa de imagen"
          className="flex items-center gap-1 text-muted hover:text-text text-xs px-1.5"
        >
          + Imagen
        </button>
        <button
          type="button"
          onClick={() => addTextLayer()}
          title="Añadir capa de texto"
          aria-label="Añadir capa de texto"
          className="flex items-center gap-1 text-muted hover:text-text text-xs px-1.5"
        >
          + Texto
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

      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto">
        <div className="relative" style={{ width: contentWidth }}>
          <div className="ml-20">
            <TimeRuler duration={duration} pxPerSecond={pxPerSecond} onSeek={seek} />
          </div>
          {/* GapDrop superior — hermana de layersContainerRef (no hija) */}
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
          {/* INVARIANTE: layersContainerRef.current.children son SOLO carriles TrackRow */}
          <div ref={layersContainerRef}>
            {reversedIndices.map((i) => {
              const layer = layers[i];
              const isBaseVideoLayer =
                layer.kind === "video" &&
                videoTracks.findIndex((t) => t.id === layer.id) === 0;

              return (
                <TrackRow
                  key={layer.id}
                  title={layerTitle(layer)}
                  blocks={blocksForLayer(layer)}
                  pxPerSecond={pxPerSecond}
                  onMove={(id, t, transient) => {
                    if (layer.kind === "video") moveVideoClip(id, t, { transient });
                    else if (layer.kind === "image") moveOverlay("image", id, t, { transient });
                    else if (layer.kind === "text") moveOverlay("text", id, t, { transient });
                  }}
                  onTrim={(id, edge, t, transient) => {
                    if (layer.kind === "video") trimVideoClip(id, edge, t, { transient });
                    else if (layer.kind === "image") trimOverlay("image", id, edge, t, { transient });
                    else if (layer.kind === "text") trimOverlay("text", id, edge, t, { transient });
                  }}
                  onDropClip={
                    layer.kind === "video"
                      ? (clipId, t) => {
                          const clip = clips.find((c) => c.id === clipId);
                          if (!clip) return;
                          useProjectStore.getState().addVideoClipToTrack(clip, layer.id, t);
                          useUiStore.getState().select(null);
                        }
                      : undefined
                  }
                  onRemoveTrack={
                    isBaseVideoLayer
                      ? undefined
                      : () => removeLayer(layer.id)
                  }
                  onAddTrack={
                    layer.kind === "video"
                      ? () => useProjectStore.getState().addVideoTrack("top")
                      : undefined
                  }
                  onMoveEnd={handleUnifiedMoveEnd}
                  onMoveDrag={(p) =>
                    setGhost({
                      label: p.label,
                      x: p.clientX,
                      y: p.clientY,
                      widthPx: p.widthPx,
                      targetLayerId: laneAtClientYUnified(p.clientY)?.layerId ?? null,
                    })
                  }
                  onMoveDragEnd={() => setGhost(null)}
                  highlight={ghost?.targetLayerId === layer.id}
                  trackIndex={i}
                  onReorder={(from, to) => reorderLayer(from, to)}
                />
              );
            })}
          </div>
          {/* GapDrop inferior — hermana de layersContainerRef (no hija) */}
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
      {ghost && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 bg-accent/70 text-white text-[10px] rounded-md px-1.5 py-1 truncate shadow-lg"
          style={{
            left: ghost.x + 12,
            top: ghost.y - 10,
            width: ghost.widthPx,
            maxWidth: 300,
          }}
        >
          {ghost.label}
        </div>
      )}
    </footer>
  );
}
