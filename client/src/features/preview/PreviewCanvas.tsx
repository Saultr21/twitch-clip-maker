import { useMemo, useRef, type ReactNode, type RefObject } from "react";
import { ASPECT_PRESETS } from "@clipforge/shared";
import { videoClipAt } from "../../lib/timeline";
import { useClipsStore } from "../../stores/clipsStore";
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
  // Doble suscripción: la pista de vídeo (ediciones de zoom en tiempo real) y el
  // playhead (cambio de clip activo). El objeto clip es estable (immer) mientras
  // no se edite, así que el playhead no re-renderiza a 60fps
  const videoTrack = useProjectStore((s) => s.project.tracks.video);
  const activeClip = useUiStore((s) => videoClipAt(videoTrack, s.playhead));
  const clips = useClipsStore((s) => s.clips);
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

  // El vídeo se dimensiona explícitamente según el aspecto real de su fuente:
  // zoom.scale=1 = fotograma completo visible (contain, con negro alrededor si
  // el aspecto difiere); >1 amplía y recorta; zoom.x/y posicionan
  const videoStyle = useMemo(() => {
    if (!activeClip || !canvas.width) return null;
    const info = clips.find((c) => c.id === activeClip.clipId);
    if (!info) return null;
    const baseScale = Math.min(canvas.width / info.width, canvas.height / info.height);
    const w = info.width * baseScale * activeClip.zoom.scale;
    const h = info.height * baseScale * activeClip.zoom.scale;
    return {
      width: w,
      height: h,
      left: activeClip.zoom.x * (canvas.width - w),
      top: activeClip.zoom.y * (canvas.height - h),
    };
  }, [activeClip, clips, canvas]);

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
            preload="auto"
            // max-w-none: el preflight de Tailwind capa los <video> a max-width 100%
            // y rompería el zoom cuando el vídeo desborda el lienzo
            className="absolute max-w-none"
            style={{
              visibility: inGap || !videoStyle ? "hidden" : "visible",
              ...(videoStyle ?? { inset: 0, width: "100%", height: "100%" }),
            }}
          />
          {canvas.width > 0 && children?.(canvas)}
        </div>
      </div>
    </div>
  );
}
