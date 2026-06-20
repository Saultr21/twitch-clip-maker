import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { Clapperboard, Link2, Upload } from "lucide-react";
import { ASPECT_PRESETS, videoLayers, type VideoLayer } from "@clipforge/shared";
import { videoClipAt } from "../../lib/timeline";
import { useClipsStore } from "../../stores/clipsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { usePlayback } from "./PreviewArea";
import { useElementSize } from "./useElementSize";
import { visibleRect } from "./trackVideo";

interface PreviewCanvasProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Capa de overlays (Konva) que se monta encima del vídeo, mismo tamaño. */
  children?: (canvasSize: { width: number; height: number }) => ReactNode;
  inGap: boolean;
}

const ASPECT_OPTIONS = ["9:16", "16:9", "1:1", "4:5"] as const;

/** Extrae la cadena CSS `filter` a partir del objeto de filtros de un clip. */
function clipCssFilter(f: {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  grayscale: number;
}): string | undefined {
  return (
    [
      f.brightness !== 0 ? `brightness(${1 + f.brightness})` : "",
      f.contrast !== 1 ? `contrast(${f.contrast})` : "",
      f.saturation !== 1 ? `saturate(${f.saturation})` : "",
      f.hue !== 0 ? `hue-rotate(${f.hue}deg)` : "",
      f.grayscale !== 0 ? `grayscale(${f.grayscale})` : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

/**
 * Un <video> por capa, siempre montado (nunca se remonta al cambiar clip/crop).
 * La capa base (isBase=true) usa videoRef; las capas se registran en el motor
 * vía registerOverlayVideo para que las sincronice.
 */
function TrackVideo({
  track,
  canvas,
  isBase,
  videoRef,
  register,
  zIndex,
}: {
  track: VideoLayer;
  canvas: { width: number; height: number };
  isBase: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
  register?: (id: string, el: HTMLVideoElement | null) => void;
  zIndex: number;
}) {
  const playhead = useUiStore((s) => s.playhead);
  const cropMode = useUiStore((s) => s.cropMode);
  const selection = useUiStore((s) => s.selection);
  const clipsInfo = useClipsStore((s) => s.clips);

  const active = videoClipAt(track.clips, playhead);
  const info = active ? clipsInfo.find((c) => c.id === active.clipId) : undefined;

  // ref: la base usa videoRef externo; las capas tienen su ref local y se registran
  const localRef = useRef<HTMLVideoElement>(null);
  // Identidad estable: si no se memoiza, React invoca el ref-callback con null y
  // luego con el elemento en CADA render, re-registrando el <video> (delete→set)
  // en cada tick del playhead, con riesgo de perder un ciclo de sync
  const setEl = useCallback((el: HTMLVideoElement | null) => {
    if (isBase && videoRef) {
      (videoRef as MutableRefObject<HTMLVideoElement | null>).current = el;
    } else {
      localRef.current = el;
      register?.(track.id, el);
    }
  }, [isBase, videoRef, register, track.id]);

  if (!info || !canvas.width) {
    // Mantener el <video> montado pero oculto para no remontar
    return (
      <video
        ref={setEl}
        preload="auto"
        className="absolute max-w-none"
        style={{ visibility: "hidden", inset: 0, width: "100%", height: "100%", zIndex, pointerEvents: "none" }}
      />
    );
  }

  // En modo crop, el clip seleccionado muestra el frame completo (sin recorte)
  const isCroppingThis =
    cropMode && selection?.kind === "video" && selection.id === active!.id;
  const crop = isCroppingThis ? null : (active!.crop ?? null);

  const r = visibleRect(canvas.width, canvas.height, info, active!.zoom, crop);
  const cssFilter = clipCssFilter(active!.filters);
  const opacity = active!.opacity;
  // Esta pista tiene clip activo (si no, ya retornó arriba): se ve siempre, con
  // independencia de si la BASE está en un hueco. (Antes colgaba de inGap global y
  // al vaciarse la base se ocultaban todas las pistas.)
  const visible = "visible";

  const wrapperStyle: CSSProperties = {
    position: "absolute",
    left: r.left,
    top: r.top,
    width: r.w,
    height: r.h,
    overflow: "hidden",
    visibility: visible,
    opacity,
    zIndex,
    // Solo visual: la interacción (seleccionar/mover) es vía la capa Konva que va
    // encima. Sin esto, el wrapper de una pista superior (zIndex≥1) quedaría por
    // encima de Konva y se tragaría los clics → no se podrían seleccionar esos clips.
    pointerEvents: "none",
  };

  const innerStyle: CSSProperties = {
    position: "absolute",
    width: r.fullW,
    height: r.fullH,
    left: -r.fullW * r.cropX,
    top: -r.fullH * r.cropY,
    filter: cssFilter,
  };

  return (
    <div style={wrapperStyle}>
      <video
        ref={setEl}
        preload="auto"
        // max-w-none: el preflight de Tailwind limita los <video> a max-width 100%
        // y rompería el zoom al desbordar el lienzo
        className="absolute max-w-none"
        style={innerStyle}
      />
    </div>
  );
}

export function PreviewCanvas({ videoRef, children, inGap }: PreviewCanvasProps) {
  const settings = useProjectStore((s) => s.project.settings);
  const setAspect = useProjectStore((s) => s.setAspect);
  const select = useUiStore((s) => s.select);
  const videoTracks = useProjectStore((s) => videoLayers(s.project));
  // Para la comprobación "sin clips" del estado vacío, miramos la capa base
  const baseTrackClips = videoTracks[0]?.clips ?? [];
  const background = settings.background;
  const containerRef = useRef<HTMLDivElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const container = useElementSize(containerRef);
  const { registerOverlayVideo } = usePlayback();

  // Fondo blur: un <video> espejo del principal, escalado a cover y desenfocado
  useEffect(() => {
    if (background.type !== "blur") return;
    let raf = 0;
    const tick = () => {
      const main = videoRef.current;
      const bgv = bgVideoRef.current;
      if (main && bgv) {
        const src = main.getAttribute("src");
        if (src && bgv.getAttribute("src") !== src) bgv.src = src;
        if (Math.abs(bgv.currentTime - main.currentTime) > 0.2) bgv.currentTime = main.currentTime;
        if (!main.paused && bgv.paused) void bgv.play().catch(() => {});
        if (main.paused && !bgv.paused) bgv.pause();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [background.type, videoRef]);

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
        className="relative flex-1 min-h-0 grid place-items-center p-4 overflow-hidden"
      >
        {/* El <video> existe SIEMPRE (aunque el lienzo mida 0 hasta el primer
            ResizeObserver): el motor engancha sus listeners en el montaje.
            Sin overflow-hidden: lo que desborda el lienzo se ve atenuado por el
            velo de abajo, para saber qué parte queda fuera del encuadre */}
        <div
          className="relative rounded-sm shadow-[0_4px_24px_rgba(145,70,255,.15)]"
          style={{
            width: canvas.width,
            height: canvas.height,
            backgroundColor: background.type === "color" ? background.color : "#000000",
          }}
        >
          {background.type === "image" && background.fileName && (
            <img
              src={`/assets/${background.fileName}`}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full max-w-none pointer-events-none"
              style={{ objectFit: "cover" }}
            />
          )}
          {background.type === "blur" && (
            // capa propia recortada: el scale 1.1 tapa el borde del blur sin
            // recortar el vídeo principal, el velo ni las asas de Konva
            <div className="absolute inset-0 overflow-hidden rounded-sm pointer-events-none">
              <video
                ref={bgVideoRef}
                muted
                aria-hidden="true"
                className="absolute inset-0 w-full h-full max-w-none"
                style={{
                  objectFit: "cover",
                  filter: `blur(${Math.max(2, Math.round(background.blur * 24))}px)`,
                  transform: "scale(1.1)",
                  visibility: inGap ? "hidden" : "visible",
                }}
              />
            </div>
          )}
          {/* Una TrackVideo por pista en z-order ascendente. La pista base (i=0)
              conserva videoRef; las superiores se registran en el motor para sync. */}
          {videoTracks.map((track, i) => (
            <TrackVideo
              key={track.id}
              track={track}
              canvas={canvas}
              isBase={i === 0}
              videoRef={i === 0 ? videoRef : undefined}
              register={i === 0 ? undefined : registerOverlayVideo}
              zIndex={i}
            />
          ))}
          {/* Velo con agujero: oscurece todo lo que queda fuera del lienzo */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none rounded-sm"
            style={{ boxShadow: "0 0 0 600px rgba(10, 10, 12, 0.85)", zIndex: 100 }}
          />
          {canvas.width > 0 && children?.(canvas)}
        </div>

        {baseTrackClips.length === 0 && (
          <div className="absolute inset-0 grid place-items-center p-6 pointer-events-none">
            <div className="max-w-xs text-center flex flex-col items-center gap-3 text-muted">
              <Clapperboard size={40} strokeWidth={1.5} aria-hidden="true" className="text-accent-soft" />
              <p className="text-sm font-semibold text-text">Empieza añadiendo un vídeo</p>
              <ul className="text-[11px] flex flex-col gap-1.5">
                <li className="flex items-center justify-center gap-1.5">
                  <Link2 size={13} aria-hidden="true" /> Pega una URL de vídeo (Twitch, YouTube, TikTok…)
                </li>
                <li className="flex items-center justify-center gap-1.5">
                  <Upload size={13} aria-hidden="true" /> Sube o arrastra un vídeo del escritorio
                </li>
              </ul>
              <p className="text-[10px]">Luego haz doble clic o arrástralo a la línea de tiempo.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
