import { useCallback, useEffect, useRef, useState } from "react";
import type { SubtitleCue, VideoClip } from "@clipforge/shared";

export type TranscribePhase =
  | { phase: "idle" }
  | { phase: "running"; jobId: string }
  | { phase: "error"; message: string };

export function useTranscribe(onCues: (cues: SubtitleCue[]) => void) {
  const [state, setState] = useState<TranscribePhase>({ phase: "idle" });
  const sourceRef = useRef<EventSource | null>(null);
  useEffect(() => () => sourceRef.current?.close(), []);

  const start = useCallback(
    async (clip: VideoClip, language: string) => {
      try {
        const res = await fetch("/api/subtitles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clip, language }),
        });
        if (!res.ok) {
          const b = (await res.json()) as { error: string };
          throw new Error(b.error);
        }
        const { jobId } = (await res.json()) as { jobId: string };
        setState({ phase: "running", jobId });
        const src = new EventSource(`/api/subtitles/${jobId}/progress`);
        sourceRef.current = src;
        src.onmessage = (e) => {
          const ev = JSON.parse(e.data) as
            | { type: "done"; cues: SubtitleCue[] }
            | { type: "error"; message: string };
          src.close();
          sourceRef.current = null;
          if (ev.type === "done") {
            onCues(ev.cues);
            setState({ phase: "idle" });
          } else {
            setState({ phase: "error", message: ev.message });
          }
        };
        src.onerror = () => {
          src.close();
          sourceRef.current = null;
          setState((s) => (s.phase === "running" ? { phase: "error", message: "Se perdió la conexión" } : s));
        };
      } catch (err) {
        setState({ phase: "error", message: err instanceof Error ? err.message : "Error" });
      }
    },
    [onCues],
  );

  const cancel = useCallback(async () => {
    if (state.phase !== "running") return;
    sourceRef.current?.close();
    sourceRef.current = null;
    await fetch(`/api/subtitles/${state.jobId}`, { method: "DELETE" });
    setState({ phase: "idle" });
  }, [state]);

  return { state, start, cancel };
}
