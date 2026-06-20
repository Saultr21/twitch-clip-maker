import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FolderOpen } from "lucide-react";
import { createPortal } from "react-dom";
import type { QualityPresetId } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
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
  const hasClips = useProjectStore((s) => (s.project.tracks.video[0]?.clips.length ?? 0) > 0);
  const { state, start, cancel, reset, openFolder } = useExport();
  const [preset, setPreset] = useState<QualityPresetId>("tiktok");
  const [fileName, setFileName] = useState("");
  const [extra, setExtra] = useState<{ phase: "idle" | "working" | "done" | "error"; name?: string }>({ phase: "idle" });
  const dialogRef = useRef<HTMLDivElement>(null);

  const exportExtra = async (kind: "frame" | "gif") => {
    setExtra({ phase: "working" });
    try {
      const project = useProjectStore.getState().project;
      const body =
        kind === "frame"
          ? { project, time: useUiStore.getState().playhead, fileName }
          : { project, fileName };
      const res = await fetch(`/api/export/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { fileName: string };
      setExtra({ phase: "done", name: data.fileName });
    } catch {
      setExtra({ phase: "error" });
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && state.phase !== "running") onClose();
      // Trampa de foco: Tab circula dentro del diálogo (WCAG 2.4.3)
      if (e.code === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          "button, input, [tabindex]:not([tabindex='-1'])",
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, state.phase, onClose]);

  // Foco inicial dentro del diálogo al abrirlo
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const close = () => {
    if (state.phase === "running") return; // cancelar primero
    reset();
    onClose();
  };

  // Portal a <body>: el modal no debe vivir dentro del <header> (orden de
  // lectura de AT y ámbito correcto de aria-modal)
  return createPortal(
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
        aria-labelledby="export-dialog-title"
        tabIndex={-1}
        className="w-96 bg-surface-2 border border-border-2 rounded-xl p-4 flex flex-col gap-3 shadow-2xl outline-none"
      >
        <h2 id="export-dialog-title" className="text-sm font-bold">Exportar vídeo</h2>

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

            <div className="flex items-center gap-2 text-[10px] text-muted mt-1">
              <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!hasClips || extra.phase === "working"}
                onClick={() => void exportExtra("frame")}
                title="Guarda el fotograma actual (playhead) como PNG"
                className="flex-1 text-[11px] text-accent-soft border border-border-2 rounded-md py-1.5 hover:border-accent disabled:opacity-50"
              >
                Fotograma (PNG)
              </button>
              <button
                type="button"
                disabled={!hasClips || extra.phase === "working"}
                onClick={() => void exportExtra("gif")}
                title="Exporta el montaje como GIF"
                className="flex-1 text-[11px] text-accent-soft border border-border-2 rounded-md py-1.5 hover:border-accent disabled:opacity-50"
              >
                GIF
              </button>
            </div>
            {extra.phase === "working" && <p role="status" className="text-[10px] text-muted">Generando…</p>}
            {extra.phase === "done" && (
              <p className="flex items-center gap-1.5 text-[10px]">
                <CheckCircle2 size={13} aria-hidden="true" className="shrink-0 text-accent-soft" />
                <span><span className="font-mono text-accent-soft">{extra.name}</span> guardado.</span>
                <button type="button" onClick={openFolder} className="ml-auto text-accent-soft hover:underline">Abrir carpeta</button>
              </p>
            )}
            {extra.phase === "error" && <p role="alert" className="text-[10px] text-danger">No se pudo generar.</p>}
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
            <p role="status" className="flex items-center gap-1.5 text-xs">
              <CheckCircle2 size={16} aria-hidden="true" className="shrink-0 text-accent-soft" />
              <span>Exportado como <span className="font-mono text-accent-soft">{state.fileName}</span></span>
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={openFolder} className="flex items-center gap-1.5 text-xs text-accent-soft border border-border-2 rounded-full px-3 py-1.5 hover:border-accent">
                <FolderOpen size={14} aria-hidden="true" />
                Abrir carpeta
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
    </div>,
    document.body,
  );
}
