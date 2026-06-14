import { create } from "zustand";

interface BaseReq {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface ConfirmReq extends BaseReq {
  kind: "confirm";
}
interface PromptReq extends BaseReq {
  kind: "prompt";
  defaultValue?: string;
  placeholder?: string;
}

type ActiveDialog = (ConfirmReq | PromptReq) & { resolve: (value: boolean | string | null) => void };

interface DialogState {
  current: ActiveDialog | null;
  /** Resuelve el diálogo actual y lo cierra. */
  close: (value: boolean | string | null) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  current: null,
  close: (value) => {
    const cur = get().current;
    if (!cur) return;
    set({ current: null });
    cur.resolve(value);
  },
}));

/** Confirmación in-app (sustituye a window.confirm). Resuelve true/false. */
export function confirmDialog(opts: Omit<ConfirmReq, "kind">): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.setState({
      current: { kind: "confirm", ...opts, resolve: (v) => resolve(v === true) },
    });
  });
}

/** Entrada de texto in-app (sustituye a window.prompt). Resuelve el texto o null si se cancela. */
export function promptDialog(opts: Omit<PromptReq, "kind">): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogStore.setState({
      current: { kind: "prompt", ...opts, resolve: (v) => resolve(typeof v === "string" ? v : null) },
    });
  });
}
