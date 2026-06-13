import { useEffect, useRef, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import type { Watermark } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";

interface UploadedAsset {
  assetId: string;
  fileName: string;
}

/** Inserta una imagen (por fileName) en el playhead y la selecciona.
 *  El tamaño se calcula con la proporción real; opcionalmente en una esquina. */
function insertImageOverlay(fileName: string, corner: boolean) {
  let placed = false;
  const place = (imageRatio: number) => {
    if (placed) return; // una sola inserción aunque load y complete coincidan
    placed = true;
    const store = useProjectStore.getState();
    const project = store.project;
    const canvasRatio = project.settings.width / project.settings.height;
    const width = corner ? 0.2 : 0.3;
    const height = Math.min(1, (width / imageRatio) * canvasRatio);
    const playhead = useUiStore.getState().playhead;
    // assetId == fileName sin extensión para imágenes subidas; usamos fileName como ambos
    const id = store.addImage(fileName, fileName, playhead, width, height);
    if (corner) {
      // esquina inferior derecha con margen, semitransparente (marca de agua)
      store.updateImage(id, { x: 0.85, y: 0.85, opacity: 0.85 });
    }
    useUiStore.getState().select({ kind: "image", id });
  };

  const img = new Image();
  // los handlers ANTES de src: si la imagen está cacheada (la miniatura ya la
  // cargó), el evento load se dispararía antes de asignar onload y se perdería
  img.onload = () => place(img.naturalWidth / img.naturalHeight);
  img.onerror = () => place(1); // si no carga, cuadrada por defecto
  img.src = `/assets/${fileName}`;
  // por si ya estaba completa en caché y el evento no vuelve a dispararse
  if (img.complete && img.naturalWidth > 0) place(img.naturalWidth / img.naturalHeight);
}

export function ImagePanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const wmInputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [watermarks, setWatermarks] = useState<Watermark[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/api/watermarks")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Watermark[]) => setWatermarks(list))
      .catch(() => {});
  }, []);

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

  const saveWatermark = async (file: File) => {
    const name = window.prompt("Nombre de la marca de agua:", file.name);
    if (name === null) return;
    setError(null);
    try {
      const body = new FormData();
      body.append("name", name.trim()); // antes del archivo: el campo debe leerse primero
      body.append("file", file);
      const res = await fetch("/api/watermarks", { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error);
      }
      const wm = (await res.json()) as Watermark;
      setWatermarks((prev) => [wm, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la marca de agua");
    }
  };

  const removeWatermark = async (id: string) => {
    if (!window.confirm("¿Borrar esta marca de agua guardada?")) return;
    const res = await fetch(`/api/watermarks/${id}`, { method: "DELETE" });
    if (res.ok) setWatermarks((prev) => prev.filter((w) => w.id !== id));
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
              onClick={() => insertImageOverlay(a.fileName, false)}
              className="w-full aspect-square bg-surface-2 rounded-md overflow-hidden border border-transparent hover:border-accent"
            >
              <img src={`/assets/${a.fileName}`} alt="Insertar imagen en el lienzo" className="w-full h-full object-cover" />
            </button>
          </li>
        ))}
      </ul>

      <hr className="border-border" />
      <h3 className="text-[11px] font-bold tracking-wide text-muted">MARCAS DE AGUA</h3>
      <p className="text-[11px] text-muted">
        Guarda un logo para reutilizarlo en cualquier proyecto. Se inserta en una esquina.
      </p>
      <input
        ref={wmInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label="Seleccionar marca de agua"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void saveWatermark(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => wmInputRef.current?.click()}
        className="flex items-center justify-center gap-1.5 text-xs text-accent-soft border border-border-2 rounded-md py-1.5 hover:border-accent"
      >
        <Star size={14} aria-hidden="true" />
        Guardar marca de agua
      </button>
      <ul className="flex flex-col gap-1.5" aria-label="Marcas de agua guardadas">
        {watermarks.length === 0 && (
          <li className="text-[11px] text-muted">Aún no hay marcas de agua.</li>
        )}
        {watermarks.map((w) => (
          <li key={w.id} className="flex items-center gap-1.5 bg-surface-2 rounded-md p-1">
            <button
              type="button"
              onClick={() => insertImageOverlay(w.fileName, true)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left rounded-md px-1 py-0.5 hover:bg-surface-3"
            >
              <img src={`/assets/${w.fileName}`} alt="" className="w-8 h-8 object-contain rounded bg-black/30 shrink-0" />
              <span className="text-[11px] truncate">{w.name}</span>
            </button>
            <button
              type="button"
              onClick={() => void removeWatermark(w.id)}
              aria-label={`Borrar marca de agua ${w.name}`}
              className="text-muted hover:text-danger px-1.5 shrink-0"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
