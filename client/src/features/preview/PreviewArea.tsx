import { createContext, useCallback, useContext, useRef, useState, type ReactNode, type RefObject } from "react";
import { OverlayLayer } from "./OverlayLayer";
import { PreviewCanvas } from "./PreviewCanvas";
import { TransportBar } from "./TransportBar";
import { usePlaybackEngine } from "./usePlaybackEngine";
import { useMusicEngine } from "./useMusicEngine";

interface PlaybackApi {
  seek: (t: number) => void;
  togglePlay: () => void;
  inGap: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  registerOverlayVideo: (trackId: string, el: HTMLVideoElement | null) => void;
}

const PlaybackContext = createContext<PlaybackApi | null>(null);

export function usePlayback(): PlaybackApi {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback debe usarse dentro de PlaybackProvider");
  return ctx;
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Registro de los <video> de las pistas superiores (esclavos), por id de pista
  const overlayVideos = useRef<Map<string, HTMLVideoElement>>(new Map());
  const registerOverlayVideo = useCallback((trackId: string, el: HTMLVideoElement | null) => {
    if (el) overlayVideos.current.set(trackId, el);
    else overlayVideos.current.delete(trackId);
  }, []);
  const engine = usePlaybackEngine(videoRef, overlayVideos);
  useMusicEngine();
  return (
    <PlaybackContext.Provider value={{ ...engine, videoRef, registerOverlayVideo }}>
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
        loop={loop}
        setLoop={setLoop}
      />
    </div>
  );
}
