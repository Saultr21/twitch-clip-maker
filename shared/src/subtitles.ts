import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const subtitleWordSchema = z.object({
  text: z.string(),
  start: z.number().min(0),
  end: z.number().min(0),
});

export const subtitleCueSchema = z.object({
  id: z.string().min(1),
  words: z.array(subtitleWordSchema).min(1),
});

export const subtitleStyleSchema = z.object({
  fontFamily: z.string().min(1),
  fontSize: z.number().min(0.01).max(0.3), // fracción de la altura del lienzo
  fill: hex,
  highlight: hex,
  stroke: z.string().regex(/^$|^#[0-9a-f]{6}$/i),
  strokeWidth: z.number().min(0).max(0.1),
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1),
  uppercase: z.boolean(),
  // resaltar la palabra activa con el color highlight
  wordHighlight: z.boolean().default(true),
  // pop de la palabra activa (breve aumento de tamaño al entrar)
  animate: z.boolean().default(false),
  // caja de fondo semitransparente detrás del bloque de texto
  boxBackground: z.boolean().default(false),
});

export const DEFAULT_SUBTITLE_STYLE = {
  fontFamily: "Impact",
  fontSize: 0.05,
  fill: "#ffffff",
  highlight: "#9146ff",
  stroke: "#000000",
  strokeWidth: 0.004,
  x: 0.5,
  y: 0.82,
  uppercase: true,
  wordHighlight: true,
  animate: false,
  boxBackground: false,
} as const;

export const subtitlesSchema = z
  .object({
    cues: z.array(subtitleCueSchema),
    style: subtitleStyleSchema,
    maxWordsPerCue: z.number().int().min(1).max(30).default(8),
  })
  .default({ cues: [], style: { ...DEFAULT_SUBTITLE_STYLE }, maxWordsPerCue: 8 });

export type SubtitleWord = z.infer<typeof subtitleWordSchema>;
export type SubtitleCue = z.infer<typeof subtitleCueSchema>;
export type SubtitleStyle = z.infer<typeof subtitleStyleSchema>;
export type Subtitles = z.infer<typeof subtitlesSchema>;

export function createSubtitleCue(words: SubtitleWord[]): SubtitleCue {
  return { id: globalThis.crypto.randomUUID(), words };
}
