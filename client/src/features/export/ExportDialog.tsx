import { useEffect, useRef, useState } from "react";
import type { QualityPresetId } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";
import { useExport } from "./useExport";

const PRESET_LABELS: Record<QualityPresetId, string> = {
  tiktok: "TikTok / Reels · 8 Mbps",
  youtube: "YouTube · 12 Mbps",
  custom: "Máxima calidad · CRF 18",
};

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const projectName = useProjectStore((s) => s.project.name);
  const hasClips = useProjectStore((s) => s.project.tracks.video.length > 0);
  const { state, start, cancel, reset, openFolder } = useExport();
  const [preset, setPreset] = useState<QualityPresetId>("tiktok");
  const [fileName, setFileName] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && state.phase !== "running") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, state.phase, onClose]);

  if (!open) return null;

  const close = () => {
    if (state.phase === "running") return; // cancelar primero
    reset();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 grid place-items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Exportar vídeo"
        className="w-96 bg-surface-2 border border-border-2 rounded-xl p-4 flex flex-col gap-3 shadow-2xl"
      >
        <h2 className="text-sm font-bold">Exportar vídeo</h2>

        {!hasClips && (
          <p className="text-[11px] text-danger">
            Añade al menos un clip a la línea de tiempo antes de exportar.
          </p>
        )}

        {state.phase === "idle" && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="export-name" className="text-[11px] text-muted">
                Nombre del archivo
              </label>
              <input
                id="export-name"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder={projectName}
                className="bg-surface border border-border-2 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
              />
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-[11px] text-muted mb-1">Calidad</legend>
              {(Object.keys(PRESET_LABELS) as QualityPresetId[]).map((id) => (
                <label key={id} className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="export-preset"
                    value={id}
                    checked={preset === id}
                    onChange={() => setPreset(id)}
                    className="accent-accent"
                  />
                  {PRESET_LABELS[id]}
                </label>
              ))}
            </fieldset>
            <div className="flex justify-end gap-2 mt-1">
              <button type="button" onClick={close} className="text-xs text-muted border border-border-2 rounded-full px-3 py-1.5 hover:text-text">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!hasClips}
                onClick={() => void start(preset, fileName)}
                className="text-xs font-semibold text-white rounded-full px-4 py-1.5 bg-gradient-to-r from-accent to-accent-dark disabled:opacity-50"
              >
                Exportar
              </button>
            </div>
          </>
        )}

        {state.phase === "running" && (
          <>
            <div
              role="progressbar"
              aria-valuenow={Math.round(state.percent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progreso de exportación"
              className="h-2 bg-surface-3 rounded-full overflow-hidden"
            >
              <div className="h-full bg-accent transition-[width]" style={{ width: `${state.percent}%` }} />
            </div>
            <p role="status" className="text-[11px] text-muted">
              Exportando… {Math.round(state.percent)}%
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={() => void cancel()} className="text-xs text-danger border border-border-2 rounded-full px-3 py-1.5">
                Cancelar exportación
              </button>
            </div>
          </>
        )}

        {state.phase === "done" && (
          <>
            <p role="status" className="text-xs">
              ✅ Exportado como <span className="font-mono text-accent-soft">{state.fileName}</span>
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={openFolder} className="text-xs text-accent-soft border border-border-2 rounded-full px-3 py-1.5 hover:border-accent">
                📂 Abrir carpeta
              </button>
              <button type="button" onClick={close} className="text-xs text-muted border border-border-2 rounded-full px-3 py-1.5 hover:text-text">
                Cerrar
              </button>
            </div>
          </>
        )}

        {state.phase === "error" && (
          <>
            <p role="alert" className="text-[11px] text-danger whitespace-pre-wrap max-h-40 overflow-y-auto">
              {state.message}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={reset} className="text-xs text-accent-soft border border-border-2 rounded-full px-3 py-1.5 hover:border-accent">
                Reintentar
              </button>
              <button type="button" onClick={close} className="text-xs text-muted border border-border-2 rounded-full px-3 py-1.5 hover:text-text">
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
