import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
