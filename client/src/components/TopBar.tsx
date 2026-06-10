import { useProjectStore } from "../stores/projectStore";

export function TopBar() {
  const name = useProjectStore((s) => s.project.name);
  const renameProject = useProjectStore((s) => s.renameProject);
  const dirty = useProjectStore((s) => s.dirty);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  return (
    <header className="flex items-center gap-3 bg-surface border-b border-border px-4 py-2">
      <h1 className="text-base font-bold">
        Clip<span className="text-accent">Forge</span>
      </h1>
      <input
        value={name}
        onChange={(e) => renameProject(e.target.value)}
        aria-label="Nombre del proyecto"
        className="bg-transparent border border-transparent hover:border-border-2 focus:border-accent rounded-md px-2 py-0.5 text-xs text-muted focus:text-text outline-none w-48"
      />
      {dirty && (
        <span className="text-[10px] text-muted" title="Cambios sin guardar">
          ●
        </span>
      )}
      <div className="flex items-center gap-1 ml-2">
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Deshacer (Ctrl+Z)"
          title="Deshacer (Ctrl+Z)"
          className="text-muted hover:text-text disabled:opacity-40 px-1.5 text-sm"
        >
          ↩
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          aria-label="Rehacer (Ctrl+Y)"
          title="Rehacer (Ctrl+Y)"
          className="text-muted hover:text-text disabled:opacity-40 px-1.5 text-sm"
        >
          ↪
        </button>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled
          title="Disponible en breve (esta misma rama, Task 12)"
          className="text-xs text-muted border border-border-2 rounded-full px-3 py-1.5 disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          disabled
          title="Disponible en el Hito 3"
          className="text-xs font-semibold text-white rounded-full px-4 py-1.5 bg-gradient-to-r from-accent to-accent-dark disabled:opacity-50"
        >
          Exportar
        </button>
      </div>
    </header>
  );
}
