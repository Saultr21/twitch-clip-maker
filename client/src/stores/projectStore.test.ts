import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "@clipforge/shared";
import type { ClipInfo } from "@clipforge/shared";
import { useProjectStore } from "./projectStore";
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
    const [a, b] = useProjectStore.getState().project.tracks.video;
    expect(a.timelineStart).toBe(0);
    expect(b.timelineStart).toBe(10);
  });
});

describe("moveVideoClip", () => {
  it("mueve el bloque si no hay solapamiento y lo rechaza si lo hay", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    s.addVideoClip(clipInfo);
    const [a, b] = useProjectStore.getState().project.tracks.video;
    s.moveVideoClip(b.id, 25);
    expect(useProjectStore.getState().project.tracks.video[1].timelineStart).toBe(25);
    s.moveVideoClip(b.id, 3); // solaparía con a
    expect(useProjectStore.getState().project.tracks.video[1].timelineStart).toBe(25);
    expect(a.timelineStart).toBe(0);
  });
});

describe("trimVideoClip", () => {
  it("recorta por el borde izquierdo ajustando trimIn y timelineStart", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = useProjectStore.getState().project.tracks.video[0].id;
    s.trimVideoClip(id, "start", 2);
    const c = useProjectStore.getState().project.tracks.video[0];
    expect(c.timelineStart).toBe(2);
    expect(c.trimIn).toBe(2);
    expect(c.trimOut).toBe(10);
  });

  it("recorta por el borde derecho ajustando trimOut", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = useProjectStore.getState().project.tracks.video[0].id;
    s.trimVideoClip(id, "end", 7);
    const c = useProjectStore.getState().project.tracks.video[0];
    expect(c.trimOut).toBeCloseTo(7);
    expect(c.timelineStart).toBe(0);
  });

  it("impone una duración mínima de 0.1s", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    const id = useProjectStore.getState().project.tracks.video[0].id;
    s.trimVideoClip(id, "end", 0.01);
    expect(useProjectStore.getState().project.tracks.video[0].trimOut).toBeCloseTo(0.1);
  });
});

describe("splitVideoAt y removeElement", () => {
  it("divide el clip bajo el instante dado", () => {
    const s = useProjectStore.getState();
    s.addVideoClip(clipInfo);
    s.splitVideoAt(4);
    const track = useProjectStore.getState().project.tracks.video;
    expect(track).toHaveLength(2);
    expect(track[0].trimOut).toBe(4);
    expect(track[1].timelineStart).toBe(4);
  });

  it("elimina un overlay de texto", () => {
    const s = useProjectStore.getState();
    s.addText(0);
    const id = useProjectStore.getState().project.tracks.text[0].id;
    s.removeElement("text", id);
    expect(useProjectStore.getState().project.tracks.text).toHaveLength(0);
  });
});

describe("historial", () => {
  it("undo/redo restauran snapshots", () => {
    const s = useProjectStore.getState();
    s.addText(0);
    s.addText(2);
    expect(useProjectStore.getState().project.tracks.text).toHaveLength(2);
    s.undo();
    expect(useProjectStore.getState().project.tracks.text).toHaveLength(1);
    s.undo();
    expect(useProjectStore.getState().project.tracks.text).toHaveLength(0);
    expect(useProjectStore.getState().canUndo()).toBe(false);
    s.redo();
    expect(useProjectStore.getState().project.tracks.text).toHaveLength(1);
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
    const id = useProjectStore.getState().project.tracks.text[0].id;
    s.beginTransaction();
    s.updateText(id, { x: 0.1 }, { transient: true });
    s.updateText(id, { x: 0.2 }, { transient: true });
    s.updateText(id, { x: 0.3 }, { transient: true });
    expect(useProjectStore.getState().project.tracks.text[0].x).toBe(0.3);
    s.undo(); // una sola entrada para todo el arrastre
    expect(useProjectStore.getState().project.tracks.text[0].x).toBe(0.5);
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
