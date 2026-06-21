import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyProject, mediaLayers, allVideoClips, textItems, imageItems, projectToPreset } from "@clipforge/shared";
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

// Helper: items de vídeo de la primera capa
function baseVideoItems(p = useProjectStore.getState().project) {
  const layer = mediaLayers(p)[0];
  return layer ? layer.items.filter((it) => it.kind === "video") : [];
}

beforeEach(() => {
  useProjectStore.getState().loadProject(createEmptyProject("test"));
});

describe("addVideoClip", () => {
  it("añade el clip al final de la secuencia", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    s.addVideoClip(clipInfo);
    const items = baseVideoItems();
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe("video");
    if (items[0].kind === "video") expect(items[0].timelineStart).toBe(0);
    if (items[1].kind === "video") expect(items[1].timelineStart).toBe(10);
  });
});

describe("addVideoClipAt", () => {
  it("coloca el clip en el instante soltado si el hueco está libre", () => {
    useProjectStore.getState().addVideoClipAt(clipInfo, 5);
    const items = baseVideoItems();
    expect(items).toHaveLength(1);
    if (items[0].kind === "video") expect(items[0].timelineStart).toBe(5);
  });

  it("si el instante pisa otro bloque, lo coloca al final de la secuencia", () => {
    const s = useProjectStore.getState();
    s.addVideoClipAt(clipInfo, 5); // 5..15 (duración 10)
    s.addVideoClipAt(clipInfo, 3); // 3..13 solapa con 5..15 → al final
    const items = baseVideoItems();
    expect(items).toHaveLength(2);
    if (items[1].kind === "video") expect(items[1].timelineStart).toBe(15);
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
    const id = allVideoClips(useProjectStore.getState().project)[0].id;
    s.removeSilencesFromClip(id, [{ start: 2, end: 4 }]);
    const items = baseVideoItems();
    expect(items).toHaveLength(2);
    const v0 = items[0]; const v1 = items[1];
    if (v0.kind === "video" && v1.kind === "video") {
      expect([v0.trimIn, v0.trimOut, v0.timelineStart]).toEqual([0, 2, 0]);
      expect([v1.trimIn, v1.trimOut, v1.timelineStart]).toEqual([4, 10, 2]);
    }
  });

  it("sin silencios no hace nada", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = allVideoClips(useProjectStore.getState().project)[0].id;
    s.removeSilencesFromClip(id, []);
    expect(baseVideoItems()).toHaveLength(1);
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
    const clips = allVideoClips(useProjectStore.getState().project);
    const [a, b] = clips;
    s.moveVideoClip(b.id, 25);
    const after = allVideoClips(useProjectStore.getState().project);
    const bAfter = after.find((c) => c.id === b.id)!;
    expect(bAfter.timelineStart).toBe(25);
    s.moveVideoClip(b.id, 3); // solaparía con a
    const after2 = allVideoClips(useProjectStore.getState().project);
    const bAfter2 = after2.find((c) => c.id === b.id)!;
    expect(bAfter2.timelineStart).toBe(25);
    const aAfter = after2.find((c) => c.id === a.id)!;
    expect(aAfter.timelineStart).toBe(0);
  });
});

describe("trimVideoClip", () => {
  it("recorta por el borde izquierdo ajustando trimIn y timelineStart", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = allVideoClips(useProjectStore.getState().project)[0].id;
    s.trimVideoClip(id, "start", 2);
    const c = allVideoClips(useProjectStore.getState().project)[0];
    expect(c.timelineStart).toBe(2);
    expect(c.trimIn).toBe(2);
    expect(c.trimOut).toBe(10);
  });

  it("recorta por el borde derecho ajustando trimOut", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = allVideoClips(useProjectStore.getState().project)[0].id;
    s.trimVideoClip(id, "end", 7);
    const c = allVideoClips(useProjectStore.getState().project)[0];
    expect(c.trimOut).toBeCloseTo(7);
    expect(c.timelineStart).toBe(0);
  });

  it("impone una duración mínima de 0.1s", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = allVideoClips(useProjectStore.getState().project)[0].id;
    s.trimVideoClip(id, "end", 0.01);
    expect(allVideoClips(useProjectStore.getState().project)[0].trimOut).toBeCloseTo(0.1);
  });
});

describe("splitVideoAt y removeElement", () => {
  it("divide el clip bajo el instante dado", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    s.splitVideoAt(4);
    const items = baseVideoItems();
    expect(items).toHaveLength(2);
    if (items[0].kind === "video" && items[1].kind === "video") {
      expect(items[0].trimOut).toBe(4);
      expect(items[1].timelineStart).toBe(4);
    }
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
    expect(c2.words[0].start).toBe(5);
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

describe("capas media (addMediaLayer / reorderLayer / removeLayer)", () => {
  it("addMediaLayer añade una capa media vacía y devuelve su id", () => {
    const s = useProjectStore.getState();
    const before = mediaLayers(s.project).length;
    const id = s.addMediaLayer();
    const layers = mediaLayers(useProjectStore.getState().project);
    expect(layers).toHaveLength(before + 1);
    const newLayer = layers.find((l) => l.id === id)!;
    expect(newLayer).toBeDefined();
    expect(newLayer.items).toEqual([]);
  });

  it("addMediaLayer(atIndex) inserta la capa en esa posición del array", () => {
    const s = useProjectStore.getState();
    const a = s.addMediaLayer(); // [base, a]
    const mid = s.addMediaLayer(1); // [base, mid, a]
    const layers = mediaLayers(useProjectStore.getState().project);
    expect(layers).toHaveLength(3);
    expect(layers[1].id).toBe(mid);
    expect(layers[2].id).toBe(a);
  });

  it("addMediaLayer(0) inserta la capa en el fondo", () => {
    const s = useProjectStore.getState();
    const bottom = s.addMediaLayer(0);
    expect(mediaLayers(useProjectStore.getState().project)[0].id).toBe(bottom);
  });


  it("reorderLayer reordena por índice de array total", () => {
    const s = useProjectStore.getState();
    const l1 = s.addMediaLayer();
    s.addMediaLayer();
    // capas: [base, l1, l2] — mover base (0) al final (2)
    s.reorderLayer(0, 2);
    const layers = mediaLayers(useProjectStore.getState().project);
    expect(layers[0].id).toBe(l1);
    expect(layers[2].id).not.toBe(l1);
  });

  it("reorderLayer no-op si fromIndex === toIndex", () => {
    const s = useProjectStore.getState();
    s.addMediaLayer();
    const before = mediaLayers(useProjectStore.getState().project).map((l) => l.id);
    s.reorderLayer(0, 0);
    const after = mediaLayers(useProjectStore.getState().project).map((l) => l.id);
    expect(before).toEqual(after);
  });

  it("reorderLayer clampea toIndex a [0, length-1]", () => {
    const s = useProjectStore.getState();
    s.addMediaLayer(); // [base, new] → 2 capas
    const baseId = mediaLayers(useProjectStore.getState().project)[0].id;
    s.reorderLayer(0, 99); // clamp a 1
    const layers = mediaLayers(useProjectStore.getState().project);
    expect(layers[0].id).not.toBe(baseId);
    expect(layers[1].id).toBe(baseId);
  });

  it("removeLayer elimina la capa indicada", () => {
    const s = useProjectStore.getState();
    const id = s.addMediaLayer();
    s.removeLayer(id);
    expect(mediaLayers(useProjectStore.getState().project).find((l) => l.id === id)).toBeUndefined();
  });

  it("removeLayer nunca deja 0 capas: si era la última, inserta una vacía", () => {
    const s = useProjectStore.getState();
    const baseId = mediaLayers(useProjectStore.getState().project)[0].id;
    s.removeLayer(baseId);
    const layers = mediaLayers(useProjectStore.getState().project);
    expect(layers).toHaveLength(1);
    expect(layers[0].items).toEqual([]);
  });
});

describe("moveElementToLayer — cualquier kind puede moverse a cualquier capa", () => {
  it("mueve un clip de vídeo a otra capa si no hay solape", () => {
    const s = useProjectStore.getState();
    s.addVideoClip({ id: "c1", url: "", title: "", fileName: "c1.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" });
    const destId = s.addMediaLayer();
    const srcClipId = allVideoClips(useProjectStore.getState().project)[0].id;
    s.moveElementToLayer(srcClipId, destId, 0);
    const p = useProjectStore.getState().project;
    expect(mediaLayers(p)[0].items.filter((it) => it.kind === "video")).toHaveLength(0);
    expect(mediaLayers(p).find((l) => l.id === destId)!.items.map((it) => it.id)).toContain(srcClipId);
  });

  it("rechaza mover si solaparía en destino", () => {
    const s = useProjectStore.getState();
    s.addVideoClip({ id: "c1", url: "", title: "", fileName: "c1.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" });
    const destId = s.addMediaLayer();
    // pone un clip ocupando [0,5) en destino
    s.addVideoClipToTrack({ id: "c2", url: "", title: "", fileName: "c2.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" }, destId, 0);
    const srcClipId = allVideoClips(useProjectStore.getState().project).find((c) => c.clipId === "c1")!.id;
    s.moveElementToLayer(srcClipId, destId, 2); // solapa [0,5)
    const p = useProjectStore.getState().project;
    // el clip sigue en la capa base
    expect(mediaLayers(p)[0].items.some((it) => it.id === srcClipId)).toBe(true);
  });

  it("mueve un item de texto a otra capa (cross-kind: la capa acepta cualquier kind)", () => {
    const s = useProjectStore.getState();
    const destId = s.addMediaLayer();
    s.addText(0); // va a la primera capa (base, índice 0)
    const txtId = textItems(useProjectStore.getState().project)[0].id;
    s.moveElementToLayer(txtId, destId, 10);
    const p = useProjectStore.getState().project;
    // ya no está en la base
    expect(mediaLayers(p)[0].items.some((it) => it.id === txtId)).toBe(false);
    // está en destino
    const destLayer = mediaLayers(p).find((l) => l.id === destId)!;
    expect(destLayer.items.some((it) => it.id === txtId)).toBe(true);
    const moved = destLayer.items.find((it) => it.id === txtId)!;
    if (moved.kind === "text") expect(moved.start).toBe(10);
  });

  it("mueve un item de imagen a otra capa sin solape", () => {
    const s = useProjectStore.getState();
    const destId = s.addMediaLayer();
    s.addImage("a1", "a.png", 0, 0.2, 0.2);
    const imgId = imageItems(useProjectStore.getState().project)[0].id;
    s.moveElementToLayer(imgId, destId, 5);
    const p = useProjectStore.getState().project;
    expect(mediaLayers(p)[0].items.some((it) => it.id === imgId)).toBe(false);
    const moved = mediaLayers(p).find((l) => l.id === destId)!.items.find((it) => it.id === imgId)!;
    expect(moved).toBeDefined();
    if (moved.kind === "image") expect(moved.start).toBe(5);
  });
});

describe("no-solape mixto dentro de una capa (texto + vídeo en el mismo carril)", () => {
  it("un texto y un vídeo en la misma capa no pueden solaparse en el tiempo", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo); // vídeo [0, 10) en capa base
    // intentar añadir texto en t=5 → solapa con el vídeo → cae al final
    s.addText(5); // duration=4 → [5,9) solapa → debe caer al final del clip (10)
    const txt = textItems(useProjectStore.getState().project);
    expect(txt).toHaveLength(1);
    expect(txt[0].start).toBeGreaterThanOrEqual(10);
  });

  it("en capas distintas, texto y vídeo pueden coincidir en el tiempo", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo); // vídeo [0, 10) en capa base (índice 0)
    // añadir texto en otra capa
    const destId = s.addMediaLayer();
    s.addText(0); // irá a la capa base (mediaLayerFor = primera capa)
    // mover ese texto a la capa dest
    const txtId = textItems(useProjectStore.getState().project)[0].id;
    s.moveElementToLayer(txtId, destId, 0); // [0, 4) en destId sin vídeos → ok
    const p = useProjectStore.getState().project;
    const destLayer = mediaLayers(p).find((l) => l.id === destId)!;
    expect(destLayer.items.some((it) => it.id === txtId)).toBe(true);
    // el vídeo sigue en la base
    expect(allVideoClips(p)).toHaveLength(1);
  });
});

describe("addVideoClipToTrack", () => {
  it("añade el clip a la capa indicada en el instante dado", () => {
    const s = useProjectStore.getState();
    const destId = s.addMediaLayer();
    s.addVideoClipToTrack(
      { id: "c1", url: "", title: "", fileName: "c1.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" },
      destId, 2,
    );
    const p = useProjectStore.getState().project;
    const destLayer = mediaLayers(p).find((l) => l.id === destId)!;
    expect(destLayer.items.filter((it) => it.kind === "video")).toHaveLength(1);
    const it = destLayer.items[0];
    if (it.kind === "video") expect(it.timelineStart).toBe(2);
  });

  it("cae al final si el instante solaparía en esa capa", () => {
    const s = useProjectStore.getState();
    const destId = s.addMediaLayer();
    const info = { id: "c1", url: "", title: "", fileName: "c1.mp4", duration: 5, width: 1920, height: 1080, createdAt: "" };
    s.addVideoClipToTrack(info, destId, 0); // ocupa [0,5)
    s.addVideoClipToTrack(info, destId, 2); // solaparía → al final (5)
    const destLayer = mediaLayers(useProjectStore.getState().project).find((l) => l.id === destId)!;
    const videoItems = destLayer.items.filter((it) => it.kind === "video");
    expect(videoItems).toHaveLength(2);
    const starts = videoItems.map((it) => it.kind === "video" ? it.timelineStart : 0);
    expect(Math.max(...starts)).toBe(5);
  });
});

describe("removeLayer", () => {
  it("elimina la capa indicada pero nunca deja 0 capas", () => {
    const s = useProjectStore.getState();
    const id = s.addMediaLayer();
    s.removeLayer(id);
    expect(mediaLayers(useProjectStore.getState().project).find((l) => l.id === id)).toBeUndefined();
    // intentar eliminar la última no debe funcionar (siempre ≥1 capa)
    const baseId = mediaLayers(useProjectStore.getState().project)[0].id;
    s.removeLayer(baseId);
    expect(mediaLayers(useProjectStore.getState().project).length).toBeGreaterThanOrEqual(1);
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
    expect(allVideoClips(p)).toHaveLength(1); // el vídeo no se toca
    s.undo();
    expect(textItems(useProjectStore.getState().project)).toHaveLength(0);
  });
});

describe("no-solape en addText / addImage", () => {
  it("addText cae al final si el start solaparía en la capa", () => {
    const s = useProjectStore.getState();
    s.addText(0); // [0, 4)
    s.addText(2); // overlaps [0,4) → debería ir al final=4
    const items = textItems(useProjectStore.getState().project);
    expect(items).toHaveLength(2);
    expect(items[1].start).toBe(4);
  });

  it("addText en hueco libre lo pone en el start dado", () => {
    const s = useProjectStore.getState();
    s.addText(0);  // [0, 4)
    s.addText(10); // [10, 14) — no overlap
    const items = textItems(useProjectStore.getState().project);
    expect(items[1].start).toBe(10);
  });

  it("addImage cae al final si el start solaparía en la capa", () => {
    const s = useProjectStore.getState();
    s.addImage("a1", "a.png", 0, 0.2, 0.2); // [0, 4)
    s.addImage("a2", "b.png", 1, 0.2, 0.2); // overlaps → lands at 4
    const items = imageItems(useProjectStore.getState().project);
    expect(items).toHaveLength(2);
    expect(items[1].start).toBe(4);
  });
});
