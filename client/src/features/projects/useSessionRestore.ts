import { useEffect } from "react";
import type { Project } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { getLastProject } from "./lastProject";

/** Al arrancar, reabre el último proyecto editado (autoguardado en el server). */
export function useSessionRestore(): void {
  useEffect(() => {
    const name = getLastProject();
    if (!name) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(name)}`);
        if (!res.ok) return; // borrado o aún sin guardar: se queda el proyecto vacío
        const project = (await res.json()) as Project;
        // no pisar el trabajo si el usuario ya empezó a editar antes de resolver
        if (!alive || useProjectStore.getState().dirty) return;
        useProjectStore.getState().loadProject(project);
        useUiStore.getState().select(null);
        useUiStore.getState().setPlayhead(0);
      } catch {
        // sin conexión o respuesta inválida: arranque normal con proyecto vacío
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
}
