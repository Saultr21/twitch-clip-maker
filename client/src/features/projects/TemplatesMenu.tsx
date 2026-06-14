import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { presetSchema, projectToPreset } from "@clipforge/shared";
import { useProjectStore } from "../../stores/projectStore";
import { confirmDialog, promptDialog } from "../../stores/dialogStore";

interface PresetEntry {
  name: string;
  updatedAt: string;
}

export function TemplatesMenu() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<PresetEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/presets")
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      })
      .then((list: PresetEntry[]) => setEntries(list))
      .catch(() => setError("No se pudo cargar la lista de plantillas"));
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

  const saveCurrent = async () => {
    const name = await promptDialog({ title: "Plantilla", message: "Nombre de la plantilla:" });
    if (!name?.trim()) return;
    const preset = projectToPreset(name.trim(), useProjectStore.getState().project);
    const res = await fetch(`/api/presets/${encodeURIComponent(name.trim())}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(preset),
    });
    if (!res.ok) setError("No se pudo guardar la plantilla");
    else setOpen(false);
  };

  const apply = async (name: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/presets/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error();
      // valida la respuesta antes de aplicarla: una plantilla corrupta no debe
      // romper el proyecto en curso
      const parsed = presetSchema.safeParse(await res.json());
      if (!parsed.success) throw new Error();
      useProjectStore.getState().applyPreset(parsed.data);
      setOpen(false);
    } catch {
      setError(`No se pudo aplicar «${name}»`);
    }
  };

  const remove = async (name: string) => {
    if (!(await confirmDialog({ message: `¿Borrar la plantilla «${name}»?`, danger: true }))) return;
    const res = await fetch(`/api/presets/${encodeURIComponent(name)}`, { method: "DELETE" });
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
        className="flex items-center gap-1 text-xs text-muted border border-border-2 rounded-full px-3 py-1.5 hover:text-text"
      >
        Plantillas
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-64 bg-surface-2 border border-border-2 rounded-lg shadow-xl z-50 p-1.5 flex flex-col gap-0.5"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void saveCurrent()}
            className="flex items-center gap-1.5 text-left text-xs text-accent-soft px-2 py-1.5 rounded-md hover:bg-surface-3"
          >
            <Plus size={14} aria-hidden="true" />
            Guardar la actual como plantilla
          </button>
          {error && <p role="alert" className="text-[11px] text-danger px-2">{error}</p>}
          {entries.length === 0 && !error && (
            <p className="text-[11px] text-muted px-2 py-1">No hay plantillas guardadas.</p>
          )}
          {entries.map((e) => (
            <div key={e.name} className="flex items-center gap-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => void apply(e.name)}
                className="flex-1 text-left text-xs px-2 py-1.5 rounded-md hover:bg-surface-3 truncate"
              >
                {e.name}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void remove(e.name)}
                aria-label={`Borrar plantilla ${e.name}`}
                className="text-muted hover:text-danger px-1.5"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
