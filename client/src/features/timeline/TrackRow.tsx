import { useRef, useState } from "react";
import type { Project } from "@clipforge/shared";
import { findSnapPoints, snapTime } from "../../lib/timeline";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore, type Selection } from "../../stores/uiStore";
import { WaveformCanvas } from "./WaveformCanvas";
import type { WaveformKind } from "./useWaveform";

export interface BlockDescriptor {
  id: string;
  kind: Selection["kind"];
  start: number;
  end: number;
  label: string;
  color: string; // clases tailwind del bloque
  /** Audio a dibujar como waveform dentro del bloque (vídeo y música). */
  waveform?: { kind: WaveformKind; fileName: string; trimIn: number; trimOut: number };
}

const BLOCK_HEIGHT_PX = 28; // h-7

interface TrackRowProps {
  title: string;
  blocks: BlockDescriptor[];
  pxPerSecond: number;
  /** Carril por id de bloque (los bloques solapados en el tiempo se apilan). */
  lanes?: Record<string, number>;
  laneCount?: number;
  /** Mueve el bloque a un nuevo start (ya con snap aplicado). */
  onMove: (id: string, newStart: number, transient: boolean) => void;
  /** Recorta un borde del bloque al instante t (ya con snap aplicado). */
  onTrim: (id: string, edge: "start" | "end", t: number, transient: boolean) => void;
  /** Soltar un clip de Medios (arrastrado) en el instante t de esta pista. */
  onDropClip?: (clipId: string, t: number) => void;
  /** Si se define, muestra un botón "×" en la cabecera para borrar la pista. */
  onRemoveTrack?: () => void;
  /** Al soltar un arrastre de tipo "move", informa de la Y de pantalla y el start final. */
  onMoveEnd?: (id: string, clientY: number, start: number) => void;
  /** Índice de pista para reordenar por arrastre de la cabecera (solo vídeo). */
  trackIndex?: number;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

const CLIP_DND_TYPE = "application/x-clip-id";

const SNAP_PX = 8;
const EDGE_PX = 8;

const LANE_HEIGHT = 32;

export function TrackRow({
  title,
  blocks,
  pxPerSecond,
  lanes,
  laneCount = 1,
  onMove,
  onTrim,
  onDropClip,
  onRemoveTrack,
  onMoveEnd,
  trackIndex,
  onReorder,
}: TrackRowProps) {
  const [dropActive, setDropActive] = useState(false);
  // started: la transacción de historial se abre en el PRIMER movimiento real,
  // no en el pointerdown — un simple clic de selección no debe crear entrada de undo
  const dragRef = useRef<{ id: string; mode: "move" | "trim-start" | "trim-end"; offsetT: number; started: boolean; lastStart?: number; lastClientY?: number } | null>(null);
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const beginTransaction = useProjectStore((s) => s.beginTransaction);

  const snapThreshold = SNAP_PX / pxPerSecond;

  const projectFor = (): Project => useProjectStore.getState().project;

  return (
    <div className="flex border-b border-border/60">
      <div
        className={`w-20 shrink-0 px-2 py-1 text-[10px] text-muted border-r border-border bg-surface sticky left-0 z-10 flex items-center justify-between gap-1${trackIndex !== undefined ? " cursor-grab" : ""}`}
        draggable={trackIndex !== undefined}
        onDragStart={trackIndex !== undefined ? (e) => {
          e.dataTransfer.setData("application/x-video-track-index", String(trackIndex));
          e.dataTransfer.effectAllowed = "move";
        } : undefined}
        onDragOver={trackIndex !== undefined ? (e) => {
          if (e.dataTransfer.types.includes("application/x-video-track-index")) e.preventDefault();
        } : undefined}
        onDrop={trackIndex !== undefined ? (e) => {
          const from = Number(e.dataTransfer.getData("application/x-video-track-index"));
          if (!Number.isNaN(from) && onReorder) onReorder(from, trackIndex);
        } : undefined}
      >
        <span className="truncate">{title}</span>
        {onRemoveTrack && (
          <button type="button" onClick={onRemoveTrack} title="Quitar pista"
            aria-label={`Quitar pista ${title}`} className="text-muted hover:text-danger shrink-0">×</button>
        )}
      </div>
      <div
        className={`relative flex-1 ${dropActive ? "bg-accent/10 ring-1 ring-inset ring-accent" : ""}`}
        style={{ height: 4 + laneCount * LANE_HEIGHT }}
        onDragOver={
          onDropClip
            ? (e) => {
                if (e.dataTransfer.types.includes(CLIP_DND_TYPE)) {
                  e.preventDefault(); // permite el drop
                  if (!dropActive) setDropActive(true);
                }
              }
            : undefined
        }
        onDragLeave={onDropClip ? () => setDropActive(false) : undefined}
        onDrop={
          onDropClip
            ? (e) => {
                e.preventDefault();
                setDropActive(false);
                const clipId = e.dataTransfer.getData(CLIP_DND_TYPE);
                if (!clipId) return;
                const rect = e.currentTarget.getBoundingClientRect();
                onDropClip(clipId, Math.max(0, (e.clientX - rect.left) / pxPerSecond));
              }
            : undefined
        }
      >
        {blocks.map((b) => {
          const selected = selection?.id === b.id;
          return (
            <button
              key={b.id}
              type="button"
              aria-label={`${title}: ${b.label}`}
              aria-pressed={selected}
              className={`absolute h-7 rounded-md border text-[10px] truncate px-1.5 text-left cursor-grab active:cursor-grabbing ${b.color} ${
                selected ? "border-accent ring-1 ring-accent" : "border-transparent"
              }`}
              style={{
                left: b.start * pxPerSecond,
                top: 4 + (lanes?.[b.id] ?? 0) * LANE_HEIGHT,
                width: Math.max(8, (b.end - b.start) * pxPerSecond),
              }}
              onKeyDown={(e) => {
                if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  e.stopPropagation();
                  useProjectStore.getState().removeElement(b.kind, b.id);
                  useUiStore.getState().select(null);
                }
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                select({ kind: b.kind, id: b.id });
                const rect = e.currentTarget.getBoundingClientRect();
                const px = e.clientX - rect.left;
                // En bloques muy estrechos las asas ocuparían todo el ancho y
                // sería imposible moverlos: solo hay trim si queda zona central
                const hasEdges = rect.width > EDGE_PX * 3;
                const mode =
                  hasEdges && px < EDGE_PX
                    ? "trim-start"
                    : hasEdges && px > rect.width - EDGE_PX
                      ? "trim-end"
                      : "move";
                dragRef.current = { id: b.id, mode, offsetT: px / pxPerSecond, started: false };
              }}
              onPointerMove={(e) => {
                const drag = dragRef.current;
                if (!drag || drag.id !== b.id) return;
                if (!drag.started) {
                  beginTransaction(); // primer movimiento real: una sola entrada de undo por arrastre
                  drag.started = true;
                }
                const trackRect = e.currentTarget.parentElement!.getBoundingClientRect();
                const pointerT = (e.clientX - trackRect.left) / pxPerSecond;
                const points = findSnapPoints(projectFor(), b.id);
                if (drag.mode === "move") {
                  const snapped = snapTime(Math.max(0, pointerT - drag.offsetT), points, snapThreshold);
                  onMove(b.id, snapped, true);
                  drag.lastStart = snapped;
                  drag.lastClientY = e.clientY;
                } else {
                  const snapped = snapTime(Math.max(0, pointerT), points, snapThreshold);
                  onTrim(b.id, drag.mode === "trim-start" ? "start" : "end", snapped, true);
                }
              }}
              onPointerUp={() => {
                const drag = dragRef.current;
                if (drag?.mode === "move" && drag.started && onMoveEnd) {
                  onMoveEnd(drag.id, drag.lastClientY ?? 0, drag.lastStart ?? 0);
                }
                dragRef.current = null;
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
            >
              {b.waveform && (
                <WaveformCanvas
                  kind={b.waveform.kind}
                  fileName={b.waveform.fileName}
                  trimIn={b.waveform.trimIn}
                  trimOut={b.waveform.trimOut}
                  width={Math.max(8, (b.end - b.start) * pxPerSecond)}
                  height={BLOCK_HEIGHT_PX}
                  color="currentColor"
                />
              )}
              <span aria-hidden="true" className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize rounded-l-md bg-white/10" />
              <span aria-hidden="true" className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize rounded-r-md bg-white/10" />
              <span className="relative">{b.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
