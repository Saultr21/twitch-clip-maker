import type { ReactNode } from "react";
import type { ImageOverlay, TextOverlay } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

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

function Slider({ id, min, max, step, value, onChange }: {
  id: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="accent-accent h-1.5"
    />
  );
}

const inputClass =
  "bg-surface-2 border border-border-2 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-accent";

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

function VideoProperties({ clipId }: { clipId: string }) {
  const originalAudioVolume = useProjectStore((s) => s.project.originalAudioVolume);
  const setOriginalAudioVolume = useProjectStore((s) => s.setOriginalAudioVolume);
  const updateVideoClip = useProjectStore((s) => s.updateVideoClip);
  const clip = useProjectStore((s) => s.project.tracks.video.find((c) => c.id === clipId));
  if (!clip) return null;

  const zoom = (patch: Partial<typeof clip.zoom>) =>
    updateVideoClip(clip.id, { zoom: { ...clip.zoom, ...patch } });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-muted">
        Recorte: {clip.trimIn.toFixed(2)}s – {clip.trimOut.toFixed(2)}s
        <span className="block">
          (arrastra los bordes del bloque en la línea de tiempo para recortar)
        </span>
      </p>
      <Field label={`Zoom · ${clip.zoom.scale.toFixed(2)}x`} htmlFor="prop-zoom">
        <Slider id="prop-zoom" min={1} max={4} step={0.05} value={clip.zoom.scale} onChange={(v) => zoom({ scale: v })} />
      </Field>
      <Field label={`Encuadre horizontal · ${Math.round(clip.zoom.x * 100)}%`} htmlFor="prop-zoom-x">
        <Slider id="prop-zoom-x" min={0} max={1} step={0.01} value={clip.zoom.x} onChange={(v) => zoom({ x: v })} />
      </Field>
      <Field label={`Encuadre vertical · ${Math.round(clip.zoom.y * 100)}%`} htmlFor="prop-zoom-y">
        <Slider id="prop-zoom-y" min={0} max={1} step={0.01} value={clip.zoom.y} onChange={(v) => zoom({ y: v })} />
      </Field>
      <Field label={`Volumen del clip · ${Math.round(originalAudioVolume * 100)}%`} htmlFor="prop-vol">
        <Slider id="prop-vol" min={0} max={1} step={0.01} value={originalAudioVolume} onChange={setOriginalAudioVolume} />
      </Field>
      <p className="text-[10px] text-muted">Velocidad y filtros llegan en el Hito 4.</p>
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
      className="w-72 bg-surface border-l border-border p-3 overflow-y-auto shrink-0"
    >
      <h2 className="text-xs font-bold tracking-wide mb-3">PROPIEDADES</h2>
      {!selection && (
        <p className="text-[11px] text-muted">
          Selecciona un elemento en el lienzo o en la línea de tiempo.
        </p>
      )}
      {text && <TextProperties overlay={text} />}
      {image && <ImageProperties overlay={image} />}
      {selection?.kind === "video" && <VideoProperties clipId={selection.id} />}
    </aside>
  );
}
