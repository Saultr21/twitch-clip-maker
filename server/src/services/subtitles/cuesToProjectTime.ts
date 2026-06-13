import type { SubtitleCue, VideoClip } from "@clipforge/shared";

/** Lleva cues en tiempo de archivo al tiempo de proyecto del clip,
 *  descartando lo que cae fuera de [trimIn, trimOut]. */
export function cuesToProjectTime(cues: SubtitleCue[], clip: VideoClip): SubtitleCue[] {
  const toProject = (fileT: number) =>
    clip.timelineStart + (clamp(fileT, clip.trimIn, clip.trimOut) - clip.trimIn) / clip.speed;

  const out: SubtitleCue[] = [];
  for (const cue of cues) {
    const words = cue.words
      // descarta palabras totalmente fuera del recorte
      .filter((w) => w.end > clip.trimIn && w.start < clip.trimOut)
      .map((w) => ({ text: w.text, start: toProject(w.start), end: toProject(w.end) }))
      .filter((w) => w.end > w.start);
    if (words.length > 0) out.push({ ...cue, words });
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
