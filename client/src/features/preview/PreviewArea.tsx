import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from "react";
import { OverlayLayer } from "./OverlayLayer";
import { PreviewCanvas } from "./PreviewCanvas";
import { TransportBar } from "./TransportBar";
import { usePlaybackEngine } from "./usePlaybackEngine";

interface PlaybackApi {
  seek: (t: number) => void;
  togglePlay: () => void;
  inGap: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
}

const PlaybackContext = createContext<PlaybackApi | null>(null);

export function usePlayback(): PlaybackApi {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback debe usarse dentro de PlaybackProvider");
  return ctx;
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const engine = usePlaybackEngine(videoRef);
  return (
    <PlaybackContext.Provider value={{ ...engine, videoRef }}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function PreviewArea() {
  const { seek, togglePlay, inGap, videoRef } = usePlayback();
  const [loop, setLoop] = useState(false);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PreviewCanvas videoRef={videoRef} inGap={inGap}>
        {(canvas) => <OverlayLayer width={canvas.width} height={canvas.height} />}
      </PreviewCanvas>
      <TransportBar
        seek={seek}
        togglePlay={togglePlay}
        videoRef={videoRef}
        loop={loop}
        setLoop={setLoop}
      />
    </div>
  );
}
