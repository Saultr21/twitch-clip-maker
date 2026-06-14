import { useEffect, useRef, useState, type FormEvent } from "react";
import { Trash2, Upload } from "lucide-react";
import type { ClipInfo } from "@clipforge/shared";
import { useClipsStore } from "../../stores/clipsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { confirmDialog } from "../../stores/dialogStore";

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
    uploading,
    fetchClips,
    selectClip,
    downloadClip,
    uploadClip,
    removeClip,
  } = useClipsStore();
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragFiles, setDragFiles] = useState(false);

  const uploadFiles = async (files: FileList | null) => {
    if (!files) return;
    // un archivo a la vez (el backend acepta uno por petición)
    for (const file of Array.from(files).filter((f) => f.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(f.name))) {
      await uploadClip(file);
    }
  };

  const addToTimeline = (clip: ClipInfo) => {
    useProjectStore.getState().addVideoClip(clip);
    useUiStore.getState().select(null);
  };

  const onDelete = async (clip: ClipInfo) => {
    const inTimeline = useProjectStore.getState().project.tracks.video.some((v) => v.clipId === clip.id);
    const msg = inTimeline
      ? `¿Borrar «${clip.title}»? Se quitará también de la línea de tiempo.`
      : `¿Borrar «${clip.title}»? Esta acción no se puede deshacer.`;
    if (!(await confirmDialog({ message: msg, danger: true }))) return;
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
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          if (!dragFiles) setDragFiles(true);
        }
      }}
      onDragLeave={(e) => {
        // solo al salir de la sección, no al pasar entre hijos
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragFiles(false);
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        setDragFiles(false);
        void uploadFiles(e.dataTransfer.files);
      }}
      className={`flex-1 min-w-0 bg-surface-2/50 border-r border-border p-3 flex flex-col gap-3 overflow-y-auto ${
        dragFiles ? "ring-2 ring-inset ring-accent bg-accent/5" : ""
      }`}
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

      <div className="flex items-center gap-2 text-[10px] text-muted">
        <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-msvideo,.mp4,.webm,.mov,.mkv,.avi,.m4v"
        aria-label="Seleccionar vídeo del escritorio"
        className="sr-only"
        onChange={(e) => {
          void uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="flex items-center justify-center gap-1.5 text-xs text-accent-soft border border-border-2 rounded-md py-1.5 hover:border-accent disabled:opacity-50"
      >
        <Upload size={14} aria-hidden="true" />
        {uploading ? "Subiendo vídeo..." : "Subir vídeo del escritorio"}
      </button>
      <p className="text-[10px] text-muted -mt-1">
        O arrastra un vídeo aquí (mp4, webm, mov, mkv, avi).
      </p>

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
            Aún no hay vídeos. Pega una URL de Twitch, sube un archivo o arrástralo aquí.
          </li>
        )}
        {clips.map((clip) => (
          <li
            key={clip.id}
            className={`relative bg-surface-2 rounded-md overflow-hidden border ${
              clip.id === selectedClipId ? "border-accent" : "border-transparent"
            }`}
          >
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-clip-id", clip.id);
                e.dataTransfer.effectAllowed = "copy";
                selectClip(clip.id);
              }}
              onClick={() => selectClip(clip.id)}
              onDoubleClick={() => addToTimeline(clip)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addToTimeline(clip);
                }
              }}
              aria-pressed={clip.id === selectedClipId}
              title="Doble clic o Enter para añadir · arrastra a la línea de tiempo"
              aria-label={`${clip.title}. Doble clic o Enter para añadir a la línea de tiempo; también puedes arrastrarlo`}
              className="w-full text-left text-[11px] cursor-grab active:cursor-grabbing"
            >
              <img
                src={`/api/clips/${clip.id}/thumbnail`}
                alt=""
                loading="lazy"
                draggable={false}
                className="w-full aspect-video object-cover bg-black pointer-events-none"
              />
              <span className={`block truncate font-medium px-2 pt-1.5 ${clip.id === selectedClipId ? "text-text" : ""}`}>
                {clip.title}
              </span>
              <span className="block px-2 pb-1 text-muted">
                {formatDuration(clip.duration)} · {clip.width}x{clip.height}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void onDelete(clip)}
              aria-label={`Borrar clip ${clip.title}`}
              title="Borrar clip"
              className="absolute top-1 right-1 p-1 rounded-md bg-black/50 text-white/80 hover:text-danger grid place-items-center"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
