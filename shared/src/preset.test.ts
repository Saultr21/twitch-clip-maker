import { describe, expect, it } from "vitest";
import { createEmptyProject, createTextOverlay } from "./project.js";
import { presetSchema, projectToPreset } from "./preset.js";

describe("projectToPreset", () => {
  it("extrae settings, textos e imágenes (sin clips ni audio)", () => {
    const p = createEmptyProject("demo");
    // v4: añadir texto directamente como item kind=text en la capa media existente
    p.tracks.layers[0].items.push({ ...createTextOverlay(0), kind: "text" });
    const preset = projectToPreset("mi-plantilla", p);
    expect(preset.name).toBe("mi-plantilla");
    expect(preset.text).toHaveLength(1);
    expect(preset.image).toHaveLength(0);
    expect(presetSchema.safeParse(preset).success).toBe(true);
  });
});
