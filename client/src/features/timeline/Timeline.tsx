import { useEffect, useRef, useState } from "react";
import { Crop, Scissors, Trash2 } from "lucide-react";
import type { ImageOverlay, MediaLayer, TextOverlay, VideoClip } from "@clipforge/shared";
import { allVideoClips } from "@clipforge/shared";
import { assignLanes, clipEnd, projectDuration } from "../../lib/timeline";
import { cueStart, cueEnd } from "../../lib/subtitles";
import { useClipsStore } from "../../stores/clipsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { usePlayback } from "../preview/PreviewArea";
import { useElementSize } from "../preview/useElementSize";
import { TimeRuler } from "./TimeRuler";
import { TrackRow, type BlockDescriptor } from "./TrackRow";

// Componente propio: el playhead cambia a 60fps durante la reproducción y
// suscribirlo aquí evita re-renderizar el Timeline completo en cada frame
function PlayheadLine({ pxPerSecond }: { pxPerSecond: number }) {
  const playhead = useUiStore((s) => s.playhead);
  return (
    <div
      aria-hidden="true"
      className="absolute top-0 bottom-0 w-px bg-accent pointer-events-none z-30"
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
  highlight = false,
}: {
  position: "top" | "bottom";
  pxPerSecond: number;
  onDrop: (pos: "top" | "bottom", t: number, clipId: string) => void;
  /** Resaltado controlado (p. ej. mientras se arrastra un elemento hacia el borde). */
  highlight?: boolean;
}) {
  const [active, setActive] = useState(false);
  const on = active || highlight;
  return (
    <div className="flex">
      <div className="w-20 shrink-0 border-r border-border bg-surface sticky left-0 z-10" />
      <div
        className={`flex-1 grid place-items-center transition-all ${on ? "h-5 bg-accent/25 ring-1 ring-inset ring-accent" : "h-2"}`}
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
      >
        {on && <span className="text-[9px] text-accent-soft leading-none">+ nueva capa</span>}
      </div>
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
  const addMediaLayer = useProjectStore((s) => s.addMediaLayer);
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
    // Carril (capa media) resaltado como destino al soltar DENTRO de él.
    targetLayerId: string | null;
    // Línea de inserción: si está definida, al soltar se crea una capa nueva en
    // `index` del array de capas, y la línea se pinta en pantalla en `lineY`
    // (estilo Adobe: arrastrar entre dos carriles crea una capa entre medias).
    insert: { index: number; lineY: number; lineLeft: number; lineWidth: number } | null;
  } | null>(null);

  // Clips de vídeo (de todas las capas) para el auto-scroll al añadir y "Dividir".
  const videoClips = allVideoClips(project);
  const videoCount = videoClips.length;
  const prevVideoCount = useRef(videoCount);
  // Scroll al clip recién añadido por el usuario (no al restaurar sesión: dirty=false)
  useEffect(() => {
    if (videoCount > prevVideoCount.current && dirty && scrollRef.current && videoClips.length > 0) {
      const last = videoClips[videoClips.length - 1];
      const left = 80 + last.timelineStart * pxPerSecond - 60;
      scrollRef.current.scrollLeft = Math.max(0, left);
    }
    prevVideoCount.current = videoCount;
  }, [videoCount, videoClips, pxPerSecond, dirty]);
  const canSplit = videoCount > 0;

  const duration = projectDuration(project);
  // El contenido llena al menos el ancho visible del panel (aunque el proyecto sea
  // corto), para que la regla y los carriles no terminen a media pantalla.
  const viewport = useElementSize(scrollRef);
  const HEADER_W = 80; // ancho de la columna de cabeceras (w-20)
  const contentWidth = Math.max(600, (duration + 5) * pxPerSecond, viewport.width);
  // La regla dibuja marcas hasta cubrir todo el ancho del contenido.
  const rulerDuration = Math.max(duration, (contentWidth - HEADER_W) / pxPerSecond);

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

  const subtitleLanes = assignLanes(subtitleBlocks);

  // Capas unificadas (vídeo + imagen + texto), en orden inverso para render
  const layers = project.tracks.layers;
  const reversedIndices = layers.map((_, i) => i).reverse();

  function blocksForLayer(layer: MediaLayer): BlockDescriptor[] {
    const videoClips = layer.items.filter((it) => it.kind === "video") as unknown as VideoClip[];
    const imageItems = layer.items.filter((it) => it.kind === "image") as unknown as ImageOverlay[];
    const textItems = layer.items.filter((it) => it.kind === "text") as unknown as TextOverlay[];

    const blocks: BlockDescriptor[] = [];
    for (const c of videoClips) {
      const info = clips.find((i) => i.id === c.clipId);
      blocks.push({
        id: c.id, kind: "video" as const, start: c.timelineStart, end: clipEnd(c),
        label: info?.title ?? "clip", color: "bg-accent/25 text-accent-soft",
        waveform: info ? { kind: "clip" as const, fileName: info.fileName, trimIn: c.trimIn, trimOut: c.trimOut } : undefined,
      });
    }
    for (const item of imageItems) {
      blocks.push({
        id: item.id, kind: "image" as const, start: item.start, end: item.end,
        label: item.fileName, color: "bg-amber-500/20 text-amber-200",
      });
    }
    for (const item of textItems) {
      blocks.push({
        id: item.id, kind: "text" as const, start: item.start, end: item.end,
        label: item.content || "texto", color: "bg-emerald-500/20 text-emerald-200",
      });
    }
    return blocks;
  }

  // Carriles "media" genéricos: el orden visual va de arriba (frente) a abajo
  // (fondo). Se numeran por posición visual para dar un asa estable de agarre.
  function layerTitle(_layer: MediaLayer, visualIndex: number): string {
    return `Capa ${visualIndex + 1}`;
  }

  // Bandas verticales dentro de un carril: el tercio superior inserta una capa
  // por ENCIMA, el inferior por DEBAJO y la franja central mueve DENTRO del carril.
  const BAND = 0.28;

  /**
   * Resuelve, a partir de una Y de pantalla, qué hará el arrastre vertical:
   *  - `into`:   mover el elemento al carril `layerId` existente.
   *  - `insert`: crear una capa nueva en `index` del array (con geometría de la
   *              línea de inserción para pintarla).
   * Estilo Adobe: cerca del borde de un carril → inserción entre capas; en el
   * centro → mover a ese carril.
   */
  type DropTarget =
    | { type: "into"; layerId: string }
    | { type: "insert"; index: number; lineY: number; lineLeft: number; lineWidth: number };

  const resolveDropTarget = (clientY: number): DropTarget | null => {
    const cont = layersContainerRef.current;
    if (!cont) return null;
    const contRect = cont.getBoundingClientRect();
    const laneEls = Array.from(cont.children) as HTMLElement[];
    if (laneEls.length === 0) return null;
    const lineLeft = contRect.left + 80; // tras la columna de cabeceras (w-20)
    const lineWidth = contRect.width - 80;

    // Por encima de todo el bloque: insertar en el frente (final del array).
    if (clientY < contRect.top) {
      return { type: "insert", index: layers.length, lineY: contRect.top, lineLeft, lineWidth };
    }
    // Por debajo de todo el bloque: insertar en el fondo (índice 0).
    if (clientY >= contRect.bottom) {
      return { type: "insert", index: 0, lineY: contRect.bottom, lineLeft, lineWidth };
    }

    let visualLane = laneEls.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return clientY >= r.top && clientY < r.bottom;
    });
    if (visualLane === -1) visualLane = laneEls.length - 1;

    const rect = laneEls[visualLane].getBoundingClientRect();
    const rel = (clientY - rect.top) / rect.height;
    // visual → índice del array (reversedIndices: visual 0 = última posición)
    const arr = reversedIndices[visualLane];

    if (rel < BAND) {
      // Insertar ENCIMA de este carril (más al frente) → array index arr+1
      return { type: "insert", index: arr + 1, lineY: rect.top, lineLeft, lineWidth };
    }
    if (rel > 1 - BAND) {
      // Insertar DEBAJO de este carril (más al fondo) → array index arr
      return { type: "insert", index: arr, lineY: rect.bottom, lineLeft, lineWidth };
    }
    return { type: "into", layerId: layers[arr].id };
  };

  const handleUnifiedMoveEnd = (elementId: string, clientY: number, start: number) => {
    setGhost(null);
    const sourceLayer = layers.find((layer) => layer.items.some((it) => it.id === elementId));
    if (!sourceLayer) return;

    const target = resolveDropTarget(clientY);
    if (!target) return;

    if (target.type === "insert") {
      // Crear capa nueva en el hueco indicado y mover el elemento allí.
      const newId = useProjectStore.getState().addMediaLayer(target.index);
      useProjectStore.getState().moveElementToLayer(elementId, newId, start);
      return;
    }

    // Mover DENTRO de un carril existente (cualquier tipo a cualquier capa).
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
          onClick={() => addMediaLayer()}
          title="Añadir capa al frente"
          aria-label="Añadir capa"
          className="flex items-center gap-1 text-muted hover:text-text text-xs px-1.5"
        >
          + Capa
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
          {/* Regla sticky: se queda pegada arriba al hacer scroll vertical, para
              ver siempre el playhead. La envoltura ocupa todo el ancho (con fondo)
              y la regla se desplaza 80px tras la columna de cabeceras. */}
          <div className="sticky top-0 z-20 bg-surface border-b border-border">
            <div className="ml-20">
              <TimeRuler duration={rulerDuration} pxPerSecond={pxPerSecond} onSeek={seek} />
            </div>
          </div>
          {/* GapDrop superior — hermana de layersContainerRef (no hija).
              Soltar un clip de Medios aquí crea una capa nueva al frente. */}
          <GapDrop
            position="top"
            pxPerSecond={pxPerSecond}
            onDrop={(_pos, t, clipId) => {
              const clip = clips.find((c) => c.id === clipId);
              if (!clip) return;
              const id = useProjectStore.getState().addMediaLayer(layers.length);
              useProjectStore.getState().addVideoClipToTrack(clip, id, t);
              useUiStore.getState().select(null);
            }}
          />
          {/* INVARIANTE: layersContainerRef.current.children son SOLO carriles TrackRow */}
          <div ref={layersContainerRef}>
            {reversedIndices.map((i, visualIndex) => {
              const layer = layers[i];
              return (
                <TrackRow
                  key={layer.id}
                  title={layerTitle(layer, visualIndex)}
                  blocks={blocksForLayer(layer)}
                  pxPerSecond={pxPerSecond}
                  onMove={(id, t, transient) => {
                    const item = layer.items.find((it) => it.id === id);
                    if (!item) return;
                    if (item.kind === "video") moveVideoClip(id, t, { transient });
                    else if (item.kind === "image") moveOverlay("image", id, t, { transient });
                    else if (item.kind === "text") moveOverlay("text", id, t, { transient });
                  }}
                  onTrim={(id, edge, t, transient) => {
                    const item = layer.items.find((it) => it.id === id);
                    if (!item) return;
                    if (item.kind === "video") trimVideoClip(id, edge, t, { transient });
                    else if (item.kind === "image") trimOverlay("image", id, edge, t, { transient });
                    else if (item.kind === "text") trimOverlay("text", id, edge, t, { transient });
                  }}
                  // Cualquier carril acepta soltar un clip de Medios (siempre vídeo).
                  onDropClip={(clipId, t) => {
                    const clip = clips.find((c) => c.id === clipId);
                    if (!clip) return;
                    useProjectStore.getState().addVideoClipToTrack(clip, layer.id, t);
                    useUiStore.getState().select(null);
                  }}
                  // Quitar cualquier capa (removeLayer garantiza ≥1).
                  onRemoveTrack={() => removeLayer(layer.id)}
                  // Ojito (visibilidad) y mute por capa.
                  hidden={layer.hidden}
                  onToggleHidden={() => useProjectStore.getState().toggleLayerHidden(layer.id)}
                  muted={layer.muted}
                  onToggleMuted={() => useProjectStore.getState().toggleLayerMuted(layer.id)}
                  onMoveEnd={handleUnifiedMoveEnd}
                  onMoveDrag={(p) => {
                    const target = resolveDropTarget(p.clientY);
                    setGhost({
                      label: p.label,
                      x: p.clientX,
                      y: p.clientY,
                      widthPx: p.widthPx,
                      targetLayerId: target?.type === "into" ? target.layerId : null,
                      insert:
                        target?.type === "insert"
                          ? { index: target.index, lineY: target.lineY, lineLeft: target.lineLeft, lineWidth: target.lineWidth }
                          : null,
                    });
                  }}
                  onMoveDragEnd={() => setGhost(null)}
                  highlight={ghost?.targetLayerId === layer.id}
                  trackIndex={i}
                  onReorder={(from, to) => reorderLayer(from, to)}
                />
              );
            })}
          </div>
          {/* GapDrop inferior — hermana de layersContainerRef (no hija).
              Soltar un clip de Medios aquí crea una capa nueva al fondo. */}
          <GapDrop
            position="bottom"
            pxPerSecond={pxPerSecond}
            onDrop={(_pos, t, clipId) => {
              const clip = clips.find((c) => c.id === clipId);
              if (!clip) return;
              const id = useProjectStore.getState().addMediaLayer(0);
              useProjectStore.getState().addVideoClipToTrack(clip, id, t);
              useUiStore.getState().select(null);
            }}
          />
          {/* Una pista de música por carril (varias pueden sonar a la vez), cada
              una con su icono de mute. Si no hay ninguna, un carril "Música" vacío. */}
          {project.tracks.audio.length === 0 ? (
            <TrackRow title="Música" blocks={[]} pxPerSecond={pxPerSecond} onMove={() => {}} onTrim={() => {}} />
          ) : (
            project.tracks.audio.map((a, i) => (
              <TrackRow
                key={a.id}
                title={a.fileName}
                blocks={[audioBlocks[i]]}
                pxPerSecond={pxPerSecond}
                onMove={(id, t, transient) => moveOverlay("audio", id, t, { transient })}
                onTrim={(id, edge, t, transient) => trimAudio(id, edge, t, { transient })}
                muted={a.muted}
                onToggleMuted={() => useProjectStore.getState().toggleAudioMuted(a.id)}
                onRemoveTrack={() => {
                  useProjectStore.getState().removeElement("audio", a.id);
                  useUiStore.getState().select(null);
                }}
              />
            ))
          )}
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
      {ghost?.insert && (
        // Línea de inserción "+ nueva capa": se pinta en el hueco entre dos
        // carriles (o en los extremos), no solo en los bordes del bloque.
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 flex items-center"
          style={{ left: ghost.insert.lineLeft, top: ghost.insert.lineY - 1, width: ghost.insert.lineWidth }}
        >
          <div className="h-0.5 flex-1 bg-accent" />
          <span className="ml-1 rounded bg-accent px-1 py-0.5 text-[9px] leading-none text-white">+ nueva capa</span>
        </div>
      )}
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
