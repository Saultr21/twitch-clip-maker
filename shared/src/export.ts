import { z } from "zod";
import { projectSchema } from "./project.js";

export const QUALITY_PRESET_IDS = ["tiktok", "youtube", "custom"] as const;

export const qualityPresetIdSchema = z.enum(QUALITY_PRESET_IDS);

export const exportRequestSchema = z.object({
  project: projectSchema,
  preset: qualityPresetIdSchema,
  fileName: z.string().min(1).max(80).optional(),
  outputPath: z.string().optional(),
});

export type QualityPresetId = z.infer<typeof qualityPresetIdSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;

export type ExportJobState = "running" | "done" | "error" | "cancelled";

export interface ExportJobStatus {
  jobId: string;
  state: ExportJobState;
  percent: number;
  fileName?: string;
  error?: string;
}

/** Evento SSE del progreso de exportación. */
export type ExportEvent =
  | { type: "progress"; percent: number }
  | { type: "done"; fileName: string; filePath: string }
  | { type: "error"; message: string };
