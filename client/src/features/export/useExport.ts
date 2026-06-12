import { useCallback, useRef, useState } from "react";
import type { ExportEvent, QualityPresetId } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";

export type ExportPhase =
  | { phase: "idle" }
  | { phase: "running"; jobId: string; percent: number }
  | { phase: "done"; fileName: string }
  | { phase: "error"; message: string };

export function useExport() {
  const [state, setState] = useState<ExportPhase>({ phase: "idle" });
  const sourceRef = useRef<EventSource | null>(null);

  const start = useCallback(async (preset: QualityPresetId, fileName: string) => {
    const project = useProjectStore.getState().project;
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, preset, fileName: fileName.trim() || undefined }),
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
              ? { phase: "done", fileName: event.fileName }
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

  const openFolder = useCallback(() => {
    void fetch("/api/exports/open", { method: "POST" });
  }, []);

  return { state, start, cancel, reset, openFolder };
}
