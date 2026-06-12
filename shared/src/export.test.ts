import { describe, expect, it } from "vitest";
import { createEmptyProject } from "./project.js";
import { exportRequestSchema, QUALITY_PRESET_IDS } from "./export.js";

describe("exportRequestSchema", () => {
  it("acepta una petición válida", () => {
    const req = {
      project: createEmptyProject("demo"),
      preset: "tiktok",
      fileName: "mi-video",
    };
    expect(exportRequestSchema.safeParse(req).success).toBe(true);
  });

  it("acepta fileName ausente (se genera en el servidor)", () => {
    const req = { project: createEmptyProject("demo"), preset: "youtube" };
    expect(exportRequestSchema.safeParse(req).success).toBe(true);
  });

  it("rechaza un preset desconocido", () => {
    const req = { project: createEmptyProject("demo"), preset: "4k-imax" };
    expect(exportRequestSchema.safeParse(req).success).toBe(false);
  });
});

describe("QUALITY_PRESET_IDS", () => {
  it("expone los tres presets aprobados", () => {
    expect(QUALITY_PRESET_IDS).toEqual(["tiktok", "youtube", "custom"]);
  });
});
