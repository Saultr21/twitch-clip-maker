import { useRef, useState } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

interface UploadedAsset {
  assetId: string;
  fileName: string;
}

export function ImagePanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/assets", { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error);
      }
      const asset = (await res.json()) as UploadedAsset;
      setAssets((prev) => [asset, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la imagen");
    } finally {
      setUploading(false);
    }
  };

  const insert = (asset: UploadedAsset) => {
    const img = new Image();
    img.src = `/assets/${asset.fileName}`;
    img.onload = () => {
      const project = useProjectStore.getState().project;
      const canvasRatio = project.settings.width / project.settings.height;
      const imageRatio = img.naturalWidth / img.naturalHeight;
      // ancho por defecto 30% del lienzo, alto según la proporción real
      const width = 0.3;
      const height = Math.min(1, (width / imageRatio) * canvasRatio);
      const playhead = useUiStore.getState().playhead;
      const id = useProjectStore
        .getState()
        .addImage(asset.assetId, asset.fileName, playhead, width, height);
      useUiStore.getState().select({ kind: "image", id });
    };
  };

  return (
    <section
      aria-label="Imágenes"
      className="flex-1 min-w-0 bg-surface-2/50 border-r border-border p-3 flex flex-col gap-3 overflow-y-auto"
    >
      <h2 className="text-xs font-bold tracking-wide">IMAGEN</h2>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label="Seleccionar imagen"
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
        {uploading ? "Subiendo..." : "Subir imagen"}
      </button>
      {error && (
        <p role="alert" className="text-[11px] text-danger">{error}</p>
      )}
      <ul className="grid grid-cols-2 gap-1.5" aria-label="Imágenes subidas">
        {assets.length === 0 && (
          <li className="col-span-2 text-[11px] text-muted">
            Sube una imagen y haz clic para insertarla en el playhead.
          </li>
        )}
        {assets.map((a) => (
          <li key={a.assetId}>
            <button
              type="button"
              onClick={() => insert(a)}
              className="w-full aspect-square bg-surface-2 rounded-md overflow-hidden border border-transparent hover:border-accent"
            >
              <img src={`/assets/${a.fileName}`} alt="Insertar imagen en el lienzo" className="w-full h-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
