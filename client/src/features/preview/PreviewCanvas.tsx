import { useMemo, useRef, type ReactNode, type RefObject } from "react";
import { ASPECT_PRESETS } from "@clipforge/shared";
import { videoClipAt } from "../../lib/timeline";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { useElementSize } from "./useElementSize";

interface PreviewCanvasProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Capa de overlays (Konva) que se monta encima del vídeo, mismo tamaño. */
  children?: (canvasSize: { width: number; height: number }) => ReactNode;
  inGap: boolean;
}

const ASPECT_OPTIONS = ["9:16", "16:9", "1:1", "4:5"] as const;

export function PreviewCanvas({ videoRef, children, inGap }: PreviewCanvasProps) {
  const settings = useProjectStore((s) => s.project.settings);
  const setAspect = useProjectStore((s) => s.setAspect);
  const select = useUiStore((s) => s.select);
  // El objeto zoom del clip activo es estable (immer) mientras no se edite,
  // así que esta suscripción al playhead no re-renderiza a 60fps
  const zoom = useUiStore((s) => {
    const project = useProjectStore.getState().project;
    return videoClipAt(project.tracks.video, s.playhead)?.zoom ?? null;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const container = useElementSize(containerRef);

  const canvas = useMemo(() => {
    if (!container.width || !container.height) return { width: 0, height: 0 };
    const scale = Math.min(
      container.width / settings.width,
      container.height / settings.height,
    );
    return {
      width: Math.floor(settings.width * scale),
      height: Math.floor(settings.height * scale),
    };
  }, [container, settings.width, settings.height]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-canvas">
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border">
        <label htmlFor="aspect" className="text-[11px] text-muted">
          Formato
        </label>
        <select
          id="aspect"
          value={settings.aspect}
          onChange={(e) => {
            const aspect = e.target.value as keyof typeof ASPECT_PRESETS;
            setAspect(aspect, ASPECT_PRESETS[aspect].width, ASPECT_PRESETS[aspect].height);
          }}
          className="bg-surface-2 border border-border-2 rounded-md px-2 py-0.5 text-xs"
        >
          {ASPECT_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {a} · {ASPECT_PRESETS[a].width}x{ASPECT_PRESETS[a].height}
            </option>
          ))}
        </select>
      </div>

      <div
        ref={containerRef}
        onMouseDown={(e) => {
          // clic en el fondo fuera del lienzo: deselecciona el overlay activo
          if (e.target === e.currentTarget) select(null);
        }}
        className="flex-1 min-h-0 grid place-items-center p-4 overflow-hidden"
      >
        {/* El <video> existe SIEMPRE (aunque el lienzo mida 0 hasta el primer
            ResizeObserver): el motor engancha sus listeners en el montaje */}
        <div
          className="relative bg-black rounded-sm overflow-hidden shadow-[0_4px_24px_rgba(145,70,255,.15)]"
          style={{ width: canvas.width, height: canvas.height }}
        >
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full"
            style={{
              objectFit: "cover",
              visibility: inGap ? "hidden" : "visible",
              transformOrigin: zoom ? `${zoom.x * 100}% ${zoom.y * 100}%` : undefined,
              transform: zoom && zoom.scale !== 1 ? `scale(${zoom.scale})` : undefined,
            }}
          />
          {canvas.width > 0 && children?.(canvas)}
        </div>
      </div>
    </div>
  );
}
