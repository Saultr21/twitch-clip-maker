import { useCallback, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { SubtitleCue } from "@clipforge/shared";
import { censorCues } from "../../lib/profanity";
import { splitCuesToMaxWords } from "../../lib/subtitles";
import { videoClipAt } from "../../lib/timeline";
import { confirmDialog } from "../../stores/dialogStore";
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
  const maxWordsPerCue = useProjectStore((s) => s.project.subtitles.maxWordsPerCue);
  const setMaxWordsPerCue = useProjectStore((s) => s.setMaxWordsPerCue);
  const [language, setLanguage] = useState("auto");
  const [model, setModel] = useState<"small" | "medium">("small");
  // Callback estable: lee maxWordsPerCue del store en el momento de aplicar,
  // evitando que start() se recree en cada render y pierda el evento SSE.
  const onCues = useCallback((cues: SubtitleCue[]) => {
    const max = useProjectStore.getState().project.subtitles.maxWordsPerCue;
    setSubtitleCues(splitCuesToMaxWords(cues, max));
  }, [setSubtitleCues]);
  const { state, start, cancel } = useTranscribe(onCues);

  const generate = () => {
    const project = useProjectStore.getState().project;
    const playhead = useUiStore.getState().playhead;
    // clip bajo el playhead, o el primero si el playhead está en un hueco
    const clip = videoClipAt(project.tracks.video[0]?.clips ?? [], playhead) ?? project.tracks.video[0]?.clips[0];
    if (!clip) return;
    void start(clip, language, model);
  };

  const hasClips = useProjectStore((s) => (s.project.tracks.video[0]?.clips.length ?? 0) > 0);

  const clearAll = async () => {
    const n = useProjectStore.getState().project.subtitles.cues.length;
    const message =
      n === 1 ? "¿Borrar la frase de subtítulos?" : `¿Borrar las ${n} frases de subtítulos?`;
    if (await confirmDialog({ message, confirmLabel: "Borrar todas", danger: true })) {
      clearSubtitles();
    }
  };

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

      <button
        type="button"
        onClick={() => {
          const id = useProjectStore.getState().addCue(useUiStore.getState().playhead);
          useUiStore.getState().select({ kind: "subtitle", id });
        }}
        title="Añadir una frase en la posición del cursor"
        className="flex items-center justify-center gap-1.5 text-xs text-accent-soft border border-border-2 rounded-md py-1.5 hover:bg-surface-3"
      >
        <Plus size={14} aria-hidden="true" />
        Añadir frase en el cursor
      </button>
      {cues.length === 0 && (
        <p className="text-[10px] text-muted">
          Para los trozos que la transcripción no pilla (canto, voz sobre música), añade la frase a mano aquí.
        </p>
      )}

      {cues.length > 0 && (
        <>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-bold text-muted tracking-wide">FRASES ({cues.length})</h3>
            <div className="flex flex-col gap-1 items-start">
              <button type="button" onClick={() => setSubtitleCues(censorCues(cues))} className="text-[11px] text-accent-soft hover:text-text" title="Censurar palabrotas">Censurar palabrotas</button>
              <button
                type="button"
                onClick={() => void clearAll()}
                title="Borrar todas las frases"
                className="flex items-center gap-1 text-[11px] font-semibold text-danger hover:underline"
              >
                <Trash2 size={13} aria-hidden="true" />
                Borrar todas
              </button>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5">
            {cues.map((c) => (
              <CueRow key={c.id} cue={c} onChangeText={updateCueText} onRemove={removeCue} />
            ))}
          </ul>

          <h3 className="text-[11px] font-bold text-muted tracking-wide mt-2">ESTILO</h3>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="sub-maxwords" className="text-[11px] text-muted">Palabras por frase</label>
            <input
              id="sub-maxwords"
              type="number"
              min={1}
              max={30}
              step={1}
              value={maxWordsPerCue}
              onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setMaxWordsPerCue(v); }}
              className="w-14 bg-surface-2 border border-border-2 rounded-md px-2 py-0.5 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
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
          <label className="text-[11px] text-muted flex items-center gap-2">
            <input type="checkbox" checked={style.wordHighlight} onChange={(e) => setSubtitleStyle({ wordHighlight: e.target.checked })} className="accent-accent" />
            Resaltar palabra activa
          </label>
          <label className="text-[11px] text-muted flex items-center gap-2">
            <input type="checkbox" checked={style.animate} onChange={(e) => setSubtitleStyle({ animate: e.target.checked })} className="accent-accent" />
            Animar palabra activa (pop)
          </label>
          <label className="text-[11px] text-muted flex items-center gap-2">
            <input type="checkbox" checked={style.boxBackground} onChange={(e) => setSubtitleStyle({ boxBackground: e.target.checked })} className="accent-accent" />
            Fondo negro detrás del texto
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

/** Fila de una frase con estado de texto LOCAL: el store recolapsa los espacios
 *  (split por palabras) en cada cambio, así que un input controlado por el store
 *  borraría el espacio recién tecleado. El texto crudo vive aquí; el store recibe
 *  las palabras redistribuidas para el render. */
function CueRow({
  cue,
  onChangeText,
  onRemove,
}: {
  cue: SubtitleCue;
  onChangeText: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const [text, setText] = useState(() => cue.words.map((w) => w.text).join(" "));
  return (
    <li className="flex items-center gap-1">
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChangeText(cue.id, e.target.value);
        }}
        aria-label="Texto de la frase"
        className="flex-1 min-w-0 bg-surface-2 border border-border-2 rounded-md px-2 py-1 text-[11px] focus:outline-none focus:border-accent"
      />
      <button type="button" onClick={() => onRemove(cue.id)} aria-label="Borrar frase" className="text-muted hover:text-danger px-1">
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </li>
  );
}
