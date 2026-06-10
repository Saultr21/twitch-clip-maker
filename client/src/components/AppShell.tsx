import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";

export function AppShell() {
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <ToolRail />
        <main className="flex flex-1 min-w-0">
          <div className="flex-1 grid place-items-center text-muted text-sm">
            Panel de medios (Task 9)
          </div>
        </main>
        <aside
          aria-label="Propiedades"
          className="w-72 bg-surface border-l border-border p-3 text-xs text-muted"
        >
          Propiedades — Hito 2
        </aside>
      </div>
      <footer className="h-36 bg-surface border-t border-border grid place-items-center text-xs text-muted">
        Línea de tiempo — Hito 2
      </footer>
    </div>
  );
}
