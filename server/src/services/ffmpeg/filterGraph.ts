import type { Background, ClipInfo, Project, VideoClip } from "@clipforge/shared";
import { drawtextFilter, drawtextFilterCentered } from "./drawtext.js";
import { renderRect } from "./geometry.js";
import { atempoChain } from "./speed.js";

export interface GraphInput {
  kind: "video" | "image" | "audio";
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
  return c.timelineStart + (c.trimOut - c.trimIn) / c.speed;
}

function num(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Generador de fondo sólido (negro o color) que produce la etiqueta dada. */
function solidBackground(bg: Background, W: number, H: number, dur: number, fps: number, label: string): string {
  const src = bg.type === "color" ? `color=c=0x${bg.color.slice(1)}` : "color=black";
  return `${src}:s=${W}x${H}:d=${num(dur)}:r=${fps}[${label}]`;
}

/** Radio de boxblur (px) a partir de la intensidad normalizada 0–1. */
function blurRadius(bg: Background): number {
  return Math.max(1, Math.round(bg.blur * 40));
}

/** Filtros eq/hue del clip; array vacío si todo es neutro. */
function colorFilters(c: VideoClip): string[] {
  const f = c.filters;
  const sat = f.saturation * (1 - f.grayscale);
  const out: string[] = [];
  // Emitir eq si alguno de los parámetros no es neutro
  if (f.brightness !== 0 || f.contrast !== 1 || f.saturation !== 1 || f.grayscale !== 0) {
    out.push(`eq=brightness=${num(f.brightness)}:contrast=${num(f.contrast)}:saturation=${num(sat)}`);
  }
  if (f.hue !== 0) out.push(`hue=h=${num(f.hue)}`);
  return out;
}

/**
 * Construye el filter_complex completo del proyecto: segmentos de clip sobre
 * fondo negro + huecos en negro/silencio, concat, overlays de imagen y textos.
 * Aplica velocidad (setpts/atempo) y filtros de color (eq/hue) por clip.
 */
export function buildFilterGraph(
  project: Project,
  clipInfos: Map<string, ClipInfo>,
): FilterGraph {
  const { width: W, height: H, fps, background: bg } = project.settings;
  const clips = [...project.tracks.video].sort((a, b) => a.timelineStart - b.timelineStart);
  if (clips.length === 0) throw new Error("El proyecto no tiene clips de vídeo");

  const inputs: GraphInput[] = [];
  const filters: string[] = [];
  const segLabels: string[] = [];
  let segIdx = 0;
  let cursor = 0;

  const pushGap = (duration: number) => {
    // En los huecos no hay vídeo: el fondo blur cae a negro/color
    filters.push(solidBackground(bg, W, H, duration, fps, `seg${segIdx}`));
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
    const dur = (clip.trimOut - clip.trimIn) / clip.speed;
    const setpts =
      clip.speed === 1 ? "setpts=PTS-STARTPTS" : `setpts=(PTS-STARTPTS)/${num(clip.speed)}`;
    const trimSetpts = `trim=start=${num(clip.trimIn)}:end=${num(clip.trimOut)},${setpts}`;
    const fgScale = [`scale=${rect.w}:${rect.h}`, ...colorFilters(clip)].join(",");

    if (bg.type === "blur") {
      // un solo decode dividido: rama nítida (contain) + rama de fondo
      // (cover + desenfoque) del propio clip
      filters.push(`[${inputIdx}:v]${trimSetpts},split=2[fg${segIdx}][bgsrc${segIdx}]`);
      filters.push(
        `[bgsrc${segIdx}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=${blurRadius(bg)}:1[bg${segIdx}]`,
      );
      filters.push(`[fg${segIdx}]${fgScale}[cv${segIdx}]`);
    } else {
      filters.push(`[${inputIdx}:v]${trimSetpts},${fgScale}[cv${segIdx}]`);
      filters.push(solidBackground(bg, W, H, dur, fps, `bg${segIdx}`));
    }
    filters.push(`[bg${segIdx}][cv${segIdx}]overlay=x=${rect.left}:y=${rect.top}:shortest=1[seg${segIdx}]`);
    const audioChain = [
      `atrim=start=${num(clip.trimIn)}:end=${num(clip.trimOut)}`,
      "asetpts=PTS-STARTPTS",
      ...atempoChain(clip.speed),
      `volume=${num(project.originalAudioVolume)}`,
      "aresample=44100",
      "aformat=channel_layouts=stereo",
    ];
    filters.push(`[${inputIdx}:a]${audioChain.join(",")}[sega${segIdx}]`);
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

  // Textos (drawtext directo si rotation=0; capa transparente rotada si no)
  project.tracks.text.forEach((t, k) => {
    if (t.rotation === 0) {
      filters.push(`${videoLabel}${drawtextFilter(t, W, H)}[txt${k}]`);
    } else {
      // capa transparente del lienzo con el texto centrado, rotada y superpuesta:
      // rotate conserva el centro, así que el ancla (x,y) coincide con la preview
      const r = `${num(t.rotation)}*PI/180`;
      filters.push(
        `color=c=0x00000000:s=${W}x${H}:r=${fps}:d=${num(totalDuration)},format=rgba,${drawtextFilterCentered(t, W, H)}[tl${k}]`,
      );
      filters.push(`[tl${k}]rotate=${r}:c=none:ow=rotw(${r}):oh=roth(${r})[tr${k}]`);
      filters.push(
        `${videoLabel}[tr${k}]overlay=x=${Math.round(t.x * W)}-overlay_w/2:y=${Math.round(t.y * H)}-overlay_h/2:enable='between(t,${num(t.start)},${num(t.end)})'[txt${k}]`,
      );
    }
    videoLabel = `[txt${k}]`;
  });

  // Música de fondo: cada pista se recorta, retrasa y mezcla sobre [acat]
  let audioLabel = "[acat]";
  if (project.tracks.audio.length > 0) {
    const musLabels: string[] = [];
    project.tracks.audio.forEach((a, m) => {
      const inputIdx = inputs.length;
      inputs.push({ kind: "audio", fileName: a.fileName });
      const playDur = a.end - a.start;
      const chain = [
        `atrim=start=${num(a.trimIn)}:end=${num(a.trimIn + playDur)}`,
        "asetpts=PTS-STARTPTS",
        `volume=${num(a.volume)}`,
        "aresample=44100",
        "aformat=channel_layouts=stereo",
        `adelay=${Math.round(a.start * 1000)}:all=1`,
      ];
      filters.push(`[${inputIdx}:a]${chain.join(",")}[mus${m}]`);
      musLabels.push(`[mus${m}]`);
    });
    filters.push(
      `[acat]${musLabels.join("")}amix=inputs=${musLabels.length + 1}:duration=first:normalize=0[amix]`,
    );
    audioLabel = "[amix]";
  }

  return {
    inputs,
    filterComplex: filters.join(";"),
    videoLabel,
    audioLabel,
    totalDuration,
  };
}
