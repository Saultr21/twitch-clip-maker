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
  it("un clip: trim, escala, fondo negro y concat de un segmento", () => {
    const g = buildFilterGraph(projectWithClip(), new Map([["clip-1", info]]));
    expect(g.inputs).toEqual([{ kind: "video", fileName: "clip-1.mp4" }]);
    expect(g.filterComplex).toContain("[0:v]trim=start=2:end=7,setpts=PTS-STARTPTS,scale=1080:608[cv0]");
    expect(g.filterComplex).toContain("color=black:s=1080x1920:d=5:r=30[bg0]");
    expect(g.filterComplex).toContain("[bg0][cv0]overlay=x=0:y=656:shortest=1[seg0]");
    expect(g.filterComplex).toContain(
      "[0:a]atrim=start=2:end=7,asetpts=PTS-STARTPTS,volume=1,aresample=44100,aformat=channel_layouts=stereo[sega0]",
    );
    expect(g.filterComplex).toContain("[seg0][sega0]concat=n=1:v=1:a=1[vcat][acat]");
    expect(g.videoLabel).toBe("[vcat]");
    expect(g.audioLabel).toBe("[acat]");
    expect(g.totalDuration).toBe(5); // clip en [0,5): trim de 2 a 7 son 5s de material
  });

  it("hueco inicial entre t=0 y el primer clip: segmento negro con silencio", () => {
    const p = createEmptyProject("demo");
    videoLayers(p)[0].clips.push({ ...createVideoClip("clip-1", 3, 10), trimIn: 0, trimOut: 4 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("color=black:s=1080x1920:d=3:r=30[seg0]");
    expect(g.filterComplex).toContain("anullsrc=r=44100:cl=stereo,atrim=duration=3[sega0]");
    expect(g.filterComplex).toContain("concat=n=2:v=1:a=1");
    expect(g.totalDuration).toBe(7);
  });

  it("un overlay que termina después del último clip añade cola en negro", () => {
    const p = projectWithClip(); // clip en [0,5)
    addText(p, { ...createTextOverlay(4), end: 8 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("color=black:s=1080x1920:d=3:r=30[seg1]");
    expect(g.filterComplex).toContain("concat=n=2:v=1:a=1");
    expect(g.totalDuration).toBe(8);
  });

  it("dos clips contiguos: dos segmentos y n=2", () => {
    const p = projectWithClip(); // ocupa [0,5)
    videoLayers(p)[0].clips.push({ ...createVideoClip("clip-1", 5, 10), trimIn: 0, trimOut: 2 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.inputs).toHaveLength(2);
    expect(g.filterComplex).toContain("[1:v]trim=start=0:end=2");
    expect(g.filterComplex).toContain("concat=n=2:v=1:a=1");
    expect(g.totalDuration).toBe(7);
  });

  it("fondo de color sólido genera un color source con el hex del proyecto", () => {
    const p = projectWithClip();
    p.settings.background = { type: "color", color: "#ff0066", blur: 0.5 };
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("color=c=0xff0066:s=1080x1920:d=5:r=30[bg0]");
  });

  it("fondo blur divide el clip y desenfoca la rama de fondo a cover", () => {
    const p = projectWithClip();
    p.settings.background = { type: "blur", color: "#000000", blur: 0.5 };
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("split=2[fg0][bgsrc0]");
    expect(g.filterComplex).toContain(
      "[bgsrc0]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:1[bg0]",
    );
    expect(g.filterComplex).toContain("[fg0]scale=1080:608[cv0]");
  });

  it("fondo de imagen: input en bucle, split por segmento y escala a cover", () => {
    const p = projectWithClip();
    p.settings.background = { type: "image", color: "#000000", blur: 0.5, fileName: "fondo.png" };
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    // la imagen de fondo es un input en bucle
    expect(g.inputs[0]).toEqual({ kind: "image", fileName: "fondo.png", loop: true });
    // el clip ahora es el input 1
    expect(g.filterComplex).toContain("[1:v]trim=start=2:end=7");
    expect(g.filterComplex).toContain("[0:v]split=1[ibsrc0]");
    expect(g.filterComplex).toContain(
      "[ibsrc0]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,trim=duration=5,setpts=PTS-STARTPTS,format=yuv420p[bg0]",
    );
    expect(g.filterComplex).toContain("[bg0][cv0]overlay=x=0:y=656:shortest=1[seg0]");
  });

  it("fondo de imagen sin fileName cae a fondo negro", () => {
    const p = projectWithClip();
    p.settings.background = { type: "image", color: "#000000", blur: 0.5 };
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("color=black:s=1080x1920:d=5:r=30[bg0]");
    expect(g.filterComplex).not.toContain("split");
  });

  it("el volumen del audio original se aplica a cada clip", () => {
    const p = projectWithClip();
    p.originalAudioVolume = 0.35;
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("volume=0.35");
  });

  it("la velocidad ajusta setpts, atempo y la duración del segmento", () => {
    const p = createEmptyProject("demo");
    videoLayers(p)[0].clips.push({ ...createVideoClip("clip-1", 0, 10), trimIn: 0, trimOut: 4, speed: 2 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("setpts=(PTS-STARTPTS)/2");
    expect(g.filterComplex).toContain("atempo=2");
    expect(g.filterComplex).toContain("d=2:r=30[bg0]"); // 4s de material a 2x = 2s
    expect(g.totalDuration).toBe(2);
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
    expect(g.filterComplex).toContain("[1:v]scale=324:384,format=rgba,colorchannelmixer=aa=0.9[img0]");
    expect(g.filterComplex).toContain(
      "overlay=x=540-overlay_w/2:y=960-overlay_h/2:eof_action=repeat:enable='between(t,1,4)'",
    );
    expect(g.videoLabel).toBe("[ov0]");
  });

  it("imagen con rotación añade rotate con lienzo transparente", () => {
    const p = projectWithClip();
    addImage(p, { ...createImageOverlay("a1", "a1.png", 0, 0.3, 0.2), rotation: 45 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("rotate=45*PI/180:c=none:ow=rotw(45*PI/180):oh=roth(45*PI/180)");
  });

  it("texto: drawtext encadenado tras el concat", () => {
    const p = projectWithClip();
    addText(p, { ...createTextOverlay(1), content: "Hola" });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("drawtext=");
    expect(g.filterComplex).toContain("text='Hola'");
    expect(g.videoLabel).toBe("[txt0]");
  });

  it("un texto rotado se renderiza en capa transparente, se rota y se superpone", () => {
    const p = projectWithClip();
    addText(p, { ...createTextOverlay(1), content: "Giro", rotation: 30, x: 0.5, y: 0.25, end: 4 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("color=c=0x00000000:s=1080x1920");
    expect(g.filterComplex).toContain("rotate=30*PI/180:c=none:ow=rotw(30*PI/180):oh=roth(30*PI/180)");
    expect(g.filterComplex).toContain(
      "overlay=x=540-overlay_w/2:y=480-overlay_h/2:enable='between(t,1,4)'[txt0]",
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
    // el clip-2 es el segundo input de vídeo (índice 1)
    expect(g.inputs).toContainEqual({ kind: "video", fileName: "clip-2.mp4" });
    // cadena de la capa: trim + setpts con offset al timelineStart + scale + rgba + opacidad
    expect(g.filterComplex).toContain("[1:v]trim=start=0:end=3,setpts=(PTS-STARTPTS)/1+1/TB");
    expect(g.filterComplex).toContain("format=rgba,colorchannelmixer=aa=0.8[ovsrc0]");
    // overlay sobre [vcat] con enable entre 1 y 4 (clipEnd = 1 + 3/1)
    expect(g.filterComplex).toContain("[vcat][ovsrc0]overlay=");
    expect(g.filterComplex).toContain("enable='between(t,1,4)':eof_action=pass[vlay0]");
    // el vídeo final ya no es [vcat] sino la capa compositada (luego seguirían imágenes/textos)
    expect(g.videoLabel).toBe("[vlay0]");
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
    // la capa de vídeo produce [vlay0] y la imagen se composita ENCIMA de ella ([ov0])
    expect(g.filterComplex).toContain("[vlay0][img0]overlay=");
    expect(g.videoLabel).toBe("[ov0]"); // la imagen es la capa más externa
  });

  it("proyecto de una sola pista: NO añade overlays de vídeo (comportamiento idéntico)", () => {
    const g = buildFilterGraph(projectWithClip(), new Map([["clip-1", info]]));
    expect(g.filterComplex).not.toContain("ovsrc");
    expect(g.videoLabel).toBe("[vcat]");
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
    // audio de la capa: trim + adelay al timelineStart (1s = 1000ms)
    expect(g.filterComplex).toContain("adelay=1000:all=1[ova0]");
    // amix de voz = base + capa
    expect(g.filterComplex).toContain("[acat][ova0]amix=inputs=2:duration=first:normalize=0[voicemix]");
    expect(g.audioLabel).toBe("[voicemix]");
  });

  it("con música y ducking, la música baja bajo la voz combinada (base + capa)", () => {
    const p = twoTrackProject();
    p.settings.audioDucking = true;
    p.tracks.audio.push({ id: "a1", assetId: "m1", fileName: "m.mp3", volume: 0.8, start: 0, end: 5, trimIn: 0, trimOut: 5 });
    const g = buildFilterGraph(p, new Map([["clip-1", info], ["clip-2", info2]]));
    // se construye la voz combinada y la música se duckeа contra ella
    expect(g.filterComplex).toContain("[acat][ova0]amix=inputs=2:duration=first:normalize=0[voicemix]");
    expect(g.filterComplex).toContain("sidechaincompress");
    expect(g.audioLabel).toBe("[amix]");
  });

  it("una sola pista con música: salida de audio idéntica a la actual (sin voicemix)", () => {
    const p = projectWithClip();
    p.tracks.audio.push({ id: "a1", assetId: "m1", fileName: "m.mp3", volume: 0.8, start: 0, end: 5, trimIn: 0, trimOut: 5 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).not.toContain("voicemix");
    expect(g.filterComplex).toContain("[acat][mus0]amix=inputs=2:duration=first:normalize=0[amix]");
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
    expect(g.filterComplex).toContain("[acat][mus0]amix=inputs=2:duration=first:normalize=0[amix]");
    expect(g.audioLabel).toBe("[amix]");
  });

  it("sin música el audioLabel sigue siendo [acat]", () => {
    const g = buildFilterGraph(projectWithClip(), new Map([["clip-1", info]]));
    expect(g.audioLabel).toBe("[acat]");
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

  it("transición entre clips: fade a negro en los límites (out del 1.º, in del 2.º)", () => {
    const p = createEmptyProject("demo");
    p.settings.clipTransition = 0.5;
    videoLayers(p)[0].clips.push(createVideoClip("clip-1", 0, 4), createVideoClip("clip-1", 4, 4));
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    // clip 0 (dur 4): solo fade-out al final
    expect(g.filterComplex).toContain("[seg0]fade=t=out:st=3.5:d=0.5[segt0]");
    expect(g.filterComplex).toContain("[sega0]afade=t=out:st=3.5:d=0.5[segat0]");
    // clip 1: solo fade-in al inicio
    expect(g.filterComplex).toContain("[seg1]fade=t=in:st=0:d=0.5[segt1]");
  });

  it("con ducking activado, la voz baja la música vía sidechaincompress", () => {
    const p = projectWithClip();
    p.settings.audioDucking = true;
    p.tracks.audio.push({
      id: "m1", assetId: "a9", fileName: "song.mp3",
      volume: 0.6, start: 1, end: 4, trimIn: 10, trimOut: 40,
    });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("[acat]asplit=2[avoice][ascv]");
    expect(g.filterComplex).toContain("[mus0][asc]sidechaincompress=");
    expect(g.filterComplex).toContain("[avoice][ducked]amix=inputs=2:duration=first:normalize=0[amix]");
    expect(g.audioLabel).toBe("[amix]");
  });
});
