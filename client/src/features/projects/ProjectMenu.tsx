import { useEffect, useRef, useState } from "react";
import type { Project } from "@clipforge/shared";
import { createEmptyProject } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { saveNow } from "./useAutosave";
import { setLastProject } from "./lastProject";

interface ProjectEntry {
  name: string;
  updatedAt: string;
}

export function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/projects")
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      })
      .then((list: ProjectEntry[]) => setEntries(list))
      .catch(() => setError("No se pudo cargar la lista de proyectos"));
    const onClickOutside = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.code === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const load = async (name: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error();
      const project = (await res.json()) as Project;
      useProjectStore.getState().loadProject(project);
      setLastProject(name);
      useUiStore.getState().select(null);
      useUiStore.getState().setPlayhead(0);
      setOpen(false);
    } catch {
      setError(`No se pudo cargar «${name}»`);
    }
  };

  const createNew = async () => {
    try {
      await saveNow(); // no perder el actual
    } catch {
      // si falla el guardado seguimos: el usuario decidió crear uno nuevo
    }
    const fresh = createEmptyProject(`proyecto-${Date.now() % 100000}`);
    useProjectStore.getState().loadProject(fresh);
    setLastProject(fresh.name);
    useUiStore.getState().select(null);
    useUiStore.getState().setPlayhead(0);
    setOpen(false);
  };

  const remove = async (name: string) => {
    if (!window.confirm(`¿Borrar el proyecto «${name}»? Esta acción no se puede deshacer.`)) return;
    const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!res.ok) {
      setError(`No se pudo borrar «${name}»`);
      return;
    }
    setEntries((prev) => prev.filter((e) => e.name !== name));
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="text-xs text-muted border border-border-2 rounded-full px-3 py-1.5 hover:text-text"
      >
        Proyectos ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-64 bg-surface-2 border border-border-2 rounded-lg shadow-xl z-50 p-1.5 flex flex-col gap-0.5"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void createNew()}
            className="text-left text-xs text-accent-soft px-2 py-1.5 rounded-md hover:bg-surface-3"
          >
            + Nuevo proyecto
          </button>
          {error && <p role="alert" className="text-[11px] text-danger px-2">{error}</p>}
          {entries.length === 0 && !error && (
            <p className="text-[11px] text-muted px-2 py-1">No hay proyectos guardados.</p>
          )}
          {entries.map((e) => (
            <div key={e.name} className="flex items-center gap-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => void load(e.name)}
                className="flex-1 text-left text-xs px-2 py-1.5 rounded-md hover:bg-surface-3 truncate"
              >
                {e.name}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void remove(e.name)}
                aria-label={`Borrar proyecto ${e.name}`}
                className="text-muted hover:text-danger px-1.5"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
