import { useEffect, useRef, useState } from "react";
import { useDialogStore } from "../stores/dialogStore";

/** Renderiza el diálogo activo (confirm/prompt) como modal in-app. Se monta una
 *  vez cerca de la raíz; las llamadas se hacen con confirmDialog/promptDialog. */
export function DialogHost() {
  const current = useDialogStore((s) => s.current);
  const close = useDialogStore((s) => s.close);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const isPrompt = current?.kind === "prompt";

  // al abrir: precarga el valor por defecto y enfoca el control principal
  useEffect(() => {
    if (!current) return;
    setText(isPrompt && "defaultValue" in current ? (current.defaultValue ?? "") : "");
    const t = setTimeout(() => (isPrompt ? inputRef.current?.select() : confirmRef.current?.focus()), 0);
    return () => clearTimeout(t);
  }, [current, isPrompt]);

  if (!current) return null;

  const cancel = () => close(isPrompt ? null : false);
  const accept = () => close(isPrompt ? text : true);

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={current.title ?? current.message}
        className="w-80 max-w-full bg-surface-2 border border-border-2 rounded-lg shadow-xl p-4 flex flex-col gap-3"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
      >
        {current.title && <h2 className="text-sm font-bold">{current.title}</h2>}
        <p className="text-xs text-muted whitespace-pre-wrap">{current.message}</p>

        {isPrompt && (
          <input
            ref={inputRef}
            value={text}
            placeholder={"placeholder" in current ? current.placeholder : undefined}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                accept();
              }
            }}
            aria-label={current.message}
            className="bg-surface border border-border-2 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
          />
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={cancel}
            className="text-xs text-muted border border-border-2 rounded-md px-3 py-1.5 hover:text-text"
          >
            {current.cancelLabel ?? "Cancelar"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={accept}
            className={`text-xs font-semibold text-white rounded-md px-3 py-1.5 ${
              current.danger ? "bg-danger hover:opacity-90" : "bg-gradient-to-r from-accent to-accent-dark"
            }`}
          >
            {current.confirmLabel ?? (isPrompt ? "Aceptar" : "Confirmar")}
          </button>
        </div>
      </div>
    </div>
  );
}
