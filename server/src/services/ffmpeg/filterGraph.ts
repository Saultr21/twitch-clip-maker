import type { Background, ClipInfo, Project, VideoClip } from "@clipforge/shared";
import { drawtextFilter, drawtextFilterCentered } from "./drawtext.js";
import { renderRect } from "./geometry.js";
import { atempoChain } from "./speed.js";

export interface GraphInput {
  kind: "video" | "image" | "audio";
  fileName: string;
  loop?: boolean; // imagen de fondo decodificada en bucle
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
  assPath?: string,
): FilterGraph {
  const { width: W, height: H, fps, background: bg } = project.settings;
  const clips = [...project.tracks.video].sort((a, b) => a.timelineStart - b.timelineStart);
  if (clips.length === 0) throw new Error("El proyecto no tiene clips de vídeo");

  const inputs: GraphInput[] = [];
  const filters: string[] = [];
  const segLabels: string[] = [];
  let segIdx = 0;
  let cursor = 0;

  // Fondo de imagen: una sola decodificación en bucle, dividida luego en una
  // copia (escalada a cover) por cada segmento que la necesita
  const bgImage = bg.type === "image" && bg.fileName ? bg.fileName : null;
  let bgImageInputIdx = -1;
  const bgImageBranches: { label: string; dur: number }[] = [];
  if (bgImage) {
    bgImageInputIdx = inputs.length;
    inputs.push({ kind: "image", fileName: bgImage, loop: true });
  }

  const pushGap = (duration: number) => {
    if (bgImage) {
      // el hueco ES el fondo de imagen (escalado a cover, esa duración)
      bgImageBranches.push({ label: `seg${segIdx}`, dur: duration });
    } else {
      // sin vídeo el fondo blur cae a negro/color
      filters.push(solidBackground(bg, W, H, duration, fps, `seg${segIdx}`));
    }
    filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${num(duration)}[sega${segIdx}]`);
    segLabels.push(`[seg${segIdx}][sega${segIdx}]`);
    segIdx++;
  };

  const transition = project.settings.clipTransition ?? 0;
  clips.forEach((clip, ci) => {
    const info = clipInfos.get(clip.clipId);
    if (!info) throw new Error(`Falta la información del clip ${clip.clipId}`);
    if (clip.timelineStart > cursor + 0.001) pushGap(clip.timelineStart - cursor);

    const inputIdx = inputs.length;
    inputs.push({ kind: "video", fileName: info.fileName });
    // Escala basada en el frame completo; el recorte solo reduce el tamaño
    // visible y desplaza el origen (igual que la preview). El paso `crop` recorta
    // el source y `scale=rect.w:rect.h` lo deja al tamaño visible exacto
    const rect = renderRect(W, H, info.width, info.height, clip.zoom, clip.crop);
    const dur = (clip.trimOut - clip.trimIn) / clip.speed;
    const cropStep = clip.crop
      ? `crop=iw*${clip.crop.w}:ih*${clip.crop.h}:iw*${clip.crop.x}:ih*${clip.crop.y}`
      : null;
    const trimSetpts = [
      `trim=start=${num(clip.trimIn)}:end=${num(clip.trimOut)}`,
      ...(cropStep ? [cropStep] : []),
      clip.speed === 1 ? "setpts=PTS-STARTPTS" : `setpts=(PTS-STARTPTS)/${num(clip.speed)}`,
    ].join(",");
    const fgScale = [`scale=${rect.w}:${rect.h}`, ...colorFilters(clip)].join(",");

    if (bg.type === "blur") {
      // un solo decode dividido: rama nítida (contain) + rama de fondo
      // (cover + desenfoque) del propio clip
      filters.push(`[${inputIdx}:v]${trimSetpts},split=2[fg${segIdx}][bgsrc${segIdx}]`);
      filters.push(
        `[bgsrc${segIdx}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=${blurRadius(bg)}:1[bg${segIdx}]`,
      );
      filters.push(`[fg${segIdx}]${fgScale}[cv${segIdx}]`);
    } else if (bgImage) {
      filters.push(`[${inputIdx}:v]${trimSetpts},${fgScale}[cv${segIdx}]`);
      bgImageBranches.push({ label: `bg${segIdx}`, dur }); // el fondo viene del split de la imagen
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

    // transición a negro entre clips: fade-out al final (si hay clip siguiente)
    // y fade-in al inicio (si hay clip anterior). td se limita a medio clip.
    let vLabel = `[seg${segIdx}]`;
    let aLabel = `[sega${segIdx}]`;
    if (transition > 0 && clips.length > 1) {
      const td = Math.min(transition, dur / 2);
      const vf: string[] = [];
      const af: string[] = [];
      if (ci > 0) {
        vf.push(`fade=t=in:st=0:d=${num(td)}`);
        af.push(`afade=t=in:st=0:d=${num(td)}`);
      }
      if (ci < clips.length - 1) {
        vf.push(`fade=t=out:st=${num(dur - td)}:d=${num(td)}`);
        af.push(`afade=t=out:st=${num(dur - td)}:d=${num(td)}`);
      }
      if (vf.length) {
        filters.push(`[seg${segIdx}]${vf.join(",")}[segt${segIdx}]`);
        vLabel = `[segt${segIdx}]`;
      }
      if (af.length) {
        filters.push(`[sega${segIdx}]${af.join(",")}[segat${segIdx}]`);
        aLabel = `[segat${segIdx}]`;
      }
    }
    segLabels.push(`${vLabel}${aLabel}`);
    segIdx++;
    cursor = clipEnd(clip);
  });

  // Cola final: si un texto/imagen termina después del último clip, la preview
  // muestra negro con el overlay — el export añade el mismo tramo en negro
  const overlayEnds = [
    ...project.tracks.text.map((t) => t.end),
    ...project.tracks.image.map((i) => i.end),
  ];
  const totalDuration = Math.max(cursor, ...(overlayEnds.length ? overlayEnds : [0]));
  if (totalDuration > cursor + 0.001) pushGap(totalDuration - cursor);

  // Fondo de imagen: una decodificación en bucle dividida en una copia por
  // segmento, cada una escalada a cover y recortada a su duración
  if (bgImage && bgImageBranches.length > 0) {
    const outs = bgImageBranches.map((_, i) => `[ibsrc${i}]`).join("");
    filters.push(`[${bgImageInputIdx}:v]split=${bgImageBranches.length}${outs}`);
    bgImageBranches.forEach((b, i) => {
      filters.push(
        `[ibsrc${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps},trim=duration=${num(b.dur)},setpts=PTS-STARTPTS,format=yuv420p[${b.label}]`,
      );
    });
  }

  filters.push(`${segLabels.join("")}concat=n=${segLabels.length}:v=1:a=1[vcat][acat]`);
  let videoLabel = "[vcat]";

  // Overlays de imagen (inputs extra, en orden)
  project.tracks.image.forEach((img, j) => {
    const inputIdx = inputs.length;
    inputs.push({ kind: "image", fileName: img.fileName });
    const w = Math.round(img.width * W);
    const h = Math.round(img.height * H);
    const cropFilter = img.crop
      ? `crop=iw*${img.crop.w}:ih*${img.crop.h}:iw*${img.crop.x}:ih*${img.crop.y}`
      : null;
    const pre = [...(cropFilter ? [cropFilter] : []), `scale=${w}:${h}`, "format=rgba", `colorchannelmixer=aa=${num(img.opacity)}`];
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

  // Subtítulos ASS quemados con libass. Ruta escapada como las fuentes drawtext.
  if (project.subtitles.cues.length > 0 && assPath) {
    const escaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    filters.push(`${videoLabel}ass='${escaped}'[subs]`);
    videoLabel = "[subs]";
  }

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
    if (project.settings.audioDucking) {
      // ducking: la voz (acat) baja la música vía cadena lateral (sidechain),
      // luego se vuelve a mezclar con la voz a volumen completo
      filters.push("[acat]asplit=2[avoice][ascv]");
      filters.push("[ascv]aresample=44100,aformat=channel_layouts=stereo[asc]");
      let musmix = musLabels[0];
      if (musLabels.length > 1) {
        filters.push(`${musLabels.join("")}amix=inputs=${musLabels.length}:duration=longest:normalize=0[musmix]`);
        musmix = "[musmix]";
      }
      filters.push(`${musmix}[asc]sidechaincompress=threshold=0.02:ratio=8:attack=5:release=250[ducked]`);
      filters.push("[avoice][ducked]amix=inputs=2:duration=first:normalize=0[amix]");
    } else {
      filters.push(
        `[acat]${musLabels.join("")}amix=inputs=${musLabels.length + 1}:duration=first:normalize=0[amix]`,
      );
    }
    audioLabel = "[amix]";
  }

  // Fundido de entrada/salida (último paso, sobre el vídeo y el audio finales)
  const fadeIn = project.settings.fadeIn ?? 0;
  const fadeOut = project.settings.fadeOut ?? 0;
  if (fadeIn > 0 || fadeOut > 0) {
    const outStart = Math.max(0, totalDuration - fadeOut);
    const vf: string[] = [];
    const af: string[] = [];
    if (fadeIn > 0) {
      vf.push(`fade=t=in:st=0:d=${num(fadeIn)}`);
      af.push(`afade=t=in:st=0:d=${num(fadeIn)}`);
    }
    if (fadeOut > 0) {
      vf.push(`fade=t=out:st=${num(outStart)}:d=${num(fadeOut)}`);
      af.push(`afade=t=out:st=${num(outStart)}:d=${num(fadeOut)}`);
    }
    filters.push(`${videoLabel}${vf.join(",")}[vfade]`);
    filters.push(`${audioLabel}${af.join(",")}[afade]`);
    videoLabel = "[vfade]";
    audioLabel = "[afade]";
  }

  return {
    inputs,
    filterComplex: filters.join(";"),
    videoLabel,
    audioLabel,
    totalDuration,
  };
}
