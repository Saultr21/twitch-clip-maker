import { useCallback, useEffect, useRef, useState } from "react";
import type { ExportEvent, QualityPresetId } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";

export type ExportPhase =
  | { phase: "idle" }
  | { phase: "running"; jobId: string; percent: number }
  | { phase: "done"; fileName: string; filePath: string }
  | { phase: "error"; message: string };

/** Abre el diálogo nativo "Guardar como" en el servidor y devuelve la ruta elegida (o null si se cancela). */
async function chooseSavePath(defaultName: string): Promise<string | null> {
  try {
    const res = await fetch("/api/export/save-dialog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultName }),
    });
    if (!res.ok) return null;
    const { filePath } = (await res.json()) as { filePath: string | null };
    return filePath;
  } catch {
    return null;
  }
}

export function useExport() {
  const [state, setState] = useState<ExportPhase>({ phase: "idle" });
  const sourceRef = useRef<EventSource | null>(null);

  // Si el componente se desmonta con un export en marcha, cerrar el SSE
  // (el job sigue en el servidor; se puede cancelar desde un diálogo nuevo)
  useEffect(() => () => sourceRef.current?.close(), []);

  const start = useCallback(async (preset: QualityPresetId, fileName: string) => {
    const project = useProjectStore.getState().project;

    // Mostrar el diálogo nativo "Guardar como" antes de lanzar el export
    const rawDefault = (fileName.trim() || project.name).replace(/\.mp4$/i, "");
    const outputPath = await chooseSavePath(`${rawDefault}.mp4`);
    if (outputPath === null) return; // el usuario canceló el diálogo

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, preset, fileName: fileName.trim() || undefined, outputPath }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        throw new Error(body.error);
      }
      const { jobId } = (await res.json()) as { jobId: string };
      setState({ phase: "running", jobId, percent: 0 });

      const source = new EventSource(`/api/export/${jobId}/progress`);
      sourceRef.current = source;
      source.onmessage = (e) => {
        const event = JSON.parse(e.data) as ExportEvent;
        if (event.type === "progress") {
          setState({ phase: "running", jobId, percent: event.percent });
        } else {
          source.close();
          sourceRef.current = null;
          setState(
            event.type === "done"
              ? { phase: "done", fileName: event.fileName, filePath: event.filePath }
              : { phase: "error", message: event.message },
          );
        }
      };
      source.onerror = () => {
        source.close();
        sourceRef.current = null;
        setState((s) =>
          s.phase === "running" ? { phase: "error", message: "Se perdió la conexión" } : s,
        );
      };
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : "Error" });
    }
  }, []);

  const cancel = useCallback(async () => {
    if (state.phase !== "running") return;
    sourceRef.current?.close();
    sourceRef.current = null;
    await fetch(`/api/export/${state.jobId}`, { method: "DELETE" });
    setState({ phase: "idle" });
  }, [state]);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  // Revela el archivo exportado en el Explorador (resaltado).
  // filePath: ruta absoluta cuando el usuario eligió ubicación custom.
  // fileName: nombre relativo para la carpeta de exports por defecto.
  const openFolder = useCallback((fileName?: string, filePath?: string) => {
    void fetch("/api/exports/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName, filePath }),
    });
  }, []);

  return { state, start, cancel, reset, openFolder };
}
