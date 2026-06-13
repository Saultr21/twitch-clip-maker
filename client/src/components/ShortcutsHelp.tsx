import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useUiStore } from "../stores/uiStore";

const SHORTCUTS: Array<[string, string]> = [
  ["Espacio", "Reproducir / pausar"],
  ["S", "Dividir el clip en el playhead"],
  ["Supr / Retroceso", "Eliminar el elemento seleccionado"],
  ["Ctrl+Z / Ctrl+Y", "Deshacer / rehacer"],
  ["Ctrl+S", "Guardar el proyecto"],
  ["Flechas", "Mover el overlay seleccionado (Shift acelera)"],
  ["← →", "Sin selección: playhead fotograma a fotograma"],
  ["Escape", "Deseleccionar / cerrar menús"],
  ["?", "Esta ayuda"],
];

export function ShortcutsHelp() {
  const open = useUiStore((s) => s.helpOpen);
  const setOpen = useUiStore((s) => s.setHelpOpen);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/60 grid place-items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.code === "Escape") setOpen(false);
        }}
        className="w-96 bg-surface-2 border border-border-2 rounded-xl p-4 flex flex-col gap-3 shadow-2xl outline-none"
      >
        <h2 id="shortcuts-title" className="text-sm font-bold">Atajos de teclado</h2>
        <table className="text-xs">
          <tbody>
            {SHORTCUTS.map(([key, desc]) => (
              <tr key={key} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-3 font-mono text-accent-soft whitespace-nowrap">{key}</td>
                <td className="py-1.5 text-muted">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-muted border border-border-2 rounded-full px-3 py-1.5 hover:text-text"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
