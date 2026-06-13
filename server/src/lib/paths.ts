import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");

export const DATA_DIR = path.join(ROOT, "data");
export const CLIPS_DIR = path.join(DATA_DIR, "clips");
export const BIN_DIR = path.join(DATA_DIR, "bin");
export const PROJECTS_DIR = path.join(DATA_DIR, "projects");
export const ASSETS_DIR = path.join(DATA_DIR, "assets");
export const EXPORTS_DIR = path.join(DATA_DIR, "exports");
export const PRESETS_DIR = path.join(DATA_DIR, "presets");
export const WATERMARKS_DIR = path.join(DATA_DIR, "watermarks");
export const WAVEFORMS_DIR = path.join(DATA_DIR, "waveforms");
export const THUMBNAILS_DIR = path.join(DATA_DIR, "thumbnails");

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, CLIPS_DIR, BIN_DIR, PROJECTS_DIR, ASSETS_DIR, EXPORTS_DIR, PRESETS_DIR, WATERMARKS_DIR, WAVEFORMS_DIR, THUMBNAILS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
