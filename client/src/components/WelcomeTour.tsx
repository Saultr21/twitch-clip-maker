import { useEffect, useState } from "react";
import { Clapperboard, Upload, Scissors, Captions, Download } from "lucide-react";

const SEEN_KEY = "clipforge:welcomed";

interface Step {
  Icon: typeof Clapperboard;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { Icon: Clapperboard, title: "Bienvenido a VideoForge", body: "Un editor de vídeo local: descarga vídeos de Twitch, YouTube, TikTok, Instagram o X (o usa los tuyos), edítalos y exporta para TikTok, Reels, Shorts o YouTube." },
  { Icon: Upload, title: "1 · Añade vídeo", body: "En Medios, pega una URL (Twitch, YouTube, TikTok, Instagram, X) o sube/arrastra un vídeo del escritorio. Luego doble clic (o arrástralo) para llevarlo a la línea de tiempo." },
  { Icon: Scissors, title: "2 · Edita", body: "Recorta y ordena clips, añade texto, imágenes y música, ajusta zoom/velocidad/filtros, elimina silencios y prueba el auto-reframe para vertical." },
  { Icon: Captions, title: "3 · Subtítulos", body: "Genera subtítulos automáticos (karaoke) desde el panel Subtítulos, edítalos y dales estilo. Puedes censurar palabrotas y animar la palabra activa." },
  { Icon: Download, title: "4 · Exporta", body: "Elige el formato arriba (9:16, 16:9, 1:1, 4:5) y pulsa Exportar: vídeo (MP4), un fotograma de portada (PNG) o un GIF." },
];

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // sin localStorage: no insistir
  }
}

/** Mini-tour de bienvenida, una sola vez (primer arranque). */
export function WelcomeTour() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!seen()) setOpen(true);
  }, []);

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // no-op
    }
    setOpen(false);
  };

  if (!open) return null;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        className="w-96 max-w-full bg-surface-2 border border-border-2 rounded-xl shadow-2xl p-5 flex flex-col gap-3"
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      >
        <step.Icon size={34} strokeWidth={1.5} aria-hidden="true" className="text-accent-soft" />
        <h2 className="text-sm font-bold">{step.title}</h2>
        <p className="text-xs text-muted">{step.body}</p>

        <div className="flex items-center gap-1.5 mt-1" aria-hidden="true">
          {STEPS.map((_, n) => (
            <span key={n} className={`h-1.5 rounded-full ${n === i ? "w-5 bg-accent" : "w-1.5 bg-border-2"}`} />
          ))}
        </div>

        <div className="flex justify-between items-center mt-1">
          <button type="button" onClick={close} className="text-[11px] text-muted hover:text-text">
            Saltar
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button
                type="button"
                onClick={() => setI((n) => n - 1)}
                className="text-xs text-muted border border-border-2 rounded-full px-3 py-1.5 hover:text-text"
              >
                Atrás
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={() => (last ? close() : setI((n) => n + 1))}
              className="text-xs font-semibold text-white rounded-full px-4 py-1.5 bg-gradient-to-r from-accent to-accent-dark"
            >
              {last ? "Empezar" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
