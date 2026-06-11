import { useRef } from "react";
import type { Project } from "@clipforge/shared";
import { findSnapPoints, snapTime } from "../../lib/timeline";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore, type Selection } from "../../stores/uiStore";

export interface BlockDescriptor {
  id: string;
  kind: Selection["kind"];
  start: number;
  end: number;
  label: string;
  color: string; // clases tailwind del bloque
}

interface TrackRowProps {
  title: string;
  blocks: BlockDescriptor[];
  pxPerSecond: number;
  /** Mueve el bloque a un nuevo start (ya con snap aplicado). */
  onMove: (id: string, newStart: number, transient: boolean) => void;
}

const SNAP_PX = 8;

export function TrackRow({ title, blocks, pxPerSecond, onMove }: TrackRowProps) {
  // started: la transacción de historial se abre en el PRIMER movimiento real,
  // no en el pointerdown — un simple clic de selección no debe crear entrada de undo
  const dragRef = useRef<{ id: string; offsetT: number; started: boolean } | null>(null);
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const beginTransaction = useProjectStore((s) => s.beginTransaction);

  const snapThreshold = SNAP_PX / pxPerSecond;

  const projectFor = (): Project => useProjectStore.getState().project;

  return (
    <div className="flex border-b border-border/60">
      <div className="w-20 shrink-0 px-2 py-1 text-[10px] text-muted border-r border-border bg-surface sticky left-0 z-10">
        {title}
      </div>
      <div className="relative h-9 flex-1">
        {blocks.map((b) => {
          const selected = selection?.id === b.id;
          return (
            <button
              key={b.id}
              type="button"
              aria-label={`${title}: ${b.label}`}
              aria-pressed={selected}
              className={`absolute top-1 h-7 rounded-md border text-[10px] truncate px-1.5 text-left cursor-grab active:cursor-grabbing ${b.color} ${
                selected ? "border-accent ring-1 ring-accent" : "border-transparent"
              }`}
              style={{ left: b.start * pxPerSecond, width: Math.max(8, (b.end - b.start) * pxPerSecond) }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                select({ kind: b.kind, id: b.id });
                const rect = e.currentTarget.getBoundingClientRect();
                dragRef.current = {
                  id: b.id,
                  offsetT: (e.clientX - rect.left) / pxPerSecond,
                  started: false,
                };
              }}
              onPointerMove={(e) => {
                const drag = dragRef.current;
                if (!drag || drag.id !== b.id) return;
                if (!drag.started) {
                  beginTransaction();
                  drag.started = true;
                }
                const trackRect = e.currentTarget.parentElement!.getBoundingClientRect();
                const rawStart = (e.clientX - trackRect.left) / pxPerSecond - drag.offsetT;
                const points = findSnapPoints(projectFor(), b.id);
                const snapped = snapTime(Math.max(0, rawStart), points, snapThreshold);
                onMove(b.id, snapped, true);
              }}
              onPointerUp={() => {
                dragRef.current = null;
              }}
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
