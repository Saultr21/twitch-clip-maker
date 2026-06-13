import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { execa } from "execa";
import { BIN_DIR } from "../../lib/paths.js";

// Release verificado en runtime: v1.8.6 contiene whisper-cli.exe en Release/
const WHISPER_ZIP_URL =
  "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.6/whisper-bin-x64.zip";
const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";

const WHISPER_DIR = path.join(BIN_DIR, "whisper");
export const whisperExe = path.join(WHISPER_DIR, "whisper-cli.exe");
export const whisperModel = path.join(WHISPER_DIR, "ggml-base.bin");

export type WhisperStatus =
  | { ready: true }
  | { ready: false; step: "missing" | "downloading" | "error"; message?: string };

let status: WhisperStatus = { ready: false, step: "missing" };
export function getWhisperStatus(): WhisperStatus {
  return status;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Descarga fallida (${res.status}): ${url}`);
  const tmp = `${dest}.tmp`;
  try {
    await pipeline(Readable.fromWeb(res.body as WebReadableStream), fs.createWriteStream(tmp));
    fs.renameSync(tmp, dest);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/** Asegura whisper-cli.exe + modelo. Idempotente; seguro llamar varias veces. */
export async function ensureWhisper(): Promise<void> {
  if (fs.existsSync(whisperExe) && fs.existsSync(whisperModel)) {
    status = { ready: true };
    return;
  }
  try {
    status = { ready: false, step: "downloading" };
    fs.mkdirSync(WHISPER_DIR, { recursive: true });
    if (!fs.existsSync(whisperExe)) {
      const zip = path.join(WHISPER_DIR, "whisper.zip");
      await download(WHISPER_ZIP_URL, zip);
      // bsdtar (Windows 10+) extrae zip; -C destino
      await execa("tar", ["-xf", zip, "-C", WHISPER_DIR]);
      fs.rmSync(zip, { force: true });
      // El release anida el exe en Release/ junto a sus DLLs (whisper.dll,
      // ggml.dll, …). Hay que dejar el exe Y sus DLLs juntos en WHISPER_DIR,
      // porque Windows resuelve las DLLs en el directorio del ejecutable.
      if (!fs.existsSync(whisperExe)) {
        const found = findExe(WHISPER_DIR);
        if (!found) throw new Error("No se encontró el ejecutable de whisper en el zip");
        const srcDir = path.dirname(found);
        if (srcDir !== WHISPER_DIR) {
          for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
            if (entry.isFile()) {
              fs.copyFileSync(path.join(srcDir, entry.name), path.join(WHISPER_DIR, entry.name));
            }
          }
        }
        // si el exe encontrado se llamaba main.exe, normalizar el nombre
        if (!fs.existsSync(whisperExe)) {
          fs.copyFileSync(path.join(WHISPER_DIR, path.basename(found)), whisperExe);
        }
      }
    }
    if (!fs.existsSync(whisperModel)) {
      await download(MODEL_URL, whisperModel);
    }
    status = { ready: true };
  } catch (err) {
    status = { ready: false, step: "error", message: err instanceof Error ? err.message : "Error" };
    throw err;
  }
}

/** Busca recursivamente whisper-cli.exe o main.exe dentro de dir. */
function findExe(dir: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findExe(full);
      if (nested) return nested;
    } else if (/^(whisper-cli|main)\.exe$/i.test(entry.name)) {
      return full;
    }
  }
  return null;
}
