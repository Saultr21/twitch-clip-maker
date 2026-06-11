import { ImagePanel } from "../features/image/ImagePanel";
import { MediaPanel } from "../features/media/MediaPanel";
import { PreviewArea } from "../features/preview/PreviewArea";
import { useUiStore } from "../stores/uiStore";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";

export function AppShell() {
  const activeTool = useUiStore((s) => s.activeTool);

  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <ToolRail />
        <main className="flex flex-1 min-w-0">
          {activeTool === "media" && <MediaPanel />}
          {activeTool === "image" && <ImagePanel />}
          <PreviewArea />
        </main>
        <aside
          aria-label="Propiedades"
          className="w-72 bg-surface border-l border-border p-3 text-xs text-muted"
        >
          Propiedades — Hito 2
        </aside>
      </div>
      <footer className="h-36 bg-surface border-t border-border grid place-items-center text-xs text-muted">
        Línea de tiempo — Hito 2
      </footer>
    </div>
  );
}
