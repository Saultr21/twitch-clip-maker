import fs from "node:fs";
import path from "node:path";
import type { ClipInfo } from "@clipforge/shared";
import { CLIPS_DIR } from "../lib/paths.js";

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
