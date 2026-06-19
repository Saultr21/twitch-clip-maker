import type { SubtitleCue, SubtitleWord } from "@clipforge/shared";

export function cueStart(c: SubtitleCue): number {
  return c.words[0].start;
}

export function cueEnd(c: SubtitleCue): number {
  return c.words[c.words.length - 1].end;
}

/** Índice de la palabra cuyo [start,end) contiene t, o -1. */
export function activeWordIndex(c: SubtitleCue, t: number): number {
  return c.words.findIndex((w) => t >= w.start && t < w.end);
}

/** Desplaza todas las palabras por delta (sin bajar de 0). */
export function shiftCueWords(c: SubtitleCue, delta: number): SubtitleCue {
  return {
    ...c,
    words: c.words.map((w) => ({
      text: w.text,
      start: Math.max(0, w.start + delta),
      end: Math.max(0, w.end + delta),
    })),
  };
}

/** Remapea linealmente los tiempos de las palabras al rango [newStart,newEnd]. */
export function scaleCueWords(c: SubtitleCue, newStart: number, newEnd: number): SubtitleCue {
  const oldStart = cueStart(c);
  const oldEnd = cueEnd(c);
  const span = oldEnd - oldStart || 1;
  const factor = (newEnd - newStart) / span;
  const map = (t: number) => newStart + (t - oldStart) * factor;
  return { ...c, words: c.words.map((w) => ({ text: w.text, start: map(w.start), end: map(w.end) })) };
}

/** Parte cues con más de maxWords palabras en trozos de maxWords conservando los tiempos.
 *  El último word de cada chunk se extiende hasta el start del chunk siguiente para evitar
 *  huecos de tiempo donde ningún chunk estaría activo (pausa mid-sentence de whisper). */
export function splitCuesToMaxWords(cues: SubtitleCue[], maxWords: number): SubtitleCue[] {
  const n = Number.isFinite(maxWords) && maxWords >= 1 ? Math.floor(maxWords) : null;
  if (n === null) return cues;
  const out: SubtitleCue[] = [];
  for (const cue of cues) {
    const chunks: SubtitleCue[] = [];
    for (let i = 0; i < cue.words.length; i += n) {
      chunks.push({ id: `${cue.id}-${i}`, words: cue.words.slice(i, i + n) });
    }
    // Cierra huecos entre chunks del mismo cue original: extiende el end del último word
    // de cada chunk hasta el start del siguiente, para que el subtítulo no parpadee.
    for (let ci = 0; ci < chunks.length - 1; ci++) {
      const words = chunks[ci].words;
      const last = words[words.length - 1];
      const nextStart = chunks[ci + 1].words[0].start;
      if (last.end < nextStart) {
        chunks[ci] = { ...chunks[ci], words: [...words.slice(0, -1), { ...last, end: nextStart }] };
      }
    }
    out.push(...chunks);
  }
  return out;
}

/** Reparte el rango actual de la cue equitativamente entre las palabras del texto nuevo. */
export function redistributeWordTimes(c: SubtitleCue, text: string): SubtitleCue {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const start = cueStart(c);
  const end = cueEnd(c);
  if (tokens.length === 0) {
    return { ...c, words: [{ text: "", start, end }] };
  }
  const step = (end - start) / tokens.length;
  const words: SubtitleWord[] = tokens.map((t, i) => ({
    text: t,
    start: start + i * step,
    end: i === tokens.length - 1 ? end : start + (i + 1) * step,
  }));
  return { ...c, words };
}
