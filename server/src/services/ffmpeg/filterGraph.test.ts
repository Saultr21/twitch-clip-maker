import { describe, expect, it } from "vitest";
import type { ClipInfo, ImageLayer, ImageOverlay, Project, TextLayer, TextOverlay, VideoLayer } from "@clipforge/shared";
import {
  createEmptyProject,
  createImageLayer,
  createImageOverlay,
  createTextLayer,
  createTextOverlay,
  createVideoClip,
  videoLayers,
} from "@clipforge/shared";
import { buildFilterGraph } from "./filterGraph.js";

// Helpers para construir proyectos de prueba con el nuevo modelo de capas

function addText(p: Project, overlay: TextOverlay): void {
  let layer = p.tracks.layers.find((l): l is TextLayer => l.kind === "text");
  if (!layer) { layer = createTextLayer(); p.tracks.layers.push(layer); }
  layer.items.push(overlay);
}

function addImage(p: Project, overlay: ImageOverlay): void {
  let layer = p.tracks.layers.find((l): l is ImageLayer => l.kind === "image");
  if (!layer) { layer = createImageLayer(); p.tracks.layers.push(layer); }
  layer.items.push(overlay);
}

function addVideoLayer(p: Project, track: Omit<VideoLayer, "kind">): void {
  p.tracks.layers.push({ kind: "video", ...track });
}

const info: ClipInfo = {
  id: "clip-1",
  url: "https://clips.twitch.tv/x",
  title: "demo",
  fileName: "clip-1.mp4",
  duration: 10,
  width: 1920,
  height: 1080,
  createdAt: "2026-06-12T00:00:00.000Z",
};

function projectWithClip() {
  const p = createEmptyProject("demo");
  videoLayers(p)[0].clips.push({ ...createVideoClip("clip-1", 0, 10), trimIn: 2, trimOut: 7 });
  return p;
}

describe("buildFilterGraph — vídeo", () => {
  it("un clip: trim, setpts, escala, fondo negro y overlay temporizado", () => {
    const g = buildFilterGraph(projectWithClip(), new Map([["clip-1", info]]));
    expect(g.inputs).toEqual([{ kind: "video", fileName: "clip-1.mp4" }]);
    // fondo negro de toda la duración
    expect(g.filterComplex).toContain("color=black:s=1080x1920:d=5:r=30[bg]");
    // clip: trim + setpts desplazado al timelineStart (0) + scale
    expect(g.filterComplex).toContain("[0:v]trim=start=2:end=7,setpts=(PTS-STARTPTS)/1+0/TB,scale=1080:608[cvvl0_0]");
    // overlay con enable entre 0 y 5
    expect(g.filterComplex).toContain("[bg][cvvl0_0]overlay=x=0:y=656:enable='between(t,0,5)':eof_action=pass");
    // audio con adelay=0
    expect(g.filterComplex).toContain(
      "[0:a]atrim=start=2:end=7,asetpts=PTS-STARTPTS,volume=1,aresample=44100,aformat=channel_layouts=stereo,adelay=0:all=1[va0_0]",
    );
    expect(g.videoLabel).toBe("[vl_acc0_0]");
    expect(g.audioLabel).toBe("[va0_0]");
    expect(g.totalDuration).toBe(5); // trim de 2 a 7 son 5s de material
  });

  it("hueco inicial entre t=0 y el primer clip: fondo negro a totalDuration (no hay concat)", () => {
    const p = createEmptyProject("demo");
    videoLayers(p)[0].clips.push({ ...createVideoClip("clip-1", 3, 10), trimIn: 0, trimOut: 4 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    // fondo de duración total (7s), no un segmento de 3s
    expect(g.filterComplex).toContain("color=black:s=1080x1920:d=7:r=30[bg]");
    // clip overlayed con enable entre 3 y 7
    expect(g.filterComplex).toContain("enable='between(t,3,7)'");
    // NO hay concat en el nuevo modelo
    expect(g.filterComplex).not.toContain("concat=");
    expect(g.totalDuration).toBe(7);
  });

  it("un overlay que termina después del último clip: totalDuration = max(clipEnd, overlayEnd)", () => {
    const p = projectWithClip(); // clip en [0,5)
    addText(p, { ...createTextOverlay(4), end: 8 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    // fondo de 8s (el texto termina en 8)
    expect(g.filterComplex).toContain("color=black:s=1080x1920:d=8:r=30[bg]");
    expect(g.totalDuration).toBe(8);
  });

  it("dos clips contiguos: dos overlays temporizados, sin concat", () => {
    const p = projectWithClip(); // ocupa [0,5)
    videoLayers(p)[0].clips.push({ ...createVideoClip("clip-1", 5, 10), trimIn: 0, trimOut: 2 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.inputs).toHaveLength(2);
    // segundo clip trimmed y overlayed en [5,7)
    expect(g.filterComplex).toContain("[1:v]trim=start=0:end=2");
    expect(g.filterComplex).toContain("enable='between(t,5,7)'");
    // NO hay concat
    expect(g.filterComplex).not.toContain("concat=");
    expect(g.totalDuration).toBe(7);
  });

  it("fondo de color sólido genera un color source con el hex del proyecto", () => {
    const p = projectWithClip();
    p.settings.background = { type: "color", color: "#ff0066", blur: 0.5 };
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("color=c=0xff0066:s=1080x1920:d=5:r=30[bg]");
  });

  it("fondo blur divide el clip, desenfoca la rama de fondo a cover y hace overlay temporizado", () => {
    const p = projectWithClip();
    p.settings.background = { type: "blur", color: "#000000", blur: 0.5 };
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    // split del primer clip de la primera capa
    expect(g.filterComplex).toContain("split=2[fgvl0_0][bgsrcvl0_0]");
    // rama de fondo: scale cover + boxblur
    expect(g.filterComplex).toContain(
      "[bgsrcvl0_0]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setpts=(PTS-STARTPTS)/1+0/TB,boxblur=20:1[blurbgvl0_0]",
    );
    // overlay del blur sobre el fondo negro
    expect(g.filterComplex).toContain("[bgnoir][blurbgvl0_0]overlay=x=0:y=0:enable='between(t,0,5)':eof_action=pass[bg]");
    // rama visible del clip: setpts + scale
    expect(g.filterComplex).toContain("[fgvl0_0]setpts=(PTS-STARTPTS)/1+0/TB,scale=1080:608[cvvl0_0]");
  });

  it("fondo de imagen: input en bucle, escalado a cover para toda la duración", () => {
    const p = projectWithClip();
    p.settings.background = { type: "image", color: "#000000", blur: 0.5, fileName: "fondo.png" };
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    // la imagen de fondo es un input en bucle (primer input)
    expect(g.inputs[0]).toEqual({ kind: "image", fileName: "fondo.png", loop: true });
    // el clip ahora es el input 1
    expect(g.filterComplex).toContain("[1:v]trim=start=2:end=7");
    // la imagen se escala a cover y recorta a toda la duración
    expect(g.filterComplex).toContain(
      "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,trim=duration=5,setpts=PTS-STARTPTS,format=yuv420p[bg]",
    );
  });

  it("fondo de imagen sin fileName cae a fondo negro", () => {
    const p = projectWithClip();
    p.settings.background = { type: "image", color: "#000000", blur: 0.5 };
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("color=black:s=1080x1920:d=5:r=30[bg]");
    expect(g.filterComplex).not.toContain("split");
  });

  it("el volumen del audio original se aplica a cada clip", () => {
    const p = projectWithClip();
    p.originalAudioVolume = 0.35;
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("volume=0.35");
  });

  it("la velocidad ajusta setpts, atempo y la duración del overlay", () => {
    const p = createEmptyProject("demo");
    videoLayers(p)[0].clips.push({ ...createVideoClip("clip-1", 0, 10), trimIn: 0, trimOut: 4, speed: 2 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("setpts=(PTS-STARTPTS)/2+0/TB");
    expect(g.filterComplex).toContain("atempo=2");
    // totalDuration = 4/2 = 2s
    expect(g.totalDuration).toBe(2);
    // fondo de 2s
    expect(g.filterComplex).toContain("d=2:r=30[bg]");
  });

  it("los filtros de color generan eq y hue tras el scale", () => {
    const p = createEmptyProject("demo");
    videoLayers(p)[0].clips.push({
      ...createVideoClip("clip-1", 0, 10),
      trimOut: 4,
      filters: { brightness: 0.2, contrast: 1.3, saturation: 1.5, hue: 30, grayscale: 0 },
    });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("eq=brightness=0.2:contrast=1.3:saturation=1.5");
    expect(g.filterComplex).toContain("hue=h=30");
  });

  it("el blanco y negro reduce la saturación efectiva", () => {
    const p = createEmptyProject("demo");
    videoLayers(p)[0].clips.push({
      ...createVideoClip("clip-1", 0, 10),
      trimOut: 4,
      filters: { brightness: 0, contrast: 1, saturation: 2, hue: 0, grayscale: 0.5 },
    });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("eq=brightness=0:contrast=1:saturation=1"); // 2·(1−0.5)
    expect(g.filterComplex).not.toContain("hue=h=");
  });

  it("con filtros neutros no se emite eq ni hue", () => {
    const g = buildFilterGraph(projectWithClip(), new Map([["clip-1", info]]));
    expect(g.filterComplex).not.toContain("eq=");
    expect(g.filterComplex).not.toContain("hue=h=");
  });

  it("lanza si el proyecto no tiene clips de vídeo", () => {
    expect(() => buildFilterGraph(createEmptyProject("x"), new Map())).toThrow(
      "El proyecto no tiene clips",
    );
  });

  it("lanza si falta la información de un clip", () => {
    expect(() => buildFilterGraph(projectWithClip(), new Map())).toThrow(
      "Falta la información del clip",
    );
  });
});

describe("buildFilterGraph — overlays", () => {
  it("imagen: input extra, escala+alpha, overlay con enable y eof_action", () => {
    const p = projectWithClip();
    addImage(p, {
      ...createImageOverlay("a1", "a1.png", 1, 0.3, 0.2),
      x: 0.5,
      y: 0.5,
      opacity: 0.9,
      end: 4,
    });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.inputs[1]).toEqual({ kind: "image", fileName: "a1.png" });
    // imagen: sin crop, scale, format=rgba, colorchannelmixer. Label: img{layerIdx}_0
    // La capa de imagen es la segunda capa (índice 1)
    expect(g.filterComplex).toContain("[1:v]scale=324:384,format=rgba,colorchannelmixer=aa=0.9");
    expect(g.filterComplex).toContain(
      "overlay=x=540-overlay_w/2:y=960-overlay_h/2:eof_action=repeat:enable='between(t,1,4)'",
    );
    // El videoLabel final es la imagen (última capa)
    expect(g.videoLabel).toContain("img");
  });

  it("imagen con rotación añade rotate con lienzo transparente", () => {
    const p = projectWithClip();
    addImage(p, { ...createImageOverlay("a1", "a1.png", 0, 0.3, 0.2), rotation: 45 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("rotate=45*PI/180:c=none:ow=rotw(45*PI/180):oh=roth(45*PI/180)");
  });

  it("texto: drawtext encadenado tras el vídeo base", () => {
    const p = projectWithClip();
    addText(p, { ...createTextOverlay(1), content: "Hola" });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("drawtext=");
    expect(g.filterComplex).toContain("text='Hola'");
    // El videoLabel final es el texto (última capa)
    expect(g.videoLabel).toContain("txt");
  });

  it("un texto rotado se renderiza en capa transparente, se rota y se superpone", () => {
    const p = projectWithClip();
    addText(p, { ...createTextOverlay(1), content: "Giro", rotation: 30, x: 0.5, y: 0.25, end: 4 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("color=c=0x00000000:s=1080x1920");
    expect(g.filterComplex).toContain("rotate=30*PI/180:c=none:ow=rotw(30*PI/180):oh=roth(30*PI/180)");
    expect(g.filterComplex).toContain(
      "overlay=x=540-overlay_w/2:y=480-overlay_h/2:enable='between(t,1,4)'",
    );
  });

  it("un texto sin rotación sigue usando drawtext directo", () => {
    const p = projectWithClip();
    addText(p, { ...createTextOverlay(1), content: "Plano" });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("drawtext=");
    expect(g.filterComplex).not.toContain("rotate=");
  });
});

describe("buildFilterGraph — subtítulos ASS", () => {
  it("añade el filtro ass cuando se pasa la ruta del .ass y hay cues", () => {
    const p = projectWithClip();
    p.subtitles.cues.push({ id: "c1", words: [{ text: "Hola", start: 0, end: 1 }] });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]), "C:/data/exports/subs.ass");
    expect(g.filterComplex).toContain("ass='C\\:/data/exports/subs.ass'");
  });

  it("sin cues no añade filtro ass aunque se pase ruta", () => {
    const g = buildFilterGraph(projectWithClip(), new Map([["clip-1", info]]), "C:/x/subs.ass");
    expect(g.filterComplex).not.toContain("ass=");
  });
});

const info2: ClipInfo = {
  id: "clip-2", url: "https://x", title: "cam", fileName: "clip-2.mp4",
  duration: 6, width: 1280, height: 720, createdAt: "2026-06-20T00:00:00.000Z",
};

describe("buildFilterGraph — multipista (vídeo)", () => {
  it("una pista superior composita un overlay de vídeo con opacidad y ventana de tiempo", () => {
    const p = projectWithClip(); // base: clip-1 en [0,5)
    // pista superior con un facecam en [1, 4) (3s), opacidad 0.8
    addVideoLayer(p, {
      id: "t2", name: "", clips: [
        { ...createVideoClip("clip-2", 1, 6), trimIn: 0, trimOut: 3, opacity: 0.8, zoom: { x: 0.5, y: 0.5, scale: 0.4 } },
      ],
    });
    const g = buildFilterGraph(p, new Map([["clip-1", info], ["clip-2", info2]]));
    // el clip-2 es el segundo input de vídeo
    expect(g.inputs).toContainEqual({ kind: "video", fileName: "clip-2.mp4" });
    // cadena del clip-2 (capa 1, clip 0): trim + setpts con offset al timelineStart + scale
    expect(g.filterComplex).toContain("[1:v]trim=start=0:end=3,setpts=(PTS-STARTPTS)/1+1/TB");
    // opacidad <1: format=rgba + colorchannelmixer
    expect(g.filterComplex).toContain("format=rgba,colorchannelmixer=aa=0.8[cva");
    // overlay sobre acumulador con enable entre 1 y 4 (clipEnd = 1 + 3/1)
    expect(g.filterComplex).toContain("enable='between(t,1,4)':eof_action=pass");
    // El videoLabel final incluye la segunda capa de vídeo
    expect(g.videoLabel).toContain("vl_acc1_0");
  });

  it("capa de vídeo + imagen overlay: etiquetas distintas, sin colisión", () => {
    const p = projectWithClip();
    addVideoLayer(p, {
      id: "t2", name: "", clips: [
        { ...createVideoClip("clip-2", 1, 6), trimIn: 0, trimOut: 3, opacity: 1, zoom: { x: 0.5, y: 0.5, scale: 0.4 } },
      ],
    });
    addImage(p, createImageOverlay("img-1", "logo.png", 0, 0.2, 0.2));
    const g = buildFilterGraph(p, new Map([["clip-1", info], ["clip-2", info2]]));
    // la capa de imagen usa etiqueta img{layerIdx}_{j} (capa imagen es la 3.ª, índice 2)
    expect(g.filterComplex).toContain("img2_0");
    // el clip de vídeo de la segunda capa usa vl{layerIdx}_{ci} (layerIdx=1)
    expect(g.filterComplex).toContain("vl1_0");
    // sin colisión de etiquetas: img y vl son prefijos distintos
    expect(g.filterComplex).not.toContain("[ov0]");
    // el videoLabel final es la imagen (composita encima del vídeo de la pista 2)
    expect(g.videoLabel).toContain("img_acc");
  });

  it("proyecto de una sola pista: no hay capas adicionales, videoLabel es el overlay del único clip", () => {
    const g = buildFilterGraph(projectWithClip(), new Map([["clip-1", info]]));
    // No hay ovsrc (etiqueta del modelo anterior)
    expect(g.filterComplex).not.toContain("ovsrc");
    // El videoLabel es el acumulador del único overlay
    expect(g.videoLabel).toBe("[vl_acc0_0]");
  });
});

describe("buildFilterGraph — multipista (audio)", () => {
  function twoTrackProject() {
    const p = projectWithClip(); // base clip-1 en [0,5)
    addVideoLayer(p, {
      id: "t2", name: "", clips: [
        { ...createVideoClip("clip-2", 1, 6), trimIn: 0, trimOut: 3, opacity: 1, zoom: { x: 0.5, y: 0.5, scale: 0.4 } },
      ],
    });
    return p;
  }

  it("mezcla el audio de la capa (retrasado a su inicio) con el audio base", () => {
    const g = buildFilterGraph(twoTrackProject(), new Map([["clip-1", info], ["clip-2", info2]]));
    // audio clip-1 (capa 0, clip 0): adelay=0
    expect(g.filterComplex).toContain("adelay=0:all=1[va0_0]");
    // audio clip-2 (capa 1, clip 0): adelay a timelineStart 1s = 1000ms
    expect(g.filterComplex).toContain("adelay=1000:all=1[va1_0]");
    // amix de ambos audios
    expect(g.filterComplex).toContain("[va0_0][va1_0]amix=inputs=2:duration=longest:normalize=0[voicemix]");
    expect(g.audioLabel).toBe("[voicemix]");
  });

  it("con música y ducking, la música baja bajo la voz combinada (base + capa)", () => {
    const p = twoTrackProject();
    p.settings.audioDucking = true;
    p.tracks.audio.push({ id: "a1", assetId: "m1", fileName: "m.mp3", volume: 0.8, start: 0, end: 5, trimIn: 0, trimOut: 5 });
    const g = buildFilterGraph(p, new Map([["clip-1", info], ["clip-2", info2]]));
    // voz combinada mezclada antes del ducking
    expect(g.filterComplex).toContain("[va0_0][va1_0]amix=inputs=2:duration=longest:normalize=0[voicemix]");
    expect(g.filterComplex).toContain("sidechaincompress");
    expect(g.audioLabel).toBe("[amix]");
  });

  it("una sola pista con música: audioLabel = va0_0 → amix con música (sin voicemix)", () => {
    const p = projectWithClip();
    p.tracks.audio.push({ id: "a1", assetId: "m1", fileName: "m.mp3", volume: 0.8, start: 0, end: 5, trimIn: 0, trimOut: 5 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    // con un solo clip de vídeo no hay amix de voz (voiceLabel = va0_0 directo)
    expect(g.filterComplex).not.toContain("voicemix");
    expect(g.filterComplex).toContain("[va0_0][mus0]amix=inputs=2:duration=first:normalize=0[amix]");
  });
});

describe("buildFilterGraph — música", () => {
  it("la música entra como input de audio con atrim, volume, adelay y amix", () => {
    const p = projectWithClip(); // vídeo en [0,5)
    p.tracks.audio.push({
      id: "m1", assetId: "a9", fileName: "song.mp3",
      volume: 0.6, start: 1, end: 4, trimIn: 10, trimOut: 40,
    });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.inputs[1]).toEqual({ kind: "audio", fileName: "song.mp3" });
    expect(g.filterComplex).toContain(
      "[1:a]atrim=start=10:end=13,asetpts=PTS-STARTPTS,volume=0.6,aresample=44100,aformat=channel_layouts=stereo,adelay=1000:all=1[mus0]",
    );
    expect(g.filterComplex).toContain("[va0_0][mus0]amix=inputs=2:duration=first:normalize=0[amix]");
    expect(g.audioLabel).toBe("[amix]");
  });

  it("sin música el audioLabel sigue siendo [va0_0] (único clip)", () => {
    const g = buildFilterGraph(projectWithClip(), new Map([["clip-1", info]]));
    expect(g.audioLabel).toBe("[va0_0]");
    // sin clips adicionales no hay amix de voz
    expect(g.filterComplex).not.toContain("amix");
  });

  it("fundido de entrada/salida añade fade y afade al final con los tiempos correctos", () => {
    const p = projectWithClip(); // vídeo en [0,5)
    p.settings.fadeIn = 1;
    p.settings.fadeOut = 2;
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("fade=t=in:st=0:d=1");
    expect(g.filterComplex).toContain("fade=t=out:st=3:d=2"); // total 5 - 2
    expect(g.filterComplex).toContain("afade=t=in:st=0:d=1");
    expect(g.filterComplex).toContain("afade=t=out:st=3:d=2");
    expect(g.videoLabel).toBe("[vfade]");
    expect(g.audioLabel).toBe("[afade]");
  });

  it("sin fundidos no añade fade", () => {
    const g = buildFilterGraph(projectWithClip(), new Map([["clip-1", info]]));
    expect(g.filterComplex).not.toContain("fade=");
  });

  it("transición entre clips consecutivos de la primera capa: fade en los límites", () => {
    const p = createEmptyProject("demo");
    p.settings.clipTransition = 0.5;
    videoLayers(p)[0].clips.push(createVideoClip("clip-1", 0, 4), createVideoClip("clip-1", 4, 4));
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    // clip 0 (dur 4, [0,4)): solo fade-out al final (ci=0, no hay ci>0)
    expect(g.filterComplex).toContain("fade=t=out:st=3.5:d=0.5");
    // clip 1 (dur 4, [4,8)): fade-in al inicio (st=4, en tiempo de línea temporal)
    expect(g.filterComplex).toContain("fade=t=in:st=4:d=0.5");
  });

  it("con ducking activado, la voz baja la música vía sidechaincompress", () => {
    const p = projectWithClip();
    p.settings.audioDucking = true;
    p.tracks.audio.push({
      id: "m1", assetId: "a9", fileName: "song.mp3",
      volume: 0.6, start: 1, end: 4, trimIn: 10, trimOut: 40,
    });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    // un solo clip: voiceLabel = va0_0 (sin voicemix)
    expect(g.filterComplex).toContain("[va0_0]asplit=2[avoice][ascv]");
    expect(g.filterComplex).toContain("[mus0][asc]sidechaincompress=");
    expect(g.filterComplex).toContain("[avoice][ducked]amix=inputs=2:duration=first:normalize=0[amix]");
    expect(g.audioLabel).toBe("[amix]");
  });
});

// ── Tests nuevos: orden de capas, equivalencia v2, colisión de etiquetas ─────

describe("buildFilterGraph — orden de capas (Fase 2)", () => {
  /**
   * Equivalencia v2: proyecto con layers=[video, image, text] (orden de migración por defecto)
   * debe componer vídeo primero (atrás), luego imagen, luego texto (delante).
   * Verificamos que en el grafo la imagen se compone DESPUÉS del vídeo y el
   * texto DESPUÉS de la imagen (el orden de la cadena de overlays refleja el z-order).
   */
  it("equivalencia v2: layers=[video, image, text] → overlay order vídeo < imagen < texto", () => {
    const p = createEmptyProject("v2-eq");
    // Capa 0: vídeo (índice 0 en layers, más al fondo)
    videoLayers(p)[0].clips.push({ ...createVideoClip("clip-1", 0, 5), trimIn: 0, trimOut: 5 });
    // Capa 1: imagen (encima del vídeo)
    addImage(p, createImageOverlay("img1", "logo.png", 0, 0.2, 0.2));
    // Capa 2: texto (encima de todo)
    addText(p, { ...createTextOverlay(0), content: "FRENTE" });

    const g = buildFilterGraph(p, new Map([["clip-1", info]]));

    // En el grafo:
    // 1. El clip de vídeo se compone sobre [bg] → produce [vl_acc0_0]
    // 2. La imagen se compone sobre [vl_acc0_0] → produce [img_acc1_0]  (capa 1)
    // 3. El texto se compone sobre [img_acc1_0] → produce [txt2_0]      (capa 2)
    const fc = g.filterComplex;

    // El overlay de vídeo alimenta el acumulador vl_acc0_0
    expect(fc).toContain("[vl_acc0_0]");
    // El overlay de imagen usa como base vl_acc0_0 (acumulador del vídeo)
    expect(fc).toContain("[vl_acc0_0][img1_0]overlay=");
    // El overlay de texto usa como base img_acc1_0 (acumulador de imagen)
    expect(fc).toContain("[img_acc1_0]");
    expect(fc).toContain("[txt2_0]");

    // Posición en el grafo: el índice de img_acc debe ser mayor que el de vl_acc
    const posVideo = fc.indexOf("[vl_acc0_0]");
    const posImage = fc.indexOf("[img_acc1_0]");
    const posText = fc.indexOf("[txt2_0]");
    expect(posImage).toBeGreaterThan(posVideo);
    expect(posText).toBeGreaterThan(posImage);
  });

  /**
   * Texto ATRÁS: layers=[text, video] — el texto se compone ANTES que el vídeo.
   * El vídeo tapa al texto (texto queda detrás del vídeo).
   */
  it("layers=[text, video]: el texto se compone primero (detrás del vídeo)", () => {
    const p = createEmptyProject("text-behind");
    // Capa 0 = texto (más al fondo, el más antiguo en layers)
    const txtLayer = createTextLayer();
    txtLayer.items.push({ ...createTextOverlay(0), content: "ATRÁS" });
    // Reemplazar la capa de vídeo por defecto con texto primero
    p.tracks.layers = [txtLayer];
    // Capa 1 = vídeo (encima del texto)
    p.tracks.layers.push({ kind: "video", id: "vid1", name: "", clips: [{ ...createVideoClip("clip-1", 0, 5), trimIn: 0, trimOut: 5 }] });

    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    const fc = g.filterComplex;

    // El texto (capa 0) se compone primero: [bg]...drawtext...[txt0_0]
    // El vídeo (capa 1) se compone encima: [txt0_0][cvvl1_0]overlay...
    expect(fc).toContain("[txt0_0]");
    expect(fc).toContain("[txt0_0][cvvl1_0]overlay=");

    // Posición: el texto debe aparecer antes del overlay de vídeo
    const posText = fc.indexOf("[txt0_0]");
    const posVid = fc.indexOf("[cvvl1_0]");
    expect(posText).toBeLessThan(posVid);
  });

  /**
   * Imagen entre vídeos: layers=[video0, image, video1].
   * El grafo debe componer vídeo0, luego imagen, luego vídeo1.
   */
  it("layers=[video0, image, video1]: imagen se compone entre los dos vídeos", () => {
    const p = createEmptyProject("img-between");
    // Capa 0: vídeo base
    videoLayers(p)[0].clips.push({ ...createVideoClip("clip-1", 0, 5), trimIn: 0, trimOut: 5 });
    // Capa 1: imagen en medio
    const imgLayer = createImageLayer();
    imgLayer.items.push(createImageOverlay("img1", "mid.png", 0, 0.3, 0.3));
    p.tracks.layers.push(imgLayer);
    // Capa 2: segundo vídeo encima
    p.tracks.layers.push({
      kind: "video", id: "vid2", name: "",
      clips: [{ ...createVideoClip("clip-2", 0, 5), trimIn: 0, trimOut: 5 }],
    });

    const g = buildFilterGraph(p, new Map([["clip-1", info], ["clip-2", info2]]));
    const fc = g.filterComplex;

    // Acumulador del primer vídeo: vl_acc0_0
    // La imagen usa vl_acc0_0 como base: img_acc1_0
    // El segundo vídeo usa img_acc1_0 como base
    expect(fc).toContain("[vl_acc0_0][img1_0]overlay=");
    expect(fc).toContain("[img_acc1_0][cvvl2_0]overlay=");
  });

  /**
   * Regresión de colisión de etiquetas: capa de vídeo + imagen + texto.
   * Las etiquetas deben ser únicas (vl, img, txt con índices de capa).
   * Esta combinación provocaba antes la colisión [ov] = [ov0] de imagen vs capa de vídeo.
   */
  it("regresión colisión de etiquetas: video + image + text produce etiquetas únicas", () => {
    const p = projectWithClip();
    addImage(p, createImageOverlay("x", "x.png", 0, 0.2, 0.2));
    addText(p, { ...createTextOverlay(0), content: "OK" });

    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    const fc = g.filterComplex;

    // Etiquetas esperadas (sin colisión):
    // Capa 0 (vídeo):  cvvl0_0, vl_acc0_0
    // Capa 1 (imagen): img1_0, img_acc1_0
    // Capa 2 (texto):  txt2_0
    expect(fc).toContain("cvvl0_0");
    expect(fc).toContain("img1_0");
    expect(fc).toContain("txt2_0");

    // Verificar que no hay ningún [ov0] (etiqueta del modelo anterior)
    expect(fc).not.toContain("[ov0]");
    expect(fc).not.toContain("ovsrc0");

    // Contar etiquetas para detectar duplicados: cada etiqueta de salida debe ser única
    const outputLabels = [...fc.matchAll(/\[([^\]]+)\]/g)]
      .map((m) => m[1])
      .filter((l) => !l.match(/^\d+:[va]$/)); // excluir etiquetas de input

    const uniqueLabels = new Set(outputLabels);
    // Cada etiqueta de salida debe aparecer al menos una vez (no duplicada como salida de dos filtros)
    // Verificamos las etiquetas clave que antes colisionaban
    expect(uniqueLabels.has("cvvl0_0")).toBe(true);
    expect(uniqueLabels.has("img1_0")).toBe(true);
    expect(uniqueLabels.has("txt2_0")).toBe(true);
  });
});
