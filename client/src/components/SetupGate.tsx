import { useEffect, useState, type ReactNode } from "react";
import type { SetupStatus } from "@clipforge/shared";

const STEP_LABELS: Record<SetupStatus["step"], string> = {
  checking: "Comprobando herramientas...",
  "downloading-ytdlp": "Descargando yt-dlp (primer arranque)...",
  ready: "Listo",
  error: "Error de preparación",
};

export function SetupGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SetupStatus | null>(null);

  useEffect(() => {
    let timer: number;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/setup/status");
        if (!res.ok) throw new Error(res.statusText);
        const next = (await res.json()) as SetupStatus;
        if (cancelled) return;
        setStatus(next);
        if (!next.ready && next.step !== "error") {
          timer = window.setTimeout(poll, 1500);
        }
      } catch {
        if (!cancelled) timer = window.setTimeout(poll, 1500);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (status?.ready) return <>{children}</>;

  return (
    <div className="h-screen grid place-items-center bg-bg">
      <div className="text-center" role="status" aria-live="polite">
        <p className="text-2xl font-bold mb-2">
          Clip<span className="text-accent">Forge</span>
        </p>
        {status?.step === "error" ? (
          <div className="max-w-md">
            <p className="text-danger text-sm">
              {STEP_LABELS.error}: {status.message}
            </p>
            <p className="text-muted text-sm mt-1">
              Reinicia la aplicación para reintentar.
            </p>
          </div>
        ) : (
          <p className="text-muted text-sm animate-pulse">
            {STEP_LABELS[status?.step ?? "checking"]}
          </p>
        )}
      </div>
    </div>
  );
}
