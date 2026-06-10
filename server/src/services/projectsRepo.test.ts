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
});
