import { useProjectStore } from "../stores/projectStore";
import { useUiStore, type Tool } from "../stores/uiStore";
import { videoClipAt } from "../lib/timeline";

const TOOLS: Array<{ id: string; icon: string; label: string; enabled: boolean }> = [
  { id: "media", icon: "🎬", label: "Medios", enabled: true },
  { id: "text", icon: "📝", label: "Texto", enabled: true },
  { id: "image", icon: "🖼️", label: "Imagen", enabled: true },
  { id: "audio", icon: "🎵", label: "Audio", enabled: true },
  { id: "subtitles", icon: "💬", label: "Subtítulos", enabled: true },
  { id: "filters", icon: "🎨", label: "Filtros", enabled: true },
  { id: "speed", icon: "⚡", label: "Velocidad", enabled: true },
];

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
    if (id === "filters" || id === "speed") {
      // acción directa: selecciona el clip bajo el playhead (sus sliders
      // están en el panel de propiedades)
      const { project } = useProjectStore.getState();
      const playhead = useUiStore.getState().playhead;
      const clip = videoClipAt(project.tracks.video, playhead) ?? project.tracks.video[0];
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
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          disabled={!tool.enabled}
          aria-pressed={tool.enabled && tool.id !== "text" && tool.id !== "filters" && tool.id !== "speed" ? activeTool === tool.id : undefined}
          title={tool.enabled ? tool.label : `${tool.label} — próximos hitos`}
          onClick={() => onTool(tool.id)}
          className={`w-12 rounded-lg py-1.5 text-center text-[10px] disabled:opacity-40 ${
            tool.id === activeTool
              ? "bg-accent/15 border border-accent text-accent-soft"
              : "text-muted hover:text-text"
          }`}
        >
          <span className="block text-base" aria-hidden="true">{tool.icon}</span>
          {tool.label}
        </button>
      ))}
    </nav>
  );
}
