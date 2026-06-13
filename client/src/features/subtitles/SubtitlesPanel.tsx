import { useState } from "react";
import { Trash2 } from "lucide-react";
import { videoClipAt } from "../../lib/timeline";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { useTranscribe } from "./useTranscribe";

const LANGS: Array<{ id: string; label: string }> = [
  { id: "auto", label: "Autodetectar" },
  { id: "es", label: "Español" },
  { id: "en", label: "Inglés" },
  { id: "fr", label: "Francés" },
  { id: "pt", label: "Portugués" },
  { id: "de", label: "Alemán" },
];

export function SubtitlesPanel() {
  const cues = useProjectStore((s) => s.project.subtitles.cues);
  const style = useProjectStore((s) => s.project.subtitles.style);
  const setSubtitleCues = useProjectStore((s) => s.setSubtitleCues);
  const updateCueText = useProjectStore((s) => s.updateCueText);
  const removeCue = useProjectStore((s) => s.removeCue);
  const clearSubtitles = useProjectStore((s) => s.clearSubtitles);
  const setSubtitleStyle = useProjectStore((s) => s.setSubtitleStyle);
  const [language, setLanguage] = useState("auto");
  const [model, setModel] = useState<"small" | "medium">("small");
  const { state, start, cancel } = useTranscribe(setSubtitleCues);

  const generate = () => {
    const project = useProjectStore.getState().project;
    const playhead = useUiStore.getState().playhead;
    // clip bajo el playhead, o el primero si el playhead está en un hueco
    const clip = videoClipAt(project.tracks.video, playhead) ?? project.tracks.video[0];
    if (!clip) return;
    void start(clip, language, model);
  };

  const hasClips = useProjectStore((s) => s.project.tracks.video.length > 0);

  return (
    <section aria-label="Subtítulos" className="flex-1 min-w-0 bg-surface-2/50 border-r border-border p-3 flex flex-col gap-3 overflow-y-auto">
      <h2 className="text-xs font-bold tracking-wide">SUBTÍTULOS</h2>
      {!hasClips && (
        <p className="text-[11px] text-danger">Añade un clip a la línea de tiempo antes de generar subtítulos.</p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="sub-lang" className="text-[11px] text-muted">Idioma</label>
        <select
          id="sub-lang"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="bg-surface-2 border border-border-2 rounded-md px-2 py-1 text-xs"
        >
          {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="sub-model" className="text-[11px] text-muted">Modelo</label>
        <select
          id="sub-model"
          value={model}
          onChange={(e) => setModel(e.target.value as "small" | "medium")}
          className="bg-surface-2 border border-border-2 rounded-md px-2 py-1 text-xs"
        >
          <option value="small">Rápido (small)</option>
          <option value="medium">Preciso (medium)</option>
        </select>
        <p className="text-[10px] text-muted">
          Medium transcribe mejor pero tarda más y descarga ~1,5 GB la primera vez.
        </p>
      </div>
      {state.phase === "running" ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-[11px] text-muted">Transcribiendo… (puede tardar)</p>
          <button type="button" onClick={() => void cancel()} className="text-xs text-danger border border-border-2 rounded-md py-1.5">
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={!hasClips}
          onClick={generate}
          className="text-xs font-semibold text-white rounded-md py-1.5 bg-gradient-to-r from-accent to-accent-dark disabled:opacity-50"
        >
          {cues.length > 0 ? "Regenerar subtítulos" : "Generar subtítulos"}
        </button>
      )}
      {state.phase === "error" && (
        <p role="alert" className="text-[11px] text-danger whitespace-pre-wrap max-h-32 overflow-y-auto">{state.message}</p>
      )}

      {cues.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold text-muted tracking-wide">FRASES ({cues.length})</h3>
            <button type="button" onClick={clearSubtitles} className="text-[11px] text-muted hover:text-danger">Borrar todas</button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {cues.map((c) => (
              <li key={c.id} className="flex items-center gap-1">
                <input
                  value={c.words.map((w) => w.text).join(" ")}
                  onChange={(e) => updateCueText(c.id, e.target.value)}
                  aria-label="Texto de la frase"
                  className="flex-1 min-w-0 bg-surface-2 border border-border-2 rounded-md px-2 py-1 text-[11px] focus:outline-none focus:border-accent"
                />
                <button type="button" onClick={() => removeCue(c.id)} aria-label="Borrar frase" className="text-muted hover:text-danger px-1"><Trash2 size={14} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>

          <h3 className="text-[11px] font-bold text-muted tracking-wide mt-2">ESTILO</h3>
          <label className="text-[11px] text-muted">Color base
            <input type="color" value={style.fill} onChange={(e) => setSubtitleStyle({ fill: e.target.value })} className="ml-2 h-6 w-10 align-middle bg-surface-2 rounded border border-border-2" />
          </label>
          <label className="text-[11px] text-muted">Resaltado
            <input type="color" value={style.highlight} onChange={(e) => setSubtitleStyle({ highlight: e.target.value })} className="ml-2 h-6 w-10 align-middle bg-surface-2 rounded border border-border-2" />
          </label>
          <label className="text-[11px] text-muted flex items-center gap-2">
            <input type="checkbox" checked={style.uppercase} onChange={(e) => setSubtitleStyle({ uppercase: e.target.checked })} className="accent-accent" />
            MAYÚSCULAS
          </label>
          <label htmlFor="sub-size" className="text-[11px] text-muted">Tamaño · {Math.round(style.fontSize * 1000)}</label>
          <input id="sub-size" type="range" min={0.02} max={0.15} step={0.005} value={style.fontSize} onChange={(e) => setSubtitleStyle({ fontSize: parseFloat(e.target.value) })} className="accent-accent h-1.5" />
          <label htmlFor="sub-y" className="text-[11px] text-muted">Posición vertical · {Math.round(style.y * 100)}%</label>
          <input id="sub-y" type="range" min={0} max={1} step={0.01} value={style.y} onChange={(e) => setSubtitleStyle({ y: parseFloat(e.target.value) })} className="accent-accent h-1.5" />
        </>
      )}
    </section>
  );
}
