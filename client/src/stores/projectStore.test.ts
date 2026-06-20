import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyProject, projectToPreset, videoLayers, textItems } from "@clipforge/shared";
import type { ClipInfo, SubtitleCue } from "@clipforge/shared";
import { useProjectStore, nonSilentSegments } from "./projectStore";
import { useUiStore } from "./uiStore";

const clipInfo: ClipInfo = {
  id: "clip-1",
  url: "https://clips.twitch.tv/x",
  title: "demo",
  fileName: "clip-1.mp4",
  duration: 10,
  width: 1920,
  height: 1080,
  createdAt: "2026-06-10T00:00:00.000Z",
};

beforeEach(() => {
  useProjectStore.getState().loadProject(createEmptyProject("test"));
});

describe("addVideoClip", () => {
  it("añade el clip al final de la secuencia", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    s.addVideoClip(clipInfo);
    const [a, b] = videoLayers(useProjectStore.getState().project)[0].clips;
    expect(a.timelineStart).toBe(0);
    expect(b.timelineStart).toBe(10);
  });
});

describe("addVideoClipAt", () => {
  it("coloca el clip en el instante soltado si el hueco está libre", () => {
    useProjectStore.getState().addVideoClipAt(clipInfo, 5);
    const v = videoLayers(useProjectStore.getState().project)[0].clips;
    expect(v).toHaveLength(1);
    expect(v[0].timelineStart).toBe(5);
  });

  it("si el instante pisa otro bloque, lo coloca al final de la secuencia", () => {
    const s = useProjectStore.getState();
    s.addVideoClipAt(clipInfo, 5); // 5..15 (duración 10)
    s.addVideoClipAt(clipInfo, 3); // 3..13 solapa con 5..15 → al final
    const v = videoLayers(useProjectStore.getState().project)[0].clips;
    expect(v).toHaveLength(2);
    expect(v[1].timelineStart).toBe(15);
  });
});

describe("nonSilentSegments", () => {
  it("devuelve el complemento de los silencios dentro del recorte", () => {
    expect(nonSilentSegments(0, 10, [{ start: 2, end: 4 }, { start: 6, end: 7 }])).toEqual([
      [0, 2],
      [4, 6],
      [7, 10],
    ]);
  });

  it("fusiona silencios solapados y recorta a [trimIn,trimOut]", () => {
    expect(nonSilentSegments(0, 10, [{ start: 2, end: 5 }, { start: 4, end: 6 }, { start: 8, end: 20 }])).toEqual([
      [0, 2],
      [6, 8],
    ]);
  });

  it("silencio al inicio y clip totalmente silencioso", () => {
    expect(nonSilentSegments(0, 10, [{ start: 0, end: 3 }])).toEqual([[3, 10]]);
    expect(nonSilentSegments(0, 10, [{ start: 0, end: 10 }])).toEqual([]);
  });
});

describe("removeSilencesFromClip", () => {
  it("parte el clip en sus tramos con voz, pegados desde el inicio", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo); // duración 10 → trimIn 0, trimOut 10, start 0
    const id = videoLayers(useProjectStore.getState().project)[0].clips[0].id;
    s.removeSilencesFromClip(id, [{ start: 2, end: 4 }]);
    const v = videoLayers(useProjectStore.getState().project)[0].clips;
    expect(v).toHaveLength(2);
    expect([v[0].trimIn, v[0].trimOut, v[0].timelineStart]).toEqual([0, 2, 0]);
    // 2º tramo: 4..10, pegado tras el primero (que dura 2s en proyecto)
    expect([v[1].trimIn, v[1].trimOut, v[1].timelineStart]).toEqual([4, 10, 2]);
  });

  it("sin silencios no hace nada", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = videoLayers(useProjectStore.getState().project)[0].clips[0].id;
    s.removeSilencesFromClip(id, []);
    expect(videoLayers(useProjectStore.getState().project)[0].clips).toHaveLength(1);
  });
});

describe("addCue", () => {
  it("inserta una frase en el instante dado y mantiene la lista ordenada por tiempo", () => {
    const s = useProjectStore.getState();
    s.addCue(10);
    s.addCue(4); // se inserta antes que la de 10
    const cues = useProjectStore.getState().project.subtitles.cues;
    expect(cues).toHaveLength(2);
    expect(cues[0].words[0].start).toBe(4);
    expect(cues[1].words[0].start).toBe(10);
    // dura 2s por defecto y trae texto editable
    expect(cues[0].words[0].end).toBe(6);
    expect(cues[0].words[0].text).toBeTruthy();
  });

  it("devuelve el id de la frase creada", () => {
    const id = useProjectStore.getState().addCue(2);
    expect(useProjectStore.getState().project.subtitles.cues.some((c) => c.id === id)).toBe(true);
  });
});

describe("moveVideoClip", () => {
  it("mueve el bloque si no hay solapamiento y lo rechaza si lo hay", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    s.addVideoClip(clipInfo);
    const [a, b] = videoLayers(useProjectStore.getState().project)[0].clips;
    s.moveVideoClip(b.id, 25);
    expect(videoLayers(useProjectStore.getState().project)[0].clips[1].timelineStart).toBe(25);
    s.moveVideoClip(b.id, 3); // solaparía con a
    expect(videoLayers(useProjectStore.getState().project)[0].clips[1].timelineStart).toBe(25);
    expect(a.timelineStart).toBe(0);
  });
});

describe("trimVideoClip", () => {
  it("recorta por el borde izquierdo ajustando trimIn y timelineStart", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = videoLayers(useProjectStore.getState().project)[0].clips[0].id;
    s.trimVideoClip(id, "start", 2);
    const c = videoLayers(useProjectStore.getState().project)[0].clips[0];
    expect(c.timelineStart).toBe(2);
    expect(c.trimIn).toBe(2);
    expect(c.trimOut).toBe(10);
  });

  it("recorta por el borde derecho ajustando trimOut", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = videoLayers(useProjectStore.getState().project)[0].clips[0].id;
    s.trimVideoClip(id, "end", 7);
    const c = videoLayers(useProjectStore.getState().project)[0].clips[0];
    expect(c.trimOut).toBeCloseTo(7);
    expect(c.timelineStart).toBe(0);
  });

  it("impone una duración mínima de 0.1s", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = videoLayers(useProjectStore.getState().project)[0].clips[0].id;
    s.trimVideoClip(id, "end", 0.01);
    expect(videoLayers(useProjectStore.getState().project)[0].clips[0].trimOut).toBeCloseTo(0.1);
  });
});

describe("splitVideoAt y removeElement", () => {
  it("divide el clip bajo el instante dado", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    s.splitVideoAt(4);
    const track = videoLayers(useProjectStore.getState().project)[0].clips;
    expect(track).toHaveLength(2);
    expect(track[0].trimOut).toBe(4);
    expect(track[1].timelineStart).toBe(4);
  });

  it("elimina un overlay de texto", () => {
    const s = useProjectStore.getState();
    s.addText(0);
    const id = textItems(useProjectStore.getState().project)[0].id;
    s.removeElement("text", id);
    expect(textItems(useProjectStore.getState().project)).toHaveLength(0);
  });
});

describe("historial", () => {
  it("undo/redo restauran snapshots", () => {
    const s = useProjectStore.getState();
    s.addText(0);
    s.addText(2);
    expect(textItems(useProjectStore.getState().project)).toHaveLength(2);
    s.undo();
    expect(textItems(useProjectStore.getState().project)).toHaveLength(1);
    s.undo();
    expect(textItems(useProjectStore.getState().project)).toHaveLength(0);
    expect(useProjectStore.getState().canUndo()).toBe(false);
    s.redo();
    expect(textItems(useProjectStore.getState().project)).toHaveLength(1);
  });

  it("una mutación nueva vacía el futuro", () => {
    const s = useProjectStore.getState();
    s.addText(0);
    s.undo();
    s.addText(5);
    expect(useProjectStore.getState().canRedo()).toBe(false);
  });

  it("beginTransaction agrupa updates transitorias en una sola entrada", () => {
    const s = useProjectStore.getState();
    s.addText(0);
    const id = textItems(useProjectStore.getState().project)[0].id;
    s.beginTransaction();
    s.updateText(id, { x: 0.1 }, { transient: true });
    s.updateText(id, { x: 0.2 }, { transient: true });
    s.updateText(id, { x: 0.3 }, { transient: true });
    expect(textItems(useProjectStore.getState().project)[0].x).toBe(0.3);
    s.undo(); // una sola entrada para todo el arrastre
    expect(textItems(useProjectStore.getState().project)[0].x).toBe(0.5);
  });

  it("undo poda la selección si el elemento seleccionado deja de existir", () => {
    const s = useProjectStore.getState();
    const id = s.addText(0);
    useUiStore.getState().select({ kind: "text", id });
    s.undo(); // el texto desaparece
    expect(useUiStore.getState().selection).toBeNull();
  });

  it("undo conserva la selección si el elemento sigue existiendo", () => {
    const s = useProjectStore.getState();
    const id = s.addText(0);
    useUiStore.getState().select({ kind: "text", id });
    s.updateText(id, { x: 0.2 });
    s.undo(); // se deshace la edición, no la existencia
    expect(useUiStore.getState().selection?.id).toBe(id);
  });
});

describe("pista de música", () => {
  it("addAudio añade la pista y trimAudio por la izquierda avanza trimIn", () => {
    const s = useProjectStore.getState();
    const id = s.addAudio("a1", "a1.mp3", 0, 30);
    s.trimAudio(id, "start", 5);
    const a = useProjectStore.getState().project.tracks.audio[0];
    expect(a.start).toBe(5);
    expect(a.trimIn).toBe(5);
    expect(a.end).toBe(30);
  });

  it("trimAudio por la derecha no puede superar el material disponible", () => {
    const s = useProjectStore.getState();
    const id = s.addAudio("a1", "a1.mp3", 0, 10);
    s.trimAudio(id, "end", 8);
    expect(useProjectStore.getState().project.tracks.audio[0].end).toBe(8);
    s.trimAudio(id, "end", 99);
    expect(useProjectStore.getState().project.tracks.audio[0].end).toBe(10);
  });

  it("moveOverlay funciona con audio y removeElement la elimina", () => {
    const s = useProjectStore.getState();
    const id = s.addAudio("a1", "a1.mp3", 0, 10);
    s.moveOverlay("audio", id, 4);
    expect(useProjectStore.getState().project.tracks.audio[0].start).toBe(4);
    s.removeElement("audio", id);
    expect(useProjectStore.getState().project.tracks.audio).toHaveLength(0);
  });
});

describe("subtítulos", () => {
  const cues: SubtitleCue[] = [
    { id: "c1", words: [{ text: "Hola", start: 0, end: 1 }] },
    { id: "c2", words: [{ text: "mundo", start: 1, end: 2 }] },
  ];

  it("setSubtitleCues reemplaza todas las cues (con undo)", () => {
    const s = useProjectStore.getState();
    s.setSubtitleCues(cues);
    expect(useProjectStore.getState().project.subtitles.cues).toHaveLength(2);
    s.setSubtitleCues([cues[0]]);
    expect(useProjectStore.getState().project.subtitles.cues).toHaveLength(1);
    s.undo();
    expect(useProjectStore.getState().project.subtitles.cues).toHaveLength(2);
  });

  it("updateCueText redistribuye los tiempos entre las palabras nuevas", () => {
    const s = useProjectStore.getState();
    s.setSubtitleCues(cues);
    s.updateCueText("c1", "a b");
    const cue = useProjectStore.getState().project.subtitles.cues[0];
    expect(cue.words.map((w) => w.text)).toEqual(["a", "b"]);
    expect(cue.words[0].start).toBe(0);
    expect(cue.words[1].end).toBe(1);
  });

  it("moveCue desplaza las palabras y removeCue la elimina", () => {
    const s = useProjectStore.getState();
    s.setSubtitleCues(cues);
    s.moveCue("c2", 5);
    const c2 = useProjectStore.getState().project.subtitles.cues[1];
    expect(c2.words[0].start).toBe(5); // estaba en 1 → +4
    s.removeCue("c1");
    expect(useProjectStore.getState().project.subtitles.cues.map((c) => c.id)).toEqual(["c2"]);
  });

  it("setSubtitleStyle y clearSubtitles", () => {
    const s = useProjectStore.getState();
    s.setSubtitleCues(cues);
    s.setSubtitleStyle({ uppercase: false });
    expect(useProjectStore.getState().project.subtitles.style.uppercase).toBe(false);
    s.clearSubtitles();
    expect(useProjectStore.getState().project.subtitles.cues).toEqual([]);
  });
});

describe("pistas de vídeo (multipista)", () => {
  it("addVideoTrack añade una pista vacía encima", () => {
    const s = useProjectStore.getState();
    expect(videoLayers(s.project)).toHaveLength(1);
    s.addVideoTrack();
    expect(videoLayers(useProjectStore.getState().project)).toHaveLength(2);
    expect(videoLayers(useProjectStore.getState().project)[1].clips).toEqual([]);
  });

  it("reorderVideoTrack reordena el vídeo y deja intacta la capa de imagen", () => {
    const s = useProjectStore.getState();
    s.addImage("a", "a.png", 0, 0.2, 0.2); // crea capa de imagen → [V0, I]
    const v1 = s.addVideoTrack("top"); // los vídeos se mantienen contiguos → [V0, V1, I]
    const kinds0 = useProjectStore.getState().project.tracks.layers.map((l) => l.kind);
    expect(kinds0.filter((k) => k === "video")).toHaveLength(2);
    expect(kinds0).toContain("image");
    s.reorderVideoTrack(1, 0); // mueve V1 (índice de vídeo 1) a la posición de vídeo 0
    const layers = useProjectStore.getState().project.tracks.layers;
    // V1 queda primero entre los vídeos y la capa de imagen sigue presente
    expect(videoLayers(useProjectStore.getState().project)[0].id).toBe(v1);
    expect(layers.some((l) => l.kind === "image")).toBe(true);
    expect(layers.filter((l) => l.kind === "video")).toHaveLength(2);
  });

  it("removeVideoTrack elimina la pista y sus clips, pero nunca deja 0 pistas", () => {
    const s = useProjectStore.getState();
    s.addVideoTrack();
    const id = videoLayers(useProjectStore.getState().project)[1].id;
    s.removeVideoTrack(id);
    expect(videoLayers(useProjectStore.getState().project)).toHaveLength(1);
    // intentar borrar la última no la borra
    const baseId = videoLayers(useProjectStore.getState().project)[0].id;
    s.removeVideoTrack(baseId);
    expect(videoLayers(useProjectStore.getState().project).length).toBeGreaterThanOrEqual(1);
  });

  it("moveClipToTrack mueve un clip a otra pista si no solapa", () => {
    const s = useProjectStore.getState();
    s.addVideoClip({ id: "c1", url: "", title: "", fileName: "c1.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" });
    s.addVideoTrack();
    const baseTrack = videoLayers(useProjectStore.getState().project)[0];
    const destId = videoLayers(useProjectStore.getState().project)[1].id;
    const clipId = baseTrack.clips[0].id;
    s.moveClipToTrack(clipId, destId, 0);
    const st = videoLayers(useProjectStore.getState().project);
    expect(st[0].clips).toHaveLength(0);
    expect(st[1].clips.map((c) => c.id)).toContain(clipId);
  });

  it("moveClipToTrack rechaza el movimiento si solaparía en destino", () => {
    const s = useProjectStore.getState();
    s.addVideoClip({ id: "c1", url: "", title: "", fileName: "c1.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" });
    s.addVideoTrack();
    // pone un clip ocupando [0,5) en la pista destino
    const destId = videoLayers(useProjectStore.getState().project)[1].id;
    const movingId = videoLayers(useProjectStore.getState().project)[0].clips[0].id;
    s.moveClipToTrack(movingId, destId, 0); // primero mueve uno
    s.addVideoClip({ id: "c2", url: "", title: "", fileName: "c2.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" });
    const secondId = videoLayers(useProjectStore.getState().project)[0].clips[0].id;
    // intenta mover el segundo a destino en t=0 → solapa con el primero
    s.moveClipToTrack(secondId, destId, 0);
    const st = videoLayers(useProjectStore.getState().project);
    expect(st[0].clips.map((c) => c.id)).toContain(secondId); // sigue en base
  });
});

describe("addVideoClipToTrack", () => {
  it("addVideoClipToTrack añade el clip a la pista indicada en el instante dado", () => {
    const s = useProjectStore.getState();
    s.addVideoTrack();
    const destId = videoLayers(useProjectStore.getState().project)[1].id;
    s.addVideoClipToTrack(
      { id: "c1", url: "", title: "", fileName: "c1.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" },
      destId, 2,
    );
    const st = videoLayers(useProjectStore.getState().project);
    expect(st[0].clips).toHaveLength(0);
    expect(st[1].clips).toHaveLength(1);
    expect(st[1].clips[0].timelineStart).toBe(2);
  });

  it("addVideoClipToTrack cae al final si el instante solaparía en esa pista", () => {
    const s = useProjectStore.getState();
    s.addVideoTrack();
    const destId = videoLayers(useProjectStore.getState().project)[1].id;
    const info = { id: "c1", url: "", title: "", fileName: "c1.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" };
    s.addVideoClipToTrack(info, destId, 0); // ocupa [0,5)
    s.addVideoClipToTrack(info, destId, 2); // solaparía → al final (5)
    const clips = videoLayers(useProjectStore.getState().project)[1].clips;
    expect(clips).toHaveLength(2);
    expect(Math.max(...clips.map((c) => c.timelineStart))).toBe(5);
  });
});

describe("addVideoTrack con posición y reorderVideoTrack", () => {
  it("addVideoTrack('top') añade arriba (último índice) y devuelve su id", () => {
    const s = useProjectStore.getState();
    const id = s.addVideoTrack("top");
    const v = videoLayers(useProjectStore.getState().project);
    expect(v[v.length - 1].id).toBe(id);
    expect(v).toHaveLength(2);
  });

  it("addVideoTrack('bottom') añade abajo (índice 0)", () => {
    const s = useProjectStore.getState();
    const id = s.addVideoTrack("bottom");
    expect(videoLayers(useProjectStore.getState().project)[0].id).toBe(id);
  });

  it("reorderVideoTrack mueve una pista a otro índice", () => {
    const s = useProjectStore.getState();
    const top = s.addVideoTrack("top"); // [base, top]
    s.reorderVideoTrack(1, 0);          // [top, base]
    const v = videoLayers(useProjectStore.getState().project);
    expect(v[0].id).toBe(top);
    expect(v).toHaveLength(2);
  });
});

describe("applyPreset", () => {
  it("sustituye formato, textos e imágenes conservando vídeo, con ids nuevos y undo", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    s.addText(0);
    const preset = projectToPreset("tpl", useProjectStore.getState().project);
    s.removeElement("text", textItems(useProjectStore.getState().project)[0].id);
    s.applyPreset(preset);
    const p = useProjectStore.getState().project;
    expect(textItems(p)).toHaveLength(1);
    expect(textItems(p)[0].id).not.toBe(preset.text[0].id); // id regenerado
    expect(videoLayers(p)[0].clips).toHaveLength(1); // el vídeo no se toca
    s.undo();
    expect(textItems(useProjectStore.getState().project)).toHaveLength(0);
  });
});
