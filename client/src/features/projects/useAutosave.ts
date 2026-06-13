import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { setLastProject } from "./lastProject";

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
    setLastProject(project.name); // recordar para restaurar la sesión al arrancar
  });
}

/** Protege el cierre/ocultado de la pestaña: vacía cambios pendientes y avisa. */
export function useUnloadGuard(): void {
  useEffect(() => {
    // al ocultar la pestaña (cambio de app, cierre inminente) vacía lo pendiente:
    // visibilitychange es más fiable que beforeunload para disparar el guardado
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && useProjectStore.getState().dirty) {
        void saveNow().catch(() => {});
      }
    };
    // aviso nativo si aún quedan cambios sin guardar al intentar cerrar
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useProjectStore.getState().dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);
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
