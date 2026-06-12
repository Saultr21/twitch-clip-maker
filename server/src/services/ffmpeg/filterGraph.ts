import type { ClipInfo, Project, VideoClip } from "@clipforge/shared";
import { drawtextFilter } from "./drawtext.js";
import { renderRect } from "./geometry.js";

export interface GraphInput {
  kind: "video" | "image";
  fileName: string;
}

export interface FilterGraph {
  inputs: GraphInput[];
  filterComplex: string;
  videoLabel: string;
  audioLabel: string;
  totalDuration: number;
}

function clipEnd(c: VideoClip): number {
  return c.timelineStart + (c.trimOut - c.trimIn);
}

function num(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/**
 * Construye el filter_complex completo del proyecto: segmentos de clip sobre
 * fondo negro + huecos en negro/silencio, concat, overlays de imagen y textos.
 * La velocidad y los filtros de color del modelo se ignoran (Hito 4).
 */
export function buildFilterGraph(
  project: Project,
  clipInfos: Map<string, ClipInfo>,
): FilterGraph {
  const { width: W, height: H, fps } = project.settings;
  const clips = [...project.tracks.video].sort((a, b) => a.timelineStart - b.timelineStart);
  if (clips.length === 0) throw new Error("El proyecto no tiene clips de vídeo");

  const inputs: GraphInput[] = [];
  const filters: string[] = [];
  const segLabels: string[] = [];
  let segIdx = 0;
  let cursor = 0;

  const pushGap = (duration: number) => {
    filters.push(`color=black:s=${W}x${H}:d=${num(duration)}:r=${fps}[seg${segIdx}]`);
    filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${num(duration)}[sega${segIdx}]`);
    segLabels.push(`[seg${segIdx}][sega${segIdx}]`);
    segIdx++;
  };

  for (const clip of clips) {
    const info = clipInfos.get(clip.clipId);
    if (!info) throw new Error(`Falta la información del clip ${clip.clipId}`);
    if (clip.timelineStart > cursor + 0.001) pushGap(clip.timelineStart - cursor);

    const inputIdx = inputs.length;
    inputs.push({ kind: "video", fileName: info.fileName });
    const rect = renderRect(W, H, info.width, info.height, clip.zoom);
    const dur = clip.trimOut - clip.trimIn;

    filters.push(
      `[${inputIdx}:v]trim=start=${num(clip.trimIn)}:end=${num(clip.trimOut)},setpts=PTS-STARTPTS,scale=${rect.w}:${rect.h}[cv${segIdx}]`,
    );
    filters.push(`color=black:s=${W}x${H}:d=${num(dur)}:r=${fps}[bg${segIdx}]`);
    filters.push(`[bg${segIdx}][cv${segIdx}]overlay=x=${rect.left}:y=${rect.top}:shortest=1[seg${segIdx}]`);
    filters.push(
      // aresample+aformat: concat exige el mismo sample rate y layout en todos
      // los segmentos (los clips de Twitch pueden venir a 48kHz)
      `[${inputIdx}:a]atrim=start=${num(clip.trimIn)}:end=${num(clip.trimOut)},asetpts=PTS-STARTPTS,volume=${num(project.originalAudioVolume)},aresample=44100,aformat=channel_layouts=stereo[sega${segIdx}]`,
    );
    segLabels.push(`[seg${segIdx}][sega${segIdx}]`);
    segIdx++;
    cursor = clipEnd(clip);
  }

  // Cola final: si un texto/imagen termina después del último clip, la preview
  // muestra negro con el overlay — el export añade el mismo tramo en negro
  const overlayEnds = [
    ...project.tracks.text.map((t) => t.end),
    ...project.tracks.image.map((i) => i.end),
  ];
  const totalDuration = Math.max(cursor, ...(overlayEnds.length ? overlayEnds : [0]));
  if (totalDuration > cursor + 0.001) pushGap(totalDuration - cursor);

  filters.push(`${segLabels.join("")}concat=n=${segLabels.length}:v=1:a=1[vcat][acat]`);
  let videoLabel = "[vcat]";

  // Overlays de imagen (inputs extra, en orden)
  project.tracks.image.forEach((img, j) => {
    const inputIdx = inputs.length;
    inputs.push({ kind: "image", fileName: img.fileName });
    const w = Math.round(img.width * W);
    const h = Math.round(img.height * H);
    const pre = [`scale=${w}:${h}`, "format=rgba", `colorchannelmixer=aa=${num(img.opacity)}`];
    if (img.rotation !== 0) {
      const r = `${num(img.rotation)}*PI/180`;
      pre.push(`rotate=${r}:c=none:ow=rotw(${r}):oh=roth(${r})`);
    }
    filters.push(`[${inputIdx}:v]${pre.join(",")}[img${j}]`);
    filters.push(
      `${videoLabel}[img${j}]overlay=x=${Math.round(img.x * W)}-overlay_w/2:y=${Math.round(img.y * H)}-overlay_h/2:eof_action=repeat:enable='between(t,${num(img.start)},${num(img.end)})'[ov${j}]`,
    );
    videoLabel = `[ov${j}]`;
  });

  // Textos (drawtext encadenados)
  project.tracks.text.forEach((t, k) => {
    filters.push(`${videoLabel}${drawtextFilter(t, W, H)}[txt${k}]`);
    videoLabel = `[txt${k}]`;
  });

  return {
    inputs,
    filterComplex: filters.join(";"),
    videoLabel,
    audioLabel: "[acat]",
    totalDuration,
  };
}
