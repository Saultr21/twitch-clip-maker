import { useEffect } from "react";
import { AudioPanel } from "../features/audio/AudioPanel";
import { ImagePanel } from "../features/image/ImagePanel";
import { MediaPanel } from "../features/media/MediaPanel";
import { PlaybackProvider, PreviewArea, usePlayback } from "../features/preview/PreviewArea";
import { PropertiesPanel } from "../features/properties/PropertiesPanel";
import { Timeline } from "../features/timeline/Timeline";
import { useUiStore } from "../stores/uiStore";
import { handleShortcut } from "../lib/shortcuts";
import { ResizeHandle } from "./ResizeHandle";
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
  const toolPanelWidth = useUiStore((s) => s.toolPanelWidth);
  const propertiesWidth = useUiStore((s) => s.propertiesWidth);
  const timelineHeight = useUiStore((s) => s.timelineHeight);
  const setToolPanelWidth = useUiStore((s) => s.setToolPanelWidth);
  const setPropertiesWidth = useUiStore((s) => s.setPropertiesWidth);
  const setTimelineHeight = useUiStore((s) => s.setTimelineHeight);

  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <PlaybackProvider>
        <GlobalShortcuts />
        <div className="flex flex-1 min-h-0">
          <ToolRail />
          <main className="flex flex-1 min-w-0">
            <div className="flex shrink-0" style={{ width: toolPanelWidth }}>
              {activeTool === "media" && <MediaPanel />}
              {activeTool === "image" && <ImagePanel />}
              {activeTool === "audio" && <AudioPanel />}
            </div>
            <ResizeHandle
              orientation="vertical"
              label="Redimensionar panel de herramientas"
              onDelta={(d) => setToolPanelWidth(useUiStore.getState().toolPanelWidth + d)}
            />
            <PreviewArea />
          </main>
          <ResizeHandle
            orientation="vertical"
            label="Redimensionar panel de propiedades"
            onDelta={(d) => setPropertiesWidth(useUiStore.getState().propertiesWidth - d)}
          />
          <div className="flex shrink-0" style={{ width: propertiesWidth }}>
            <PropertiesPanel />
          </div>
        </div>
        <ResizeHandle
          orientation="horizontal"
          label="Redimensionar línea de tiempo"
          onDelta={(d) => setTimelineHeight(useUiStore.getState().timelineHeight - d)}
        />
        <Timeline height={timelineHeight} />
      </PlaybackProvider>
    </div>
  );
}
