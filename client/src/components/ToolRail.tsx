import { useProjectStore } from "../stores/projectStore";
import { useUiStore, type Tool } from "../stores/uiStore";

const TOOLS: Array<{ id: string; icon: string; label: string; enabled: boolean }> = [
  { id: "media", icon: "🎬", label: "Medios", enabled: true },
  { id: "text", icon: "📝", label: "Texto", enabled: true },
  { id: "image", icon: "🖼️", label: "Imagen", enabled: true },
  { id: "audio", icon: "🎵", label: "Audio", enabled: false },
  { id: "filters", icon: "🎨", label: "Filtros", enabled: false },
  { id: "speed", icon: "⚡", label: "Velocidad", enabled: false },
];

export function ToolRail() {
  const activeTool = useUiStore((s) => s.activeTool);
  const setActiveTool = useUiStore((s) => s.setActiveTool);

  const onTool = (id: string) => {
    if (id === "text") {
      // Texto: acción directa — crea un overlay en el playhead y lo selecciona
      const playhead = useUiStore.getState().playhead;
      const newId = useProjectStore.getState().addText(playhead);
      useUiStore.getState().select({ kind: "text", id: newId });
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
          aria-pressed={tool.enabled && tool.id !== "text" ? tool.id === activeTool : undefined}
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
