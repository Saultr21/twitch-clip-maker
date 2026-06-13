import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyProject, projectToPreset } from "@clipforge/shared";
import { deletePreset, listPresets, loadPreset, savePreset } from "./presetsRepo.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-presets-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("presetsRepo", () => {
  const preset = projectToPreset("intro", createEmptyProject("x"));

  it("guarda, lista y recarga una plantilla", () => {
    savePreset("intro", preset, dir);
    expect(listPresets(dir).map((e) => e.name)).toEqual(["intro"]);
    expect(loadPreset("intro", dir)?.name).toBe("intro");
  });

  it("borra una plantilla y devuelve null si no existe", () => {
    savePreset("intro", preset, dir);
    deletePreset("intro", dir);
    expect(listPresets(dir)).toEqual([]);
    expect(loadPreset("intro", dir)).toBeNull();
  });

  it("sanea separadores de ruta y rechaza nombres vacíos tras sanear", () => {
    // "../x" → "x" (separadores eliminados, sin traversal): se guarda OK
    savePreset("../x", preset, dir);
    expect(fs.existsSync(path.join(dir, "x.json"))).toBe(true);
    // un nombre que queda vacío tras sanear sí se rechaza
    expect(() => savePreset("../..", preset, dir)).toThrow();
  });
});
