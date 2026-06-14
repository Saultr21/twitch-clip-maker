import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import type { Project } from "@clipforge/shared";
import { ASSETS_DIR, CLIPS_DIR, EXPORTS_DIR } from "../lib/paths.js";
import { ffmpegBin } from "./binaries.js";
import { listClips } from "./clipsRegistry.js";
import { buildAss } from "./subtitles/assSubtitles.js";
import { buildFilterGraph } from "./ffmpeg/filterGraph.js";

/** Prepara el grafo del proyecto (con subtítulos si los hay) y devuelve inputs,
 *  filterComplex, videoLabel y un limpiador del .ass temporal. */
function prepareGraph(project: Project) {
  const clipInfos = new Map(listClips().map((c) => [c.id, c]));
  let assPath: string | undefined;
  if (project.subtitles.cues.length > 0) {
    assPath = path.join(EXPORTS_DIR, `${crypto.randomUUID()}.ass`);
    fs.writeFileSync(
      assPath,
      buildAss(project.subtitles.cues, project.subtitles.style, project.settings.width, project.settings.height),
    );
  }
  const graph = buildFilterGraph(project, clipInfos, assPath);
  const inputArgs: string[] = [];
  for (const input of graph.inputs) {
    const dir = input.kind === "video" ? CLIPS_DIR : ASSETS_DIR;
    if (input.loop) inputArgs.push("-loop", "1");
    inputArgs.push("-i", path.join(dir, input.fileName).replaceAll("\\", "/"));
  }
  return { graph, inputArgs, cleanup: () => assPath && fs.rmSync(assPath, { force: true }) };
}

/** Exporta un único fotograma del montaje en `time` (segundos) como PNG. */
export async function exportStillFrame(project: Project, time: number, outName: string): Promise<void> {
  const { graph, inputArgs, cleanup } = prepareGraph(project);
  const out = path.join(EXPORTS_DIR, outName);
  // el grafo genera vídeo y audio (concat a=1); aquí solo queremos vídeo, así
  // que el audio se descarta con anullsink para que no quede una salida suelta
  const fc = `${graph.filterComplex};${graph.audioLabel}anullsink`;
  try {
    const r = await execa(ffmpegBin, [
      "-y", ...inputArgs,
      "-filter_complex", fc,
      "-map", graph.videoLabel,
      "-ss", String(Math.max(0, time)),
      "-frames:v", "1", "-update", "1",
      out,
    ], { reject: false });
    if (r.exitCode !== 0) throw new Error((r.stderr ?? "").split("\n").slice(-4).join(" | "));
  } finally {
    cleanup();
  }
}

/** Exporta el montaje como GIF optimizado (paleta), sin audio. */
export async function exportGif(project: Project, outName: string, fps = 12, width = 480): Promise<void> {
  const { graph, inputArgs, cleanup } = prepareGraph(project);
  const out = path.join(EXPORTS_DIR, outName);
  const gifChain =
    `${graph.videoLabel}fps=${fps},scale=${width}:-1:flags=lanczos,split[gs0][gs1];` +
    `[gs0]palettegen=stats_mode=diff[gp];[gs1][gp]paletteuse=dither=bayer[gif]`;
  // descarta el audio del grafo (el GIF no lleva sonido)
  const fc = `${graph.filterComplex};${gifChain};${graph.audioLabel}anullsink`;
  try {
    const r = await execa(ffmpegBin, [
      "-y", ...inputArgs,
      "-filter_complex", fc,
      "-map", "[gif]",
      out,
    ], { reject: false });
    if (r.exitCode !== 0) throw new Error((r.stderr ?? "").split("\n").slice(-4).join(" | "));
  } finally {
    cleanup();
  }
}
