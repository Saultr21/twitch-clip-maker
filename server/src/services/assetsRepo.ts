import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sniffAudioExt } from "../lib/audioSniff.js";
import { sniffImageExt } from "../lib/imageSniff.js";
import { ASSETS_DIR } from "../lib/paths.js";

export interface SavedAsset {
  assetId: string;
  fileName: string;
}

/** Guarda una imagen subida tras verificar su tipo real. Lanza si no es png/jpg/gif/webp. */
export function saveImageAsset(buf: Buffer, dir: string = ASSETS_DIR): SavedAsset {
  const ext = sniffImageExt(buf);
  if (!ext) throw new Error("El archivo no es una imagen soportada (png, jpg, gif, webp)");
  const assetId = crypto.randomUUID();
  const fileName = `${assetId}.${ext}`;
  fs.writeFileSync(path.join(dir, fileName), buf);
  return { assetId, fileName };
}

/** Guarda un audio subido tras verificar su tipo real. Lanza si no es mp3/wav/ogg. */
export function saveAudioAsset(buf: Buffer, dir: string = ASSETS_DIR): SavedAsset {
  const ext = sniffAudioExt(buf);
  if (!ext) throw new Error("El archivo no es un audio soportado (mp3, wav, ogg)");
  const assetId = crypto.randomUUID();
  const fileName = `${assetId}.${ext}`;
  fs.writeFileSync(path.join(dir, fileName), buf);
  return { assetId, fileName };
}
