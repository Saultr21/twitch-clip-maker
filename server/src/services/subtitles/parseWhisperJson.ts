import type { SubtitleCue, SubtitleWord } from "@clipforge/shared";

interface WhisperToken {
  text: string;
  offsets: { from: number; to: number };
}
interface WhisperSegment {
  offsets: { from: number; to: number };
  text: string;
  tokens: WhisperToken[];
}

/** Convierte la salida -ojf de whisper.cpp en cues (tiempo de ARCHIVO, segundos). */
export function parseWhisperJson(raw: string): SubtitleCue[] {
  const data = JSON.parse(raw) as { transcription?: WhisperSegment[] };
  const segments = data.transcription ?? [];
  const cues: SubtitleCue[] = [];

  segments.forEach((seg, i) => {
    const words: SubtitleWord[] = [];
    for (const tok of seg.tokens ?? []) {
      const t = tok.text;
      const piece = t.trim();
      // Descarta vacíos y anotaciones no-habla entre corchetes/paréntesis:
      // "[_BEG_]", " [Música]", "(aplausos)"… whisper las antepone con espacio,
      // por eso no basta con t.startsWith("[")
      if (piece === "" || /^[[(].*[\])]$/.test(piece)) continue;
      const startsWord = t.startsWith(" ");
      if (startsWord || words.length === 0) {
        words.push({ text: piece, start: tok.offsets.from / 1000, end: tok.offsets.to / 1000 });
      } else {
        // sub-palabra: se pega a la palabra anterior y extiende su fin
        const last = words[words.length - 1];
        last.text += piece;
        last.end = tok.offsets.to / 1000;
      }
    }
    // Las anotaciones no-habla a veces llegan partidas en varios tokens
    // ("(", "música", ")") y se reensamblan como una palabra: se filtran aquí.
    let cleaned = words.filter((w) => !/^[[(].*[\])]$/.test(w.text.trim()));
    // whisper antepone un guion de cambio de turno a la primera palabra
    if (cleaned.length > 0) {
      const first = cleaned[0].text.replace(/^[-–—]\s*/, "");
      cleaned = first === "" ? cleaned.slice(1) : [{ ...cleaned[0], text: first }, ...cleaned.slice(1)];
    }
    if (cleaned.length > 0) cues.push({ id: `cue-${i}`, words: cleaned });
  });

  return cues;
}
