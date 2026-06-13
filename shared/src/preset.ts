import { z } from "zod";
import type { Project } from "./project.js";
import { imageOverlaySchema, projectSettingsSchema, textOverlaySchema } from "./project.js";

export const presetSchema = z.object({
  name: z.string().min(1).max(80),
  settings: projectSettingsSchema,
  text: z.array(textOverlaySchema),
  image: z.array(imageOverlaySchema),
});

export type Preset = z.infer<typeof presetSchema>;

/** Plantilla a partir del proyecto actual: formato + textos + imágenes. */
export function projectToPreset(name: string, project: Project): Preset {
  return {
    name,
    settings: { ...project.settings },
    text: project.tracks.text.map((t) => ({ ...t })),
    image: project.tracks.image.map((i) => ({ ...i })),
  };
}
