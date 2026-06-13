import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { CLIPS_DIR, THUMBNAILS_DIR } from "../lib/paths.js";
import { ffmpegBin } from "./binaries.js";
import { listClips } from "./clipsRegistry.js";

/** Ruta del thumbnail JPEG del clip, generándolo una vez si no existe.
 *  Lanza si el clip no está en el registro. */
export async function getClipThumbnail(id: string): Promise<string> {
  const clip = listClips().find((c) => c.id === id);
  if (!clip) throw new Error("Clip no encontrado");

  const thumbPath = path.join(THUMBNAILS_DIR, `${id}.jpg`);
  if (fs.existsSync(thumbPath)) return thumbPath;

  const source = path.join(CLIPS_DIR, clip.fileName);
  if (!fs.existsSync(source)) throw new Error("Vídeo del clip no encontrado");

  // un fotograma ~1s (o al inicio si dura menos), reducido a 320px de ancho
  const at = Math.min(1, Math.max(0, clip.duration - 0.1));
  const tmp = `${thumbPath}.tmp.jpg`;
  await execa(ffmpegBin, [
    "-y", "-ss", String(at), "-i", source,
    "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "4", tmp,
  ]);
  fs.renameSync(tmp, thumbPath);
  return thumbPath;
}
