const TOOLS = [
  { id: "media", icon: "🎬", label: "Medios", enabled: true },
  { id: "text", icon: "📝", label: "Texto", enabled: false },
  { id: "image", icon: "🖼️", label: "Imagen", enabled: false },
  { id: "audio", icon: "🎵", label: "Audio", enabled: false },
  { id: "filters", icon: "🎨", label: "Filtros", enabled: false },
  { id: "speed", icon: "⚡", label: "Velocidad", enabled: false },
] as const;

export function ToolRail() {
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
          aria-pressed={tool.enabled ? tool.id === "media" : undefined}
          title={tool.enabled ? tool.label : `${tool.label} — próximos hitos`}
          className={`w-12 rounded-lg py-1.5 text-center text-[10px] disabled:opacity-40 ${
            tool.id === "media"
              ? "bg-accent/15 border border-accent text-accent-soft"
              : "text-muted"
          }`}
        >
          <span className="block text-base" aria-hidden="true">
            {tool.icon}
          </span>
          {tool.label}
        </button>
      ))}
    </nav>
  );
}
