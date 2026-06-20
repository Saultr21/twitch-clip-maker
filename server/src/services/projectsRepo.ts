import fs from "node:fs";
import path from "node:path";
import type { Project } from "@clipforge/shared";
import { migrateLayers, migrateProject, projectSchema } from "@clipforge/shared";
import { PROJECTS_DIR } from "../lib/paths.js";

// Nombres de dispositivo de Win32: CON.json se resuelve como handle de dispositivo
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Nombre de proyecto → nombre de archivo seguro (sin path traversal). */
export function sanitizeProjectName(raw: string): string {
  const clean = raw.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ _-]/g, "").trim();
  if (!clean || WINDOWS_RESERVED.test(clean)) {
    throw new Error("Nombre de proyecto no válido");
  }
  return clean;
}

function fileFor(name: string, dir: string): string {
  return path.join(dir, `${sanitizeProjectName(name)}.json`);
}

export interface ProjectListEntry {
  name: string;
  updatedAt: string;
}

export function listProjects(dir: string = PROJECTS_DIR): ProjectListEntry[] {
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

export function saveProject(name: string, project: Project, dir: string = PROJECTS_DIR): void {
  const file = fileFor(name, dir);
  const tmp = `${file}.tmp`;
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.writeFileSync(tmp, JSON.stringify(project, null, 2));
  fs.renameSync(tmp, file);
}

function tryRead(file: string): Project | null {
  try {
    const raw = migrateLayers(migrateProject(JSON.parse(fs.readFileSync(file, "utf8"))));
    const parsed = projectSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Carga el proyecto; si el principal está corrupto cae al .bak. */
export function loadProject(name: string, dir: string = PROJECTS_DIR): Project | null {
  const file = fileFor(name, dir);
  return tryRead(file) ?? tryRead(`${file}.bak`);
}

export function deleteProject(name: string, dir: string = PROJECTS_DIR): void {
  const file = fileFor(name, dir);
  fs.rmSync(file, { force: true });
  fs.rmSync(`${file}.bak`, { force: true });
}
