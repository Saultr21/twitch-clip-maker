import { FilesetResolver, FaceDetector, type Detection } from "@mediapipe/tasks-vision";
import type { ReframeSample } from "../../lib/reframe";

// Assets de MediaPipe (wasm + modelo). Se cargan en el primer uso y el navegador
// los cachea — igual que la app descarga yt-dlp/whisper/ffmpeg en el primer arranque.
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

let detectorPromise: Promise<FaceDetector> | null = null;
function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = FilesetResolver.forVisionTasks(WASM_BASE).then((vision) =>
      FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "IMAGE",
      }),
    );
  }
  return detectorPromise;
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const on = () => {
      video.removeEventListener("seeked", on);
      resolve();
    };
    video.addEventListener("seeked", on);
    video.currentTime = t;
  });
}

function largest(detections: Detection[]): Detection | null {
  let best: Detection | null = null;
  let bestArea = 0;
  for (const d of detections) {
    const b = d.boundingBox;
    if (!b) continue;
    const area = b.width * b.height;
    if (area > bestArea) {
      bestArea = area;
      best = d;
    }
  }
  return best;
}

/** Muestrea el centro de la cara dominante a lo largo del clip (tiempo de
 *  archivo), cada `stepSeconds`. Devuelve solo los instantes con cara detectada. */
export async function detectFaceTrack(
  fileName: string,
  trimIn: number,
  trimOut: number,
  onProgress?: (fraction: number) => void,
  stepSeconds = 0.5,
): Promise<ReframeSample[]> {
  const detector = await getDetector();
  const video = document.createElement("video");
  video.src = `/files/${fileName}`;
  video.muted = true;
  video.preload = "auto";
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("No se pudo cargar el vídeo"));
  });

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");

  const samples: ReframeSample[] = [];
  const span = Math.max(0.001, trimOut - trimIn);
  try {
    for (let t = trimIn; t < trimOut; t += stepSeconds) {
      await seek(video, t);
      ctx.drawImage(video, 0, 0, vw, vh);
      const det = largest(detector.detect(canvas).detections);
      if (det?.boundingBox) {
        const b = det.boundingBox;
        samples.push({ t, x: (b.originX + b.width / 2) / vw, y: (b.originY + b.height / 2) / vh });
      }
      onProgress?.((t - trimIn) / span);
    }
  } finally {
    video.removeAttribute("src");
    video.load();
  }
  return samples;
}
