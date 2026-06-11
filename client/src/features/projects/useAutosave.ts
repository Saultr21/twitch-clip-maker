import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../stores/projectStore";

export type SaveState = "saved" | "dirty" | "saving" | "error";

const AUTOSAVE_MS = 5000;

export function saveNow(): Promise<void> {
  const { project, markSaved } = useProjectStore.getState();
  return fetch(`/api/projects/${encodeURIComponent(project.name)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(project),
  }).then((res) => {
    if (!res.ok) throw new Error("Error al guardar");
    markSaved();
  });
}

/** Autoguardado: 5s después del último cambio. Devuelve el estado para la UI. */
export function useAutosave(): SaveState {
  const dirty = useProjectStore((s) => s.dirty);
  const [state, setState] = useState<SaveState>("saved");
  const timerRef = useRef(0);

  useEffect(() => {
    if (!dirty) {
      setState("saved");
      return;
    }
    setState("dirty");
    timerRef.current = window.setTimeout(() => {
      setState("saving");
      saveNow()
        .then(() => setState("saved"))
        .catch(() => setState("error"));
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timerRef.current);
  }, [dirty]);

  return state;
}
