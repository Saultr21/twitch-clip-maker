import { useEffect } from "react";
import { ImagePanel } from "../features/image/ImagePanel";
import { MediaPanel } from "../features/media/MediaPanel";
import { PlaybackProvider, PreviewArea, usePlayback } from "../features/preview/PreviewArea";
import { PropertiesPanel } from "../features/properties/PropertiesPanel";
import { Timeline } from "../features/timeline/Timeline";
import { useUiStore } from "../stores/uiStore";
import { handleShortcut } from "../lib/shortcuts";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";

function GlobalShortcuts() {
  const { seek, togglePlay } = usePlayback();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleShortcut(e, { seek, togglePlay });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seek, togglePlay]);
  return null;
}

export function AppShell() {
  const activeTool = useUiStore((s) => s.activeTool);
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <PlaybackProvider>
        <GlobalShortcuts />
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
