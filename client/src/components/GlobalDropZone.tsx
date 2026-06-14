import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { useClipsStore } from "../stores/clipsStore";
import { useUiStore } from "../stores/uiStore";

const VIDEO_RE = /\.(mp4|webm|mov|mkv|avi|m4v)$/i;

/** Permite soltar un vídeo en CUALQUIER parte de la app para subirlo (además del
 *  panel Medios). Muestra un velo mientras se arrastra un archivo encima. */
export function GlobalDropZone() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let depth = 0; // contador enter/leave para no parpadear entre hijos
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault(); // necesario para permitir el drop
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      depth = 0;
      setActive(false);
      const videos = Array.from(e.dataTransfer.files).filter(
        (f) => f.type.startsWith("video/") || VIDEO_RE.test(f.name),
      );
      if (videos.length === 0) return;
      useUiStore.getState().setActiveTool("media"); // que se vea la subida
      void (async () => {
        for (const file of videos) await useClipsStore.getState().uploadClip(file);
      })();
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  if (!active) return null;
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 pointer-events-none">
      <div className="flex flex-col items-center gap-3 text-accent-soft border-2 border-dashed border-accent rounded-2xl px-10 py-8">
        <Upload size={40} strokeWidth={1.5} aria-hidden="true" />
        <p className="text-sm font-semibold">Suelta el vídeo para subirlo</p>
      </div>
    </div>
  );
}
