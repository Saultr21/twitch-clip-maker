import fs from "node:fs";
import path from "node:path";
import type { ClipInfo } from "@clipforge/shared";
import { CLIPS_DIR, THUMBNAILS_DIR, WAVEFORMS_DIR } from "../lib/paths.js";

function indexPath(dir: string): string {
  return path.join(dir, "index.json");
}

export function listClips(dir: string = CLIPS_DIR): ClipInfo[] {
  try {
    return JSON.parse(fs.readFileSync(indexPath(dir), "utf8")) as ClipInfo[];
  } catch {
    return [];
  }
}

export function addClip(clip: ClipInfo, dir: string = CLIPS_DIR): void {
  const clips = listClips(dir).filter((c) => c.id !== clip.id);
  clips.unshift(clip);
  fs.writeFileSync(indexPath(dir), JSON.stringify(clips, null, 2));
}

/** Quita un clip del índice y borra su vídeo y su thumbnail cacheado.
 *  Devuelve false si el id no existía. */
export function removeClip(id: string, dir: string = CLIPS_DIR): boolean {
  const clips = listClips(dir);
  const clip = clips.find((c) => c.id === id);
  if (!clip) return false;
  fs.writeFileSync(indexPath(dir), JSON.stringify(clips.filter((c) => c.id !== id), null, 2));
  fs.rmSync(path.join(dir, clip.fileName), { force: true });
  fs.rmSync(path.join(THUMBNAILS_DIR, `${id}.jpg`), { force: true });
  fs.rmSync(path.join(WAVEFORMS_DIR, `clip-${clip.fileName}.json`), { force: true });
  return true;
}
