import type { SubtitleCue } from "@clipforge/shared";

// Lista modesta de palabrotas (ES + algunas EN). Se censura por palabra completa.
const PROFANITY = new Set([
  "puta", "putas", "puto", "putos", "mierda", "joder", "joder", "cabron", "cabrón",
  "cabrones", "gilipollas", "coño", "polla", "pollas", "follar", "hostia", "hostias",
  "capullo", "zorra", "cojones", "pendejo", "verga", "chinga", "chingar", "marica",
  "maricon", "maricón", "subnormal", "imbecil", "imbécil", "fuck", "fucking", "shit",
  "bitch", "asshole", "dick", "cunt",
]);

/** Censura un token si su núcleo de letras es una palabrota, conservando la
 *  puntuación y la mayúscula inicial: "Mierda!" → "M*****!". */
export function censorWord(token: string): string {
  const m = /^([^\p{L}\p{N}]*)(\p{L}[\p{L}\p{N}]*)([^\p{L}\p{N}]*)$/u.exec(token);
  if (!m) return token;
  const [, pre, core, post] = m;
  if (!PROFANITY.has(core.toLowerCase())) return token;
  const censored = core.length <= 1 ? core : core[0] + "*".repeat(core.length - 1);
  return pre + censored + post;
}

/** Aplica la censura a todas las palabras de las cues. */
export function censorCues(cues: SubtitleCue[]): SubtitleCue[] {
  return cues.map((c) => ({
    ...c,
    words: c.words.map((w) => ({ ...w, text: censorWord(w.text) })),
  }));
}
