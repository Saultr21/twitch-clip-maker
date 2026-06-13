import fs from "node:fs";
import path from "node:path";
import type { Watermark } from "@clipforge/shared";
import { WATERMARKS_DIR } from "../lib/paths.js";

function indexPath(dir: string): string {
  return path.join(dir, "index.json");
}

export function listWatermarks(dir: string = WATERMARKS_DIR): Watermark[] {
  try {
    return JSON.parse(fs.readFileSync(indexPath(dir), "utf8")) as Watermark[];
  } catch {
    return [];
  }
}

export function addWatermark(wm: Watermark, dir: string = WATERMARKS_DIR): void {
  const list = listWatermarks(dir).filter((w) => w.id !== wm.id);
  list.unshift(wm);
  fs.writeFileSync(indexPath(dir), JSON.stringify(list, null, 2));
}

export function removeWatermark(id: string, dir: string = WATERMARKS_DIR): void {
  const list = listWatermarks(dir).filter((w) => w.id !== id);
  fs.writeFileSync(indexPath(dir), JSON.stringify(list, null, 2));
}
