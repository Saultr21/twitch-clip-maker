import { useRef, useState } from "react";
import { Music } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

interface UploadedAudio {
  assetId: string;
  fileName: string;
}

export function AudioPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<UploadedAudio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const ducking = useProjectStore((s) => s.project.settings.audioDucking);
  const setAudioDucking = useProjectStore((s) => s.setAudioDucking);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/assets/audio", { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error);
      }
      const asset = (await res.json()) as UploadedAudio;
      setAssets((prev) => [asset, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir el audio");
    } finally {
      setUploading(false);
    }
  };

  const insert = (asset: UploadedAudio) => {
    const probe = new Audio();
    probe.src = `/assets/${asset.fileName}`;
    probe.onloadedmetadata = () => {
      const playhead = useUiStore.getState().playhead;
      const id = useProjectStore
        .getState()
        .addAudio(asset.assetId, asset.fileName, playhead, probe.duration);
      useUiStore.getState().select({ kind: "audio", id });
    };
  };

  return (
    <section
      aria-label="Música"
      className="flex-1 min-w-0 bg-surface-2/50 border-r border-border p-3 flex flex-col gap-3 overflow-y-auto"
    >
      <h2 className="text-xs font-bold tracking-wide">MÚSICA</h2>
      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/wav,audio/ogg"
        aria-label="Seleccionar archivo de audio"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="text-xs font-semibold text-white rounded-md py-1.5 bg-gradient-to-r from-accent to-accent-dark disabled:opacity-50"
      >
        {uploading ? "Subiendo..." : "Subir música"}
      </button>
      {error && (
        <p role="alert" className="text-[11px] text-danger">{error}</p>
      )}
      <ul className="flex flex-col gap-1.5" aria-label="Audios subidos">
        {assets.length === 0 && (
          <li className="text-[11px] text-muted">
            Sube un mp3/wav/ogg y haz clic para insertarlo en el playhead.
          </li>
        )}
        {assets.map((a) => (
          <li key={a.assetId}>
            <button
              type="button"
              onClick={() => insert(a)}
              className="flex items-center gap-1.5 w-full text-left bg-surface-2 rounded-md px-2 py-1.5 text-[11px] border border-transparent hover:border-accent"
            >
              <Music size={14} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{a.fileName}</span>
            </button>
          </li>
        ))}
      </ul>

      <label className="flex items-center gap-2 text-[11px] text-muted border-t border-border pt-3">
        <input
          type="checkbox"
          checked={ducking}
          onChange={(e) => setAudioDucking(e.target.checked)}
          className="accent-accent"
        />
        Bajar la música cuando hay voz (ducking)
      </label>
      <p className="text-[10px] text-muted -mt-1">Se aplica al exportar.</p>
    </section>
  );
}
