import { Film, Type, Image, Music, Captions, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore, type Tool } from "../stores/uiStore";
import { videoClipAt } from "../lib/timeline";

// "text" y "filters" son acciones (seleccionan un elemento), el resto abren panel.
// "Velocidad" se quitó: su control vive en Propiedades junto a los filtros del clip.
const TOOLS: Array<{ id: string; Icon: LucideIcon; label: string }> = [
  { id: "media", Icon: Film, label: "Medios" },
  { id: "text", Icon: Type, label: "Texto" },
  { id: "image", Icon: Image, label: "Imagen" },
  { id: "audio", Icon: Music, label: "Audio" },
  { id: "subtitles", Icon: Captions, label: "Subtítulos" },
  { id: "filters", Icon: SlidersHorizontal, label: "Filtros" },
];

const PANEL_TOOLS = new Set(["media", "image", "audio", "subtitles"]);

export function ToolRail() {
  const activeTool = useUiStore((s) => s.activeTool);
  const setActiveTool = useUiStore((s) => s.setActiveTool);

  const onTool = (id: string) => {
    if (id === "text") {
      const playhead = useUiStore.getState().playhead;
      const newId = useProjectStore.getState().addText(playhead);
      useUiStore.getState().select({ kind: "text", id: newId });
      return;
    }
    if (id === "filters") {
      // acción directa: selecciona el clip bajo el playhead (sus sliders de
      // color y velocidad están en el panel de propiedades)
      const { project } = useProjectStore.getState();
      const playhead = useUiStore.getState().playhead;
      const clip = videoClipAt(project.tracks.video[0]?.clips ?? [], playhead) ?? project.tracks.video[0]?.clips[0];
      if (clip) useUiStore.getState().select({ kind: "video", id: clip.id });
      return;
    }
    setActiveTool(id as Tool);
  };

  return (
    <nav
      aria-label="Herramientas"
      className="w-16 bg-surface border-r border-border flex flex-col items-center gap-1 py-2"
    >
      {TOOLS.map(({ id, Icon, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={PANEL_TOOLS.has(id) ? activeTool === id : undefined}
          title={label}
          onClick={() => onTool(id)}
          className={`w-12 rounded-lg py-1.5 flex flex-col items-center gap-0.5 text-[10px] ${
            id === activeTool
              ? "bg-accent/15 border border-accent text-accent-soft"
              : "text-muted hover:text-text"
          }`}
        >
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          {label}
        </button>
      ))}
    </nav>
  );
}
