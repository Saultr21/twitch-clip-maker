import { saveNow } from "../features/projects/useAutosave";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";

const NUDGE = 0.005;
const NUDGE_FAST = 0.02;

function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  return (
    t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    t.isContentEditable
  );
}

interface ShortcutDeps {
  seek: (t: number) => void;
  togglePlay: () => void;
}

export function handleShortcut(e: KeyboardEvent, deps: ShortcutDeps): void {
  if (isEditableTarget(e)) return;
  const ui = useUiStore.getState();
  const store = useProjectStore.getState();

  // Edición con modificadores
  if (e.ctrlKey || e.metaKey) {
    if (e.code === "KeyZ" && e.shiftKey) {
      e.preventDefault();
      store.redo();
    } else if (e.code === "KeyZ") {
      e.preventDefault();
      store.undo();
    } else if (e.code === "KeyY") {
      e.preventDefault();
      store.redo();
    } else if (e.code === "KeyS") {
      e.preventDefault();
      void saveNow();
    }
    return;
  }

  switch (e.code) {
    case "Space":
      e.preventDefault();
      deps.togglePlay();
      return;
    case "KeyS":
      e.preventDefault();
      store.splitVideoAt(ui.playhead);
      return;
    case "Delete":
    case "Backspace": {
      if (!ui.selection) return;
      e.preventDefault();
      store.removeElement(ui.selection.kind, ui.selection.id);
      ui.select(null);
      return;
    }
  }

  // Flechas: nudge del overlay seleccionado o playhead
  const arrows: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const dir = arrows[e.code];
  if (!dir) return;
  e.preventDefault();
  const sel = ui.selection;
  const step = e.shiftKey ? NUDGE_FAST : NUDGE;

  if (sel?.kind === "text") {
    const o = store.project.tracks.text.find((t) => t.id === sel.id);
    if (o) store.updateText(sel.id, { x: clampN(o.x + dir[0] * step), y: clampN(o.y + dir[1] * step) });
  } else if (sel?.kind === "image") {
    const o = store.project.tracks.image.find((i) => i.id === sel.id);
    if (o) store.updateImage(sel.id, { x: clampN(o.x + dir[0] * step), y: clampN(o.y + dir[1] * step) });
  } else if (dir[0] !== 0) {
    const fps = store.project.settings.fps;
    deps.seek(ui.playhead + dir[0] / fps);
  }
}

function clampN(n: number): number {
  return Math.min(1, Math.max(0, n));
}
