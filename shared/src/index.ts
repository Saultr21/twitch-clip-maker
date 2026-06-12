export interface ClipInfo {
  id: string;
  url: string;
  title: string;
  fileName: string;
  duration: number;
  width: number;
  height: number;
  createdAt: string;
}

export type DownloadEvent =
  | { type: "progress"; percent: number }
  | { type: "done"; clip: ClipInfo }
  | { type: "error"; message: string };

export interface SetupStatus {
  ready: boolean;
  step: "checking" | "downloading-ytdlp" | "ready" | "error";
  message?: string;
}

export * from "./project.js";
