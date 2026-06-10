import { useRef, useState } from "react";
import { PreviewCanvas } from "./PreviewCanvas";
import { TransportBar } from "./TransportBar";
import { usePlaybackEngine } from "./usePlaybackEngine";

export function PreviewArea() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loop, setLoop] = useState(false);
  const { seek, togglePlay, inGap } = usePlaybackEngine(videoRef);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PreviewCanvas videoRef={videoRef} inGap={inGap} />
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
