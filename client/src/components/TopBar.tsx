export function TopBar() {
  return (
    <header className="flex items-center gap-3 bg-surface border-b border-border px-4 py-2">
      <h1 className="text-base font-bold">
        Clip<span className="text-accent">Forge</span>
      </h1>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled
          title="Disponible en el Hito 2"
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
