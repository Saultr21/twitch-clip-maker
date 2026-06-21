import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { Clapperboard, Link2, Upload } from "lucide-react";
import { ASPECT_PRESETS } from "@clipforge/shared";
import type { MediaLayer, VideoClip } from "@clipforge/shared";
import { videoClipAt } from "../../lib/timeline";
import { useClipsStore } from "../../stores/clipsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { usePlayback } from "./PreviewArea";
import { useElementSize } from "./useElementSize";
import { visibleRect } from "./trackVideo";
import { imageInnerStyle, imageOverlayStyle, textOverlayStyle } from "./overlayCss";

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
type VideoTrackForPreview = { id: string; name: string; clips: VideoClip[] };

function TrackVideo({
  track,
  canvas,
  isBase,
  videoRef,
  register,
  zIndex,
}: {
  track: VideoTrackForPreview;
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

/**
 * Pinta en HTML el elemento de imagen/texto ACTIVO de una capa en el playhead,
 * con `zIndex` = posición de la capa (orden de capas = z). Se suscribe él mismo
 * al playhead para no re-renderizar todo el PreviewCanvas a 60fps. Konva (encima)
 * solo dibuja las asas/transformador; los píxeles visibles los pone este HTML.
 * `pointer-events:none`: la interacción es de la capa Konva superior.
 */
function LayerOverlayHtml({
  layer,
  zIndex,
  canvas,
}: {
  layer: MediaLayer;
  zIndex: number;
  canvas: { width: number; height: number };
}) {
  const playhead = useUiStore((s) => s.playhead);
  if (!canvas.width) return null;
  // Sin solape temporal dentro de la capa → a lo sumo un elemento activo.
  const active = layer.items.find(
    (it) => it.kind !== "video" && playhead >= it.start && playhead < it.end,
  );
  if (!active || active.kind === "video") return null;

  if (active.kind === "image") {
    return (
      <div style={{ ...imageOverlayStyle(active, canvas.width, canvas.height), zIndex }}>
        <img
          src={`/assets/${active.fileName}`}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="max-w-none"
          style={imageInnerStyle(active, canvas.width, canvas.height)}
        />
      </div>
    );
  }

  return (
    <div style={{ ...textOverlayStyle(active, canvas.width, canvas.height), zIndex }}>
      {active.content}
    </div>
  );
}

export function PreviewCanvas({ videoRef, children, inGap }: PreviewCanvasProps) {
  const settings = useProjectStore((s) => s.project.settings);
  const setAspect = useProjectStore((s) => s.setAspect);
  const select = useUiStore((s) => s.select);
  // Suscribirse a la referencia ESTABLE de layers y derivar con useMemo (un
  // selector que devuelve videoLayers(...) crea array nuevo cada vez → bucle
  // infinito en useSyncExternalStore → app en negro).
  const layers = useProjectStore((s) => s.project.tracks.layers);
  // Capas con vídeo, conservando su ÍNDICE real en el array (= z): así el <video>
  // se intercala en z con las imágenes/textos de otras capas.
  const videoLayers = useMemo(
    () => layers
      .map((l, index) => ({
        index,
        id: l.id,
        name: l.name,
        clips: l.items.filter((it) => it.kind === "video") as unknown as VideoClip[],
      }))
      .filter((t) => t.clips.length > 0),
    [layers],
  );
  // Base (usa videoRef y el motor de sync): primer carril con vídeo por orden de capas.
  const baseVideoId = videoLayers[0]?.id;
  const hasAnyVideo = videoLayers.length > 0;
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
            // Contexto de apilado aislado: el z-index de los hijos (capas, velo,
            // Konva) es autoritativo y un <video> compositado no puede "escaparse"
            // por encima de un texto/imagen con z-index mayor de otra capa.
            isolation: "isolate",
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
          {/* UNA envoltura por capa, en ORDEN DE ARRAY = orden de apilado: el
              orden del DOM coincide con el z (las capas posteriores pintan encima),
              además del zIndex explícito. Así un texto en una capa superior queda
              SIEMPRE por delante del vídeo de una capa inferior, sin depender de
              rarezas de z-index entre <video> y elementos con transform. La capa
              base de vídeo conserva videoRef; las demás se registran en el motor. */}
          {layers.map((layer, index) => {
            const videoTrack = videoLayers.find((t) => t.id === layer.id);
            return (
              <div
                key={layer.id}
                className="absolute inset-0"
                style={{ zIndex: index, pointerEvents: "none" }}
              >
                {videoTrack && (
                  <TrackVideo
                    track={videoTrack}
                    canvas={canvas}
                    isBase={layer.id === baseVideoId}
                    videoRef={layer.id === baseVideoId ? videoRef : undefined}
                    register={layer.id === baseVideoId ? undefined : registerOverlayVideo}
                    zIndex={0}
                  />
                )}
                <LayerOverlayHtml layer={layer} zIndex={0} canvas={canvas} />
              </div>
            );
          })}
          {/* Velo con agujero: oscurece todo lo que queda fuera del lienzo */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none rounded-sm"
            style={{ boxShadow: "0 0 0 600px rgba(10, 10, 12, 0.85)", zIndex: 100 }}
          />
          {canvas.width > 0 && children?.(canvas)}
        </div>

        {!hasAnyVideo && (
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
