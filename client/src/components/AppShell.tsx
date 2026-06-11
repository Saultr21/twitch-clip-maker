import { ImagePanel } from "../features/image/ImagePanel";
import { MediaPanel } from "../features/media/MediaPanel";
import { PlaybackProvider, PreviewArea } from "../features/preview/PreviewArea";
import { PropertiesPanel } from "../features/properties/PropertiesPanel";
import { Timeline } from "../features/timeline/Timeline";
import { useUiStore } from "../stores/uiStore";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";

export function AppShell() {
  const activeTool = useUiStore((s) => s.activeTool);
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <PlaybackProvider>
        <div className="flex flex-1 min-h-0">
          <ToolRail />
          <main className="flex flex-1 min-w-0">
            {activeTool === "media" && <MediaPanel />}
            {activeTool === "image" && <ImagePanel />}
            <PreviewArea />
          </main>
          <PropertiesPanel />
        </div>
        <Timeline />
      </PlaybackProvider>
    </div>
  );
}
