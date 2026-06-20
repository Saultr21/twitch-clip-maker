import type { Background, ClipInfo, ImageLayer, Project, TextLayer, VideoClip, VideoLayer } from "@clipforge/shared";
import { allVideoClips, imageItems, textItems, videoLayers } from "@clipforge/shared";
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
 * Construye el filter_complex completo del proyecto siguiendo el orden de
 * `tracks.layers` (índice 0 = atrás, último = frente).
 *
 * Modelo:
 * 1. Fondo `[bg]` de duración total (negro/color/imagen/blur).
 * 2. Por cada capa en `tracks.layers`, componer sus elementos encima del
 *    acumulador en orden temporal:
 *    - video: overlay temporizado con `enable=between(t,start,end)` y
 *      `setpts=(PTS-STARTPTS)/speed+START/TB`. clipTransition se aplica
 *      solo a los clips de la primera capa de vídeo.
 *    - image: overlay con enable=between (mismo que antes).
 *    - text: drawtext o capa rotada (mismo que antes).
 * 3. Audio: todos los clips de vídeo (cualquier capa) con adelay + amix +
 *    música (ducking solo sobre música).
 * 4. Subtítulos ASS al final.
 * 5. fadeIn/fadeOut globales al final.
 */
export function buildFilterGraph(
  project: Project,
  clipInfos: Map<string, ClipInfo>,
  assPath?: string,
): FilterGraph {
  const { width: W, height: H, fps, background: bg } = project.settings;

  // Validar que hay al menos un clip de vídeo
  const allClips = allVideoClips(project);
  if (allClips.length === 0) throw new Error("El proyecto no tiene clips de vídeo");

  // ── 1. Duración total ────────────────────────────────────────────────────
  // máximo end de: todos los clips de vídeo + imágenes + textos
  const clipEnds = allClips.map(clipEnd);
  const imgEnds = imageItems(project).map((i) => i.end);
  const txtEnds = textItems(project).map((t) => t.end);
  const totalDuration = Math.max(...clipEnds, ...imgEnds, ...txtEnds, 0);

  const inputs: GraphInput[] = [];
  const filters: string[] = [];

  // ── 2. Fondo base [bg] de duración total ────────────────────────────────
  // blur: se deriva del primer clip de la primera capa de vídeo. Si el fondo
  // es blur usamos el decode del primer clip para la rama de fondo;
  // la rama de fondo se extiende a totalDuration con un trim+loop implícito.
  // Para simplificar: blur por segmento de clip de la primera capa + negro
  // en huecos (documentado en el test de blur). Si no es blur, el fondo es
  // un único color/imagen para toda la duración.
  //
  // image background: una sola decodificación en bucle, recortada a totalDuration.
  const bgImage = bg.type === "image" && bg.fileName ? bg.fileName : null;
  let bgImageInputIdx = -1;

  if (bgImage) {
    bgImageInputIdx = inputs.length;
    inputs.push({ kind: "image", fileName: bgImage, loop: true });
    // Un único fondo de imagen para toda la duración
    filters.push(
      `[${bgImageInputIdx}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps},trim=duration=${num(totalDuration)},setpts=PTS-STARTPTS,format=yuv420p[bg]`,
    );
  } else if (bg.type === "blur") {
    // El fondo blur se construye más adelante junto con el primer clip de vídeo
    // de la primera capa de vídeo (ver sección de capas). [bg] se establece allí.
    // Aquí reservamos espacio pero no emitimos nada todavía.
  } else {
    // negro o color sólido para toda la duración
    filters.push(solidBackground(bg, W, H, totalDuration, fps, "bg"));
  }

  // ── 3. Compositar capas en orden ─────────────────────────────────────────
  let videoLabel = "[bg]";
  const allAudioLabels: string[] = []; // audio de todos los clips de vídeo

  // Necesitamos saber cuál es la primera capa de vídeo para:
  // (a) blur de fondo, (b) clipTransition
  const firstVideoLayerIdx = project.tracks.layers.findIndex((l) => l.kind === "video");
  let blurBgBuilt = false; // ¿ya construimos [bg] para blur?

  const transition = project.settings.clipTransition ?? 0;

  project.tracks.layers.forEach((layer, layerIdx) => {
    if (layer.kind === "video") {
      const vLayer = layer as VideoLayer;
      const isFirstVideoLayer = layerIdx === firstVideoLayerIdx;
      const layerClips = [...vLayer.clips].sort((a, b) => a.timelineStart - b.timelineStart);

      layerClips.forEach((clip, ci) => {
        const cinfo = clipInfos.get(clip.clipId);
        if (!cinfo) throw new Error(`Falta la información del clip ${clip.clipId}`);

        const inputIdx = inputs.length;
        inputs.push({ kind: "video", fileName: cinfo.fileName });

        const rect = renderRect(W, H, cinfo.width, cinfo.height, clip.zoom, clip.crop);
        const start = clip.timelineStart;
        const end = clipEnd(clip);
        const dur = end - start;

        const cropStep = clip.crop
          ? `crop=iw*${clip.crop.w}:ih*${clip.crop.h}:iw*${clip.crop.x}:ih*${clip.crop.y}`
          : null;

        // Label único por capa y clip: vl{layerIdx}_{ci}
        const clipLabel = `vl${layerIdx}_${ci}`;

        if (bg.type === "blur" && isFirstVideoLayer && !blurBgBuilt) {
          // Primer clip de la primera capa de vídeo cuando el fondo es blur:
          // generamos el fondo blur para el segmento de este clip, y usamos
          // negro para los huecos anteriores y posteriores.
          // Para toda la duración: emitimos el blur como fondo y un negro/color
          // para el resto de la línea temporal via concat de segmentos.
          // Simplificación documentada: el blur solo cubre el primer clip activo;
          // el fondo fuera del clip del primer segmento cae a negro.
          // Un split 2: rama de fondo (cover+blur) y rama visible.
          const trimBase = `trim=start=${num(clip.trimIn)}:end=${num(clip.trimOut)}`;
          const cropBase = cropStep ? `,${cropStep}` : "";
          filters.push(
            `[${inputIdx}:v]${trimBase}${cropBase},split=2[fg${clipLabel}][bgsrc${clipLabel}]`,
          );
          // Rama de fondo: scale cover + blur, extendida a totalDuration con un pad de negro
          // Para evitar complejidad: el blur se aplica al clip y se usa como fondo solo
          // durante ese clip (enable=between). Fuera del clip, el acumulador [bg] pasa negro.
          // Emitimos un fondo negro de totalDuration y luego hacemos overlay del blur con enable.
          filters.push(solidBackground({ type: "black", color: "#000000", blur: 0 }, W, H, totalDuration, fps, "bgnoir"));
          filters.push(
            `[bgsrc${clipLabel}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setpts=(PTS-STARTPTS)/${num(clip.speed)}+${num(start)}/TB,boxblur=${blurRadius(bg)}:1[blurbg${clipLabel}]`,
          );
          filters.push(
            `[bgnoir][blurbg${clipLabel}]overlay=x=0:y=0:enable='between(t,${num(start)},${num(end)})':eof_action=pass[bg]`,
          );
          blurBgBuilt = true;

          // Rama visible del clip
          const fgScale = [`scale=${rect.w}:${rect.h}`, ...colorFilters(clip)].join(",");
          filters.push(`[fg${clipLabel}]setpts=(PTS-STARTPTS)/${num(clip.speed)}+${num(start)}/TB,${fgScale}[cv${clipLabel}]`);
        } else {
          // Rama visible (trim + crop + setpts + scale + colorFilters)
          const trimChain = [
            `trim=start=${num(clip.trimIn)}:end=${num(clip.trimOut)}`,
            ...(cropStep ? [cropStep] : []),
            `setpts=(PTS-STARTPTS)/${num(clip.speed)}+${num(start)}/TB`,
            `scale=${rect.w}:${rect.h}`,
            ...colorFilters(clip),
          ].join(",");
          filters.push(`[${inputIdx}:v]${trimChain}[cv${clipLabel}]`);
        }

        // Opacidad: si < 1 añadir format=rgba + colorchannelmixer
        const srcForOverlay = `[cv${clipLabel}]`;
        let overlaySource = srcForOverlay;
        if (clip.opacity < 1) {
          filters.push(`${srcForOverlay}format=rgba,colorchannelmixer=aa=${num(clip.opacity)}[cva${clipLabel}]`);
          overlaySource = `[cva${clipLabel}]`;
        }

        // clipTransition solo en la primera capa de vídeo
        let finalVideoSrc = overlaySource;
        if (transition > 0 && isFirstVideoLayer && layerClips.length > 1) {
          const td = Math.min(transition, dur / 2);
          const vf: string[] = [];
          if (ci > 0) vf.push(`fade=t=in:st=${num(start)}:d=${num(td)}`);
          if (ci < layerClips.length - 1) vf.push(`fade=t=out:st=${num(end - td)}:d=${num(td)}`);
          if (vf.length) {
            const transLabel = `[cvt${clipLabel}]`;
            filters.push(`${overlaySource}${vf.join(",")}${transLabel}`);
            finalVideoSrc = transLabel;
          }
        }

        // Overlay sobre el acumulador con enable temporizado
        const nextLabel = `[vl_acc${layerIdx}_${ci}]`;
        filters.push(
          `${videoLabel}${finalVideoSrc}overlay=x=${rect.left}:y=${rect.top}:enable='between(t,${num(start)},${num(end)})':eof_action=pass${nextLabel}`,
        );
        videoLabel = nextLabel;

        // Audio de este clip: atrim + asetpts + atempo + volume + aresample + aformat + adelay
        const aLabel = `[va${layerIdx}_${ci}]`;
        const achain = [
          `atrim=start=${num(clip.trimIn)}:end=${num(clip.trimOut)}`,
          "asetpts=PTS-STARTPTS",
          ...atempoChain(clip.speed),
          `volume=${num(project.originalAudioVolume)}`,
          "aresample=44100",
          "aformat=channel_layouts=stereo",
          `adelay=${Math.round(start * 1000)}:all=1`,
        ];
        filters.push(`[${inputIdx}:a]${achain.join(",")}${aLabel}`);
        allAudioLabels.push(aLabel);
      });
    } else if (layer.kind === "image") {
      const imgLayer = layer as ImageLayer;
      imgLayer.items.forEach((img, j) => {
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
        // Label único por capa e item: img{layerIdx}_{j}
        const imgLabel = `img${layerIdx}_${j}`;
        filters.push(`[${inputIdx}:v]${pre.join(",")}[${imgLabel}]`);
        const nextLabel = `[img_acc${layerIdx}_${j}]`;
        filters.push(
          `${videoLabel}[${imgLabel}]overlay=x=${Math.round(img.x * W)}-overlay_w/2:y=${Math.round(img.y * H)}-overlay_h/2:eof_action=repeat:enable='between(t,${num(img.start)},${num(img.end)})'${nextLabel}`,
        );
        videoLabel = nextLabel;
      });
    } else if (layer.kind === "text") {
      const txtLayer = layer as TextLayer;
      txtLayer.items.forEach((t, k) => {
        // Label único por capa e item: txt{layerIdx}_{k}
        const txtLabel = `txt${layerIdx}_${k}`;
        if (t.rotation === 0) {
          filters.push(`${videoLabel}${drawtextFilter(t, W, H)}[${txtLabel}]`);
        } else {
          const r = `${num(t.rotation)}*PI/180`;
          const tl = `tl${layerIdx}_${k}`;
          const tr = `tr${layerIdx}_${k}`;
          filters.push(
            `color=c=0x00000000:s=${W}x${H}:r=${fps}:d=${num(totalDuration)},format=rgba,${drawtextFilterCentered(t, W, H)}[${tl}]`,
          );
          filters.push(`[${tl}]rotate=${r}:c=none:ow=rotw(${r}):oh=roth(${r})[${tr}]`);
          filters.push(
            `${videoLabel}[${tr}]overlay=x=${Math.round(t.x * W)}-overlay_w/2:y=${Math.round(t.y * H)}-overlay_h/2:enable='between(t,${num(t.start)},${num(t.end)})'[${txtLabel}]`,
          );
        }
        videoLabel = `[${txtLabel}]`;
      });
    }
  });

  // Si el fondo blur nunca se construyó (sin capa de vídeo, imposible ya que
  // validamos clips.length > 0 arriba, pero para seguridad):
  if (bg.type === "blur" && !blurBgBuilt) {
    filters.push(solidBackground({ type: "black", color: "#000000", blur: 0 }, W, H, totalDuration, fps, "bg"));
  }

  // Subtítulos ASS quemados con libass
  if (project.subtitles.cues.length > 0 && assPath) {
    const escaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    filters.push(`${videoLabel}ass='${escaped}'[subs]`);
    videoLabel = "[subs]";
  }

  // ── 4. Audio ─────────────────────────────────────────────────────────────
  // Voz = todos los clips de vídeo (con adelay a su timelineStart) mezclados.
  // Música encima con ducking opcional.
  let audioLabel: string;
  let voiceLabel: string;

  if (allAudioLabels.length === 0) {
    // Sin clips de vídeo (imposible por la validación de arriba, pero por si acaso)
    filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${num(totalDuration)}[silence]`);
    audioLabel = "[silence]";
    voiceLabel = "[silence]";
  } else if (allAudioLabels.length === 1) {
    // Un solo clip: no hace falta amix
    voiceLabel = allAudioLabels[0];
    audioLabel = allAudioLabels[0];
  } else {
    // Mezclar todos los audios de clips con amix
    filters.push(
      `${allAudioLabels.join("")}amix=inputs=${allAudioLabels.length}:duration=longest:normalize=0[voicemix]`,
    );
    voiceLabel = "[voicemix]";
    audioLabel = "[voicemix]";
  }

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
      filters.push(`${voiceLabel}asplit=2[avoice][ascv]`);
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
        `${voiceLabel}${musLabels.join("")}amix=inputs=${musLabels.length + 1}:duration=first:normalize=0[amix]`,
      );
    }
    audioLabel = "[amix]";
  }

  // ── 5. Fundido de entrada/salida ─────────────────────────────────────────
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
