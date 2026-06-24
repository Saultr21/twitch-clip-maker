import { imageItems, textItems, allVideoClips } from "@clipforge/shared";
import type { MediaElement } from "@clipforge/shared";
import { saveNow } from "../features/projects/useAutosave";
import { useClipsStore } from "../stores/clipsStore";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";

const NUDGE = 0.005;
const NUDGE_FAST = 0.02;

/** Campos de texto: ningún atajo global debe robar la pulsación mientras se escribe. */
function isTextEntry(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  return (
    t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable
  );
}

/** Botón/enlace enfocado: solo Espacio/Enter los activan de forma nativa; el
 *  resto de atajos (Supr, flechas, Escape…) deben seguir funcionando, p. ej.
 *  borrar el bloque del timeline que acabas de seleccionar (queda enfocado). */
function isNativeActivation(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  return (t.tagName === "BUTTON" || t.tagName === "A") && (e.code === "Space" || e.code === "Enter");
}

interface ShortcutDeps {
  seek: (t: number) => void;
  togglePlay: () => void;
}

export function handleShortcut(e: KeyboardEvent, deps: ShortcutDeps): void {
  if (isTextEntry(e) || isNativeActivation(e)) return;
  const ui = useUiStore.getState();
  const store = useProjectStore.getState();

  // "?" (Shift+/ en la mayoría de layouts) abre la ayuda de atajos
  if (e.key === "?") {
    e.preventDefault();
    ui.setHelpOpen(true);
    return;
  }

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
    } else if (e.code === "KeyC") {
      e.preventDefault();
      const sel = ui.selection;
      if (!sel || sel.kind === "audio" || sel.kind === "subtitle") return;
      let found: MediaElement | undefined;
      if (sel.kind === "image") {
        found = imageItems(store.project).find((it) => it.id === sel.id) as MediaElement | undefined;
      } else if (sel.kind === "text") {
        found = textItems(store.project).find((it) => it.id === sel.id) as MediaElement | undefined;
      } else if (sel.kind === "video") {
        found = allVideoClips(store.project).find((it) => it.id === sel.id) as unknown as MediaElement | undefined;
      }
      if (found) ui.setClipboard({ ...found });
    } else if (e.code === "KeyV") {
      e.preventDefault();
      const item = ui.clipboard;
      if (!item) return;
      const playhead = ui.playhead;
      if (item.kind === "image") {
        const newId = store.addImage(item.assetId, item.fileName, playhead, item.width, item.height);
        store.updateImage(newId, {
          x: item.x,
          y: item.y,
          rotation: item.rotation,
          opacity: item.opacity,
          crop: item.crop,
        });
        ui.select({ kind: "image", id: newId });
      } else if (item.kind === "text") {
        const newId = store.addText(playhead);
        store.updateText(newId, {
          content: item.content,
          fontFamily: item.fontFamily,
          fontSize: item.fontSize,
          fill: item.fill,
          stroke: item.stroke,
          strokeWidth: item.strokeWidth,
          shadow: item.shadow,
          x: item.x,
          y: item.y,
          rotation: item.rotation,
          opacity: item.opacity,
        });
        ui.select({ kind: "text", id: newId });
      } else if (item.kind === "video") {
        const clip = useClipsStore.getState().clips.find((c) => c.id === item.clipId);
        if (!clip) return;
        store.addVideoClipAt(clip, playhead);
      }
    }
    return;
  }

  switch (e.code) {
    case "Escape":
      ui.select(null);
      return;
    case "Space":
      e.preventDefault();
      deps.togglePlay();
      return;
    case "KeyC": {
      const sel = ui.selection;
      const canCrop = sel?.kind === "image" || sel?.kind === "video";
      if (canCrop && !ui.cropMode) {
        e.preventDefault();
        ui.setCropMode(true);
      }
      return;
    }
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
    const o = textItems(store.project).find((t) => t.id === sel.id);
    if (o) store.updateText(sel.id, { x: clampN(o.x + dir[0] * step), y: clampN(o.y + dir[1] * step) });
  } else if (sel?.kind === "image") {
    const o = imageItems(store.project).find((i) => i.id === sel.id);
    if (o) store.updateImage(sel.id, { x: clampN(o.x + dir[0] * step), y: clampN(o.y + dir[1] * step) });
  } else if (dir[0] !== 0) {
    const fps = store.project.settings.fps;
    deps.seek(ui.playhead + dir[0] / fps);
  }
}

function clampN(n: number): number {
  return Math.min(1, Math.max(0, n));
}
