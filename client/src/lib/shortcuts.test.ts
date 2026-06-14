import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "@clipforge/shared";
import type { ClipInfo } from "@clipforge/shared";
import { handleShortcut } from "./shortcuts";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";

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

const deps = { seek: vi.fn(), togglePlay: vi.fn() };

function key(code: string, tagName = "BODY"): KeyboardEvent {
  return {
    code,
    key: code,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: { tagName, isContentEditable: false },
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

beforeEach(() => {
  useProjectStore.getState().loadProject(createEmptyProject("t"));
  useUiStore.getState().select(null);
  vi.clearAllMocks();
});

function selectFirstVideo(): void {
  useProjectStore.getState().addVideoClip(clipInfo);
  const id = useProjectStore.getState().project.tracks.video[0].id;
  useUiStore.getState().select({ kind: "video", id });
}

describe("handleShortcut · borrado", () => {
  it("Supr borra el elemento seleccionado aunque el foco esté en un botón (bloque del timeline)", () => {
    selectFirstVideo();
    handleShortcut(key("Delete", "BUTTON"), deps);
    expect(useProjectStore.getState().project.tracks.video).toHaveLength(0);
    expect(useUiStore.getState().selection).toBeNull();
  });

  it("no borra mientras se escribe en un input", () => {
    selectFirstVideo();
    handleShortcut(key("Delete", "INPUT"), deps);
    expect(useProjectStore.getState().project.tracks.video).toHaveLength(1);
  });
});

describe("handleShortcut · espacio", () => {
  it("Espacio sobre un botón enfocado no alterna la reproducción (activación nativa)", () => {
    handleShortcut(key("Space", "BUTTON"), deps);
    expect(deps.togglePlay).not.toHaveBeenCalled();
  });

  it("Espacio fuera de campos alterna la reproducción", () => {
    handleShortcut(key("Space", "BODY"), deps);
    expect(deps.togglePlay).toHaveBeenCalledOnce();
  });
});
