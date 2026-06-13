import fs from "node:fs";
import path from "node:path";
import type { Preset } from "@clipforge/shared";
import { presetSchema } from "@clipforge/shared";
import { PRESETS_DIR } from "../lib/paths.js";
import { sanitizeProjectName } from "./projectsRepo.js";

function fileFor(name: string, dir: string): string {
  return path.join(dir, `${sanitizeProjectName(name)}.json`);
}

export interface PresetListEntry {
  name: string;
  updatedAt: string;
}

export function listPresets(dir: string = PRESETS_DIR): PresetListEntry[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: f.replace(/\.json$/, ""),
      updatedAt: fs.statSync(path.join(dir, f)).mtime.toISOString(),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function savePreset(name: string, preset: Preset, dir: string = PRESETS_DIR): void {
  fs.writeFileSync(fileFor(name, dir), JSON.stringify(preset, null, 2));
}

export function loadPreset(name: string, dir: string = PRESETS_DIR): Preset | null {
  try {
    const parsed = presetSchema.safeParse(JSON.parse(fs.readFileSync(fileFor(name, dir), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function deletePreset(name: string, dir: string = PRESETS_DIR): void {
  fs.rmSync(fileFor(name, dir), { force: true });
}
