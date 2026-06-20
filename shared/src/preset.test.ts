import { describe, expect, it } from "vitest";
import { createEmptyProject, createTextLayer, createTextOverlay } from "./project.js";
import { presetSchema, projectToPreset } from "./preset.js";

describe("projectToPreset", () => {
  it("extrae settings, textos e imágenes (sin clips ni audio)", () => {
    const p = createEmptyProject("demo");
    const textLayer = createTextLayer();
    textLayer.items.push(createTextOverlay(0));
    p.tracks.layers.push(textLayer);
    const preset = projectToPreset("mi-plantilla", p);
    expect(preset.name).toBe("mi-plantilla");
    expect(preset.text).toHaveLength(1);
    expect(preset.image).toHaveLength(0);
    expect(presetSchema.safeParse(preset).success).toBe(true);
  });
});
