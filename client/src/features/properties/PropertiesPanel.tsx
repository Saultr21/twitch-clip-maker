import { useRef, useState, type ReactNode } from "react";
import { Music, Scissors, Crop } from "lucide-react";
import type { ImageOverlay, TextOverlay } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";
import { useClipsStore } from "../../stores/clipsStore";
import { useUiStore } from "../../stores/uiStore";
import { buildReframeSegments } from "../../lib/reframe";
import { detectFaceTrack } from "../reframe/detectFaces";

export const FONT_FAMILIES = [
  "Segoe UI",
  "Arial",
  "Arial Black",
  "Impact",
  "Georgia",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Times New Roman",
  "Courier New",
  "Comic Sans MS",
] as const;

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[11px] text-muted">{label}</label>
      {children}
    </div>
  );
}

/** Decimales a mostrar en el campo numérico según el paso del slider. */
function decimalsFor(step: number): number {
  if (step >= 1) return 0;
  const s = String(step);
  return s.includes(".") ? s.split(".")[1].length : 0;
}

function Slider({ id, min, max, step, value, onChange }: {
  id: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="accent-accent h-1.5 flex-1 min-w-0"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        // valor exacto editable a mano; se redondea al paso al confirmar
        value={Number(value.toFixed(decimalsFor(step)))}
        aria-label="Valor exacto"
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(clamp(v));
        }}
        className="w-14 shrink-0 bg-surface-2 border border-border-2 rounded-md px-1.5 py-0.5 text-[11px] text-right focus:outline-none focus:border-accent"
      />
    </div>
  );
}

const inputClass =
  "bg-surface-2 border border-border-2 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-accent";

function CenterButton({ onCenter }: { onCenter: () => void }) {
  return (
    <button
      type="button"
      onClick={onCenter}
      className="text-xs text-accent-soft border border-border-2 rounded-md py-1.5 hover:border-accent"
    >
      ⊕ Centrar en el lienzo
    </button>
  );
}

function TextProperties({ overlay }: { overlay: TextOverlay }) {
  const updateText = useProjectStore((s) => s.updateText);
  const u = (patch: Partial<TextOverlay>) => updateText(overlay.id, patch);

  return (
    <div className="flex flex-col gap-3">
      <Field label="Texto" htmlFor="prop-content">
        <textarea
          id="prop-content"
          value={overlay.content}
          onChange={(e) => u({ content: e.target.value })}
          rows={2}
          className={inputClass}
        />
      </Field>
      <Field label="Fuente" htmlFor="prop-font">
        <select
          id="prop-font"
          value={overlay.fontFamily}
          onChange={(e) => u({ fontFamily: e.target.value })}
          className={inputClass}
          style={{ fontFamily: overlay.fontFamily }}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
          ))}
        </select>
      </Field>
      <Field label={`Tamaño · ${Math.round(overlay.fontSize * 1000)}`} htmlFor="prop-size">
        <Slider id="prop-size" min={0.01} max={0.3} step={0.005} value={overlay.fontSize} onChange={(v) => u({ fontSize: v })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Relleno" htmlFor="prop-fill">
          <input id="prop-fill" type="color" value={overlay.fill} onChange={(e) => u({ fill: e.target.value })} className="h-8 w-full bg-surface-2 rounded-md border border-border-2" />
        </Field>
        <Field label="Borde" htmlFor="prop-stroke">
          <input id="prop-stroke" type="color" value={overlay.stroke || "#000000"} onChange={(e) => u({ stroke: e.target.value })} className="h-8 w-full bg-surface-2 rounded-md border border-border-2" />
        </Field>
      </div>
      <Field label={`Grosor del borde · ${Math.round(overlay.strokeWidth * 1000)}`} htmlFor="prop-strokew">
        <Slider id="prop-strokew" min={0} max={0.02} step={0.001} value={overlay.strokeWidth} onChange={(v) => u({ strokeWidth: v })} />
      </Field>
      <div className="flex items-center gap-2">
        <input
          id="prop-shadow"
          type="checkbox"
          checked={overlay.shadow}
          onChange={(e) => u({ shadow: e.target.checked })}
          className="accent-accent"
        />
        <label htmlFor="prop-shadow" className="text-[11px] text-muted">Sombra</label>
      </div>
      <CommonOverlayProps
        opacity={overlay.opacity}
        rotation={overlay.rotation}
        onOpacity={(v) => u({ opacity: v })}
        onRotation={(v) => u({ rotation: v })}
      />
      <CenterButton onCenter={() => u({ x: 0.5, y: 0.5 })} />
    </div>
  );
}

function ImageProperties({ overlay }: { overlay: ImageOverlay }) {
  const updateImage = useProjectStore((s) => s.updateImage);
  const u = (patch: Partial<ImageOverlay>) => updateImage(overlay.id, patch);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-muted truncate" title={overlay.fileName}>{overlay.fileName}</p>
      <Field label={`Ancho · ${Math.round(overlay.width * 100)}%`} htmlFor="prop-w">
        <Slider id="prop-w" min={0.02} max={1} step={0.01} value={overlay.width} onChange={(v) => u({ width: v })} />
      </Field>
      <Field label={`Alto · ${Math.round(overlay.height * 100)}%`} htmlFor="prop-h">
        <Slider id="prop-h" min={0.02} max={1} step={0.01} value={overlay.height} onChange={(v) => u({ height: v })} />
      </Field>
      <CommonOverlayProps
        opacity={overlay.opacity}
        rotation={overlay.rotation}
        onOpacity={(v) => u({ opacity: v })}
        onRotation={(v) => u({ rotation: v })}
      />
      <CenterButton onCenter={() => u({ x: 0.5, y: 0.5 })} />
    </div>
  );
}

function CommonOverlayProps({ opacity, rotation, onOpacity, onRotation }: {
  opacity: number; rotation: number; onOpacity: (v: number) => void; onRotation: (v: number) => void;
}) {
  return (
    <>
      <Field label={`Opacidad · ${Math.round(opacity * 100)}%`} htmlFor="prop-opacity">
        <Slider id="prop-opacity" min={0} max={1} step={0.01} value={opacity} onChange={onOpacity} />
      </Field>
      <Field label={`Rotación · ${Math.round(rotation)}°`} htmlFor="prop-rotation">
        <Slider id="prop-rotation" min={-180} max={180} step={1} value={rotation} onChange={onRotation} />
      </Field>
    </>
  );
}

type SilenceState = "idle" | "analyzing" | "none" | "done" | "error";
type ReframeState = { phase: "idle" | "none" | "error" } | { phase: "running"; progress: number };

function VideoProperties({ clipId }: { clipId: string }) {
  const originalAudioVolume = useProjectStore((s) => s.project.originalAudioVolume);
  const setOriginalAudioVolume = useProjectStore((s) => s.setOriginalAudioVolume);
  const updateVideoClip = useProjectStore((s) => s.updateVideoClip);
  const removeSilencesFromClip = useProjectStore((s) => s.removeSilencesFromClip);
  const applyReframe = useProjectStore((s) => s.applyReframe);
  const settings = useProjectStore((s) => s.project.settings);
  const clipInfos = useClipsStore((s) => s.clips);
  const clip = useProjectStore((s) => s.project.tracks.video.find((c) => c.id === clipId));
  const [silence, setSilence] = useState<SilenceState>("idle");
  const [reframe, setReframe] = useState<ReframeState>({ phase: "idle" });
  if (!clip) return null;

  const reframeClip = async () => {
    const info = clipInfos.find((c) => c.id === clip.clipId);
    if (!info) return;
    setReframe({ phase: "running", progress: 0 });
    try {
      const samples = await detectFaceTrack(info.fileName, clip.trimIn, clip.trimOut, (p) =>
        setReframe({ phase: "running", progress: p }),
      );
      if (samples.length === 0) {
        setReframe({ phase: "none" });
        return;
      }
      const segs = buildReframeSegments(samples, clip, info, { width: settings.width, height: settings.height });
      applyReframe(clip.id, segs); // mueve la selección al primer segmento
      setReframe({ phase: "idle" });
    } catch {
      setReframe({ phase: "error" });
    }
  };

  const zoom = (patch: Partial<typeof clip.zoom>) =>
    updateVideoClip(clip.id, { zoom: { ...clip.zoom, ...patch } });

  const filters = (patch: Partial<typeof clip.filters>) =>
    updateVideoClip(clip.id, { filters: { ...clip.filters, ...patch } });

  const removeSilences = async () => {
    setSilence("analyzing");
    try {
      const res = await fetch(`/api/clips/${clip.clipId}/silences`);
      if (!res.ok) throw new Error();
      const { ranges } = (await res.json()) as { ranges: Array<{ start: number; end: number }> };
      const inTrim = ranges.filter((r) => r.end > clip.trimIn && r.start < clip.trimOut);
      if (inTrim.length === 0) {
        setSilence("none");
        return;
      }
      removeSilencesFromClip(clip.id, ranges); // mueve la selección al 1.er segmento
      setSilence("done");
    } catch {
      setSilence("error");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-muted">
        Recorte: {clip.trimIn.toFixed(2)}s – {clip.trimOut.toFixed(2)}s
        <span className="block">
          (arrastra los bordes del bloque en la línea de tiempo para recortar)
        </span>
      </p>
      <Field label={`Zoom · ${clip.zoom.scale.toFixed(2)}x`} htmlFor="prop-zoom">
        <Slider id="prop-zoom" min={0.25} max={4} step={0.05} value={clip.zoom.scale} onChange={(v) => zoom({ scale: v })} />
      </Field>
      <Field label={`Encuadre horizontal · ${Math.round(clip.zoom.x * 100)}%`} htmlFor="prop-zoom-x">
        <Slider id="prop-zoom-x" min={0} max={1} step={0.01} value={clip.zoom.x} onChange={(v) => zoom({ x: v })} />
      </Field>
      <Field label={`Encuadre vertical · ${Math.round(clip.zoom.y * 100)}%`} htmlFor="prop-zoom-y">
        <Slider id="prop-zoom-y" min={0} max={1} step={0.01} value={clip.zoom.y} onChange={(v) => zoom({ y: v })} />
      </Field>
      <CenterButton onCenter={() => zoom({ x: 0.5, y: 0.5 })} />
      <Field label={`Velocidad · ${clip.speed.toFixed(2)}x`} htmlFor="prop-speed">
        <Slider id="prop-speed" min={0.25} max={4} step={0.05} value={clip.speed} onChange={(v) => updateVideoClip(clip.id, { speed: v })} />
      </Field>
      <Field label={`Brillo · ${Math.round(clip.filters.brightness * 100)}`} htmlFor="prop-bright">
        <Slider id="prop-bright" min={-1} max={1} step={0.02} value={clip.filters.brightness} onChange={(v) => filters({ brightness: v })} />
      </Field>
      <Field label={`Contraste · ${clip.filters.contrast.toFixed(2)}`} htmlFor="prop-contrast">
        <Slider id="prop-contrast" min={0} max={2} step={0.02} value={clip.filters.contrast} onChange={(v) => filters({ contrast: v })} />
      </Field>
      <Field label={`Saturación · ${clip.filters.saturation.toFixed(2)}`} htmlFor="prop-sat">
        <Slider id="prop-sat" min={0} max={3} step={0.05} value={clip.filters.saturation} onChange={(v) => filters({ saturation: v })} />
      </Field>
      <Field label={`Tono · ${Math.round(clip.filters.hue)}°`} htmlFor="prop-hue">
        <Slider id="prop-hue" min={-180} max={180} step={1} value={clip.filters.hue} onChange={(v) => filters({ hue: v })} />
      </Field>
      <Field label={`Blanco y negro · ${Math.round(clip.filters.grayscale * 100)}%`} htmlFor="prop-gray">
        <Slider id="prop-gray" min={0} max={1} step={0.02} value={clip.filters.grayscale} onChange={(v) => filters({ grayscale: v })} />
      </Field>
      <button
        type="button"
        onClick={() =>
          updateVideoClip(clip.id, {
            speed: 1,
            filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 },
          })
        }
        className="text-xs text-muted border border-border-2 rounded-md py-1.5 hover:text-text"
      >
        Restablecer velocidad y filtros
      </button>
      <Field label={`Volumen del clip · ${Math.round(originalAudioVolume * 100)}%`} htmlFor="prop-vol">
        <Slider id="prop-vol" min={0} max={1} step={0.01} value={originalAudioVolume} onChange={setOriginalAudioVolume} />
      </Field>

      <div className="border-t border-border pt-3 flex flex-col gap-1">
        <button
          type="button"
          disabled={silence === "analyzing"}
          onClick={() => void removeSilences()}
          title="Detecta los silencios del audio y los recorta del clip"
          className="flex items-center justify-center gap-1.5 text-xs text-accent-soft border border-border-2 rounded-md py-1.5 hover:border-accent disabled:opacity-50"
        >
          <Scissors size={14} aria-hidden="true" />
          {silence === "analyzing" ? "Analizando audio…" : "Eliminar silencios"}
        </button>
        {silence === "none" && <p className="text-[10px] text-muted">No se detectaron silencios.</p>}
        {silence === "error" && <p role="alert" className="text-[10px] text-danger">No se pudo analizar el audio.</p>}
        <p className="text-[10px] text-muted">Parte el clip por los silencios y los quita (ripple en la pista de vídeo).</p>
      </div>

      <div className="border-t border-border pt-3 flex flex-col gap-1">
        <button
          type="button"
          disabled={reframe.phase === "running"}
          onClick={() => void reframeClip()}
          title="Detecta la cara y reencuadra el clip al formato de salida siguiéndola"
          className="flex items-center justify-center gap-1.5 text-xs text-accent-soft border border-border-2 rounded-md py-1.5 hover:border-accent disabled:opacity-50"
        >
          <Crop size={14} aria-hidden="true" />
          {reframe.phase === "running"
            ? `Analizando… ${Math.round(reframe.progress * 100)}%`
            : "Auto-reframe (seguir cara)"}
        </button>
        {reframe.phase === "none" && <p className="text-[10px] text-muted">No se detectó ninguna cara.</p>}
        {reframe.phase === "error" && <p role="alert" className="text-[10px] text-danger">No se pudo reencuadrar.</p>}
        <p className="text-[10px] text-muted">Parte el clip y encuadra cada tramo sobre la cara (para vertical).</p>
      </div>
    </div>
  );
}

const BG_LABELS: Record<"black" | "color" | "blur" | "image", string> = {
  black: "Negro",
  color: "Color sólido",
  blur: "Desenfoque del vídeo",
  image: "Imagen",
};

/** Fondo del proyecto (rellena las zonas que el vídeo no cubre). */
function BackgroundProperties() {
  const background = useProjectStore((s) => s.project.settings.background);
  const setBackground = useProjectStore((s) => s.setBackground);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const [bgError, setBgError] = useState<string | null>(null);

  const uploadBgImage = async (file: File) => {
    setBgError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/assets", { method: "POST", body });
      if (!res.ok) throw new Error();
      const asset = (await res.json()) as { fileName: string };
      setBackground({ fileName: asset.fileName });
    } catch {
      setBgError("No se pudo subir la imagen de fondo");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[11px] font-bold text-muted tracking-wide">FONDO DEL PROYECTO</h3>
      <p className="text-[11px] text-muted">
        Rellena las franjas que el vídeo no cubre (p. ej. un 16:9 en formato vertical).
      </p>
      <Field label="Tipo de fondo" htmlFor="prop-bg-type">
        <select
          id="prop-bg-type"
          value={background.type}
          onChange={(e) => setBackground({ type: e.target.value as "black" | "color" | "blur" })}
          className={inputClass}
        >
          {(Object.keys(BG_LABELS) as Array<keyof typeof BG_LABELS>).map((t) => (
            <option key={t} value={t}>{BG_LABELS[t]}</option>
          ))}
        </select>
      </Field>
      {background.type === "color" && (
        <Field label="Color" htmlFor="prop-bg-color">
          <input
            id="prop-bg-color"
            type="color"
            value={background.color}
            onChange={(e) => setBackground({ color: e.target.value })}
            className="h-8 w-full bg-surface-2 rounded-md border border-border-2"
          />
        </Field>
      )}
      {background.type === "blur" && (
        <Field label={`Intensidad del desenfoque · ${Math.round(background.blur * 100)}%`} htmlFor="prop-bg-blur">
          <Slider id="prop-bg-blur" min={0} max={1} step={0.05} value={background.blur} onChange={(v) => setBackground({ blur: v })} />
        </Field>
      )}
      {background.type === "image" && (
        <div className="flex flex-col gap-1">
          <input
            ref={bgInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label="Seleccionar imagen de fondo"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadBgImage(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => bgInputRef.current?.click()}
            className="text-xs text-accent-soft border border-border-2 rounded-md py-1.5 hover:border-accent"
          >
            {background.fileName ? "Cambiar imagen de fondo" : "Subir imagen de fondo"}
          </button>
          {background.fileName && (
            <img
              src={`/assets/${background.fileName}`}
              alt="Imagen de fondo actual"
              className="w-full h-16 object-cover rounded-md border border-border-2"
            />
          )}
          {bgError && <p role="alert" className="text-[11px] text-danger">{bgError}</p>}
        </div>
      )}
    </div>
  );
}

function AudioProperties({ trackId }: { trackId: string }) {
  const updateAudio = useProjectStore((s) => s.updateAudio);
  const track = useProjectStore((s) => s.project.tracks.audio.find((a) => a.id === trackId));
  if (!track) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1.5 text-[11px] text-muted truncate" title={track.fileName}>
        <Music size={14} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{track.fileName}</span>
      </p>
      <Field label={`Volumen · ${Math.round(track.volume * 100)}%`} htmlFor="prop-audio-vol">
        <Slider id="prop-audio-vol" min={0} max={1} step={0.01} value={track.volume} onChange={(v) => updateAudio(track.id, { volume: v })} />
      </Field>
      <p className="text-[10px] text-muted">
        Entrada en el archivo: {track.trimIn.toFixed(1)}s (arrastra el borde izquierdo del bloque)
      </p>
    </div>
  );
}

export function PropertiesPanel() {
  const selection = useUiStore((s) => s.selection);
  const text = useProjectStore((s) =>
    selection?.kind === "text" ? s.project.tracks.text.find((t) => t.id === selection.id) : undefined,
  );
  const image = useProjectStore((s) =>
    selection?.kind === "image" ? s.project.tracks.image.find((i) => i.id === selection.id) : undefined,
  );

  return (
    <aside
      aria-label="Propiedades"
      className="flex-1 min-w-0 bg-surface border-l border-border p-3 overflow-y-auto"
    >
      <h2 className="text-xs font-bold tracking-wide mb-3">PROPIEDADES</h2>
      {!selection && (
        <div className="flex flex-col gap-4">
          <p className="text-[11px] text-muted">
            Selecciona un elemento en el lienzo o en la línea de tiempo.
          </p>
          <BackgroundProperties />
        </div>
      )}
      {text && <TextProperties overlay={text} />}
      {image && <ImageProperties overlay={image} />}
      {selection?.kind === "video" && <VideoProperties clipId={selection.id} />}
      {selection?.kind === "audio" && <AudioProperties trackId={selection.id} />}
    </aside>
  );
}
