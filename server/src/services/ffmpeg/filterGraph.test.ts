import { describe, expect, it } from "vitest";
import type { ClipInfo } from "@clipforge/shared";
import {
  createEmptyProject,
  createImageOverlay,
  createTextOverlay,
  createVideoClip,
} from "@clipforge/shared";
import { buildFilterGraph } from "./filterGraph.js";

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
  p.tracks.video.push({ ...createVideoClip("clip-1", 0, 10), trimIn: 2, trimOut: 7 });
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
    p.tracks.video.push({ ...createVideoClip("clip-1", 3, 10), trimIn: 0, trimOut: 4 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("color=black:s=1080x1920:d=3:r=30[seg0]");
    expect(g.filterComplex).toContain("anullsrc=r=44100:cl=stereo,atrim=duration=3[sega0]");
    expect(g.filterComplex).toContain("concat=n=2:v=1:a=1");
    expect(g.totalDuration).toBe(7);
  });

  it("un overlay que termina después del último clip añade cola en negro", () => {
    const p = projectWithClip(); // clip en [0,5)
    p.tracks.text.push({ ...createTextOverlay(4), end: 8 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("color=black:s=1080x1920:d=3:r=30[seg1]");
    expect(g.filterComplex).toContain("concat=n=2:v=1:a=1");
    expect(g.totalDuration).toBe(8);
  });

  it("dos clips contiguos: dos segmentos y n=2", () => {
    const p = projectWithClip(); // ocupa [0,5)
    p.tracks.video.push({ ...createVideoClip("clip-1", 5, 10), trimIn: 0, trimOut: 2 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.inputs).toHaveLength(2);
    expect(g.filterComplex).toContain("[1:v]trim=start=0:end=2");
    expect(g.filterComplex).toContain("concat=n=2:v=1:a=1");
    expect(g.totalDuration).toBe(7);
  });

  it("el volumen del audio original se aplica a cada clip", () => {
    const p = projectWithClip();
    p.originalAudioVolume = 0.35;
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("volume=0.35");
  });

  it("la velocidad ajusta setpts, atempo y la duración del segmento", () => {
    const p = createEmptyProject("demo");
    p.tracks.video.push({ ...createVideoClip("clip-1", 0, 10), trimIn: 0, trimOut: 4, speed: 2 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("setpts=(PTS-STARTPTS)/2");
    expect(g.filterComplex).toContain("atempo=2");
    expect(g.filterComplex).toContain("d=2:r=30[bg0]"); // 4s de material a 2x = 2s
    expect(g.totalDuration).toBe(2);
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
    p.tracks.image.push({
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
    p.tracks.image.push({ ...createImageOverlay("a1", "a1.png", 0, 0.3, 0.2), rotation: 45 });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("rotate=45*PI/180:c=none:ow=rotw(45*PI/180):oh=roth(45*PI/180)");
  });

  it("texto: drawtext encadenado tras el concat", () => {
    const p = projectWithClip();
    p.tracks.text.push({ ...createTextOverlay(1), content: "Hola" });
    const g = buildFilterGraph(p, new Map([["clip-1", info]]));
    expect(g.filterComplex).toContain("drawtext=");
    expect(g.filterComplex).toContain("text='Hola'");
    expect(g.videoLabel).toBe("[txt0]");
  });
});
