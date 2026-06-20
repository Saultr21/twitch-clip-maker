import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "@clipforge/shared";
import {
  deleteProject,
  listProjects,
  loadProject,
  sanitizeProjectName,
  saveProject,
} from "./projectsRepo.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-projects-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("sanitizeProjectName", () => {
  it("elimina separadores de ruta y caracteres peligrosos", () => {
    expect(sanitizeProjectName("../../etc/passwd")).toBe("etcpasswd");
    expect(sanitizeProjectName("mi proyecto (v2)")).toBe("mi proyecto v2");
  });

  it("rechaza nombres vacíos tras sanear", () => {
    expect(() => sanitizeProjectName("../..")).toThrow();
  });

  it("rechaza nombres de dispositivo reservados de Windows", () => {
    expect(() => sanitizeProjectName("CON")).toThrow();
    expect(() => sanitizeProjectName("nul")).toThrow();
    expect(() => sanitizeProjectName("COM3")).toThrow();
  });
});

describe("projectsRepo", () => {
  it("guarda y recarga un proyecto", () => {
    const p = createEmptyProject("demo");
    saveProject("demo", p, dir);
    expect(loadProject("demo", dir)).toEqual(p);
  });

  it("lista los proyectos guardados", () => {
    saveProject("uno", createEmptyProject("uno"), dir);
    saveProject("dos", createEmptyProject("dos"), dir);
    expect(listProjects(dir).map((e) => e.name).sort()).toEqual(["dos", "uno"]);
  });

  it("recupera el .bak si el principal está corrupto", () => {
    const p = createEmptyProject("demo");
    saveProject("demo", p, dir);
    const p2 = { ...p, name: "demo-v2" };
    saveProject("demo", p2, dir); // el guardado anterior pasa a .bak
    fs.writeFileSync(path.join(dir, "demo.json"), "{corrupto");
    expect(loadProject("demo", dir)?.name).toBe("demo");
  });

  it("borra un proyecto y su .bak", () => {
    saveProject("demo", createEmptyProject("demo"), dir);
    saveProject("demo", createEmptyProject("demo"), dir);
    deleteProject("demo", dir);
    expect(listProjects(dir)).toEqual([]);
    expect(fs.existsSync(path.join(dir, "demo.json.bak"))).toBe(false);
  });

  it("devuelve null si no existe", () => {
    expect(loadProject("nada", dir)).toBeNull();
  });

  it("migra un proyecto v1 en disco al cargarlo (v2 con una pista)", () => {
    // v1 = proyecto v2 válido degradado (tracks.video plano, version 1)
    const v2 = createEmptyProject("demo") as unknown as Record<string, any>;
    const clip = { id: "v1", clipId: "c1", timelineStart: 0, trimIn: 0, trimOut: 4, speed: 1,
      zoom: { x: 0.5, y: 0.5, scale: 1 },
      filters: { brightness: 0, contrast: 1, saturation: 1, hue: 0, grayscale: 0 }, crop: null };
    const v1 = { ...v2, version: 1, tracks: { ...v2.tracks, video: [clip] } };
    fs.writeFileSync(path.join(dir, "demo.json"), JSON.stringify(v1));
    const loaded = loadProject("demo", dir);
    expect(loaded?.version).toBe(2);
    expect(loaded?.tracks.video[0].clips[0].id).toBe("v1");
  });
});
