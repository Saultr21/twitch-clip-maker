import { useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import type { ClipInfo } from "@clipforge/shared";
import { useClipsStore } from "../../stores/clipsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MediaPanel() {
  const {
    clips,
    selectedClipId,
    downloading,
    downloadProgress,
    downloadError,
    fetchClips,
    selectClip,
    downloadClip,
    removeClip,
  } = useClipsStore();
  const [url, setUrl] = useState("");

  const onDelete = async (clip: ClipInfo) => {
    const inTimeline = useProjectStore.getState().project.tracks.video.some((v) => v.clipId === clip.id);
    const msg = inTimeline
      ? `¿Borrar «${clip.title}»? Se quitará también de la línea de tiempo.`
      : `¿Borrar «${clip.title}»? Esta acción no se puede deshacer.`;
    if (!window.confirm(msg)) return;
    const ok = await removeClip(clip.id);
    if (ok && inTimeline) {
      useProjectStore.getState().removeVideoClipsBySource(clip.id);
      useUiStore.getState().select(null);
    }
  };

  useEffect(() => {
    void fetchClips();
  }, [fetchClips]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || downloading) return;
    void downloadClip(url.trim()).then(() => setUrl(""));
  };

  return (
    <section
      aria-label="Medios"
      className="flex-1 min-w-0 bg-surface-2/50 border-r border-border p-3 flex flex-col gap-3 overflow-y-auto"
    >
      <h2 className="text-xs font-bold tracking-wide">MEDIOS</h2>

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label htmlFor="clip-url" className="text-[11px] text-muted">
          URL del clip de Twitch
        </label>
        <input
          id="clip-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://clips.twitch.tv/..."
          disabled={downloading}
          className="bg-surface-2 border border-border-2 rounded-md px-2 py-1.5 text-xs placeholder:text-muted/60 focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={downloading || !url.trim()}
          className="text-xs font-semibold text-white rounded-md py-1.5 bg-gradient-to-r from-accent to-accent-dark disabled:opacity-50"
        >
          {downloading ? "Descargando..." : "Descargar clip"}
        </button>
      </form>

      {downloading && (
        <div role="status" aria-live="polite">
          <div
            role="progressbar"
            aria-valuenow={Math.round(downloadProgress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso de descarga"
            className="h-1.5 bg-surface-3 rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <p className="text-[11px] text-muted mt-1">
            {Math.round(downloadProgress)}%
          </p>
        </div>
      )}

      {downloadError && (
        <p role="alert" className="text-[11px] text-danger">
          {downloadError}
        </p>
      )}

      <ul className="flex flex-col gap-1.5" aria-label="Clips descargados">
        {clips.length === 0 && !downloading && (
          <li className="text-[11px] text-muted">
            Aún no hay clips. Pega una URL para empezar.
          </li>
        )}
        {clips.map((clip) => (
          <li
            key={clip.id}
            className={`bg-surface-2 rounded-md overflow-hidden border ${
              clip.id === selectedClipId ? "border-accent" : "border-transparent"
            }`}
          >
            <button
              type="button"
              onClick={() => selectClip(clip.id)}
              aria-pressed={clip.id === selectedClipId}
              className="w-full text-left text-[11px]"
            >
              <img
                src={`/api/clips/${clip.id}/thumbnail`}
                alt=""
                loading="lazy"
                className="w-full aspect-video object-cover bg-black"
              />
              <span className={`block truncate font-medium px-2 pt-1.5 ${clip.id === selectedClipId ? "text-text" : ""}`}>
                {clip.title}
              </span>
              <span className="block px-2 pb-1 text-muted">
                {formatDuration(clip.duration)} · {clip.width}x{clip.height}
              </span>
            </button>
            <div className="flex items-stretch gap-1 px-1 pb-1">
              <button
                type="button"
                onClick={() => {
                  useProjectStore.getState().addVideoClip(clip);
                  useUiStore.getState().select(null);
                }}
                className="flex-1 text-[11px] text-accent-soft border border-border-2 rounded-md py-1 hover:border-accent"
              >
                + Añadir a la línea de tiempo
              </button>
              <button
                type="button"
                onClick={() => void onDelete(clip)}
                aria-label={`Borrar clip ${clip.title}`}
                title="Borrar clip"
                className="shrink-0 px-2 text-muted hover:text-danger border border-border-2 rounded-md grid place-items-center"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
