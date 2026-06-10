import type { Project, VideoClip } from "@clipforge/shared";

export function clipDuration(c: VideoClip): number {
  return (c.trimOut - c.trimIn) / c.speed;
}

export function clipEnd(c: VideoClip): number {
  return c.timelineStart + clipDuration(c);
}

export function projectDuration(p: Project): number {
  const ends = [
    ...p.tracks.video.map(clipEnd),
    ...p.tracks.text.map((t) => t.end),
    ...p.tracks.image.map((i) => i.end),
    ...p.tracks.audio.map((a) => a.end),
  ];
  return ends.length ? Math.max(...ends) : 0;
}

/** Clip activo en el instante t (intervalo [start, end)). */
export function videoClipAt(track: VideoClip[], t: number): VideoClip | null {
  return track.find((c) => t >= c.timelineStart && t < clipEnd(c)) ?? null;
}

/** Tiempo del archivo fuente que corresponde al instante t de la línea. */
export function sourceTimeFor(c: VideoClip, t: number): number {
  return c.trimIn + (t - c.timelineStart) * c.speed;
}

export function hasOverlap(
  track: VideoClip[],
  start: number,
  duration: number,
  excludeId?: string,
): boolean {
  const end = start + duration;
  return track.some(
    (c) => c.id !== excludeId && start < clipEnd(c) && end > c.timelineStart,
  );
}

/** Puntos de imán: 0 y los bordes de todos los bloques de todas las pistas. */
export function findSnapPoints(p: Project, excludeId?: string): number[] {
  const points = new Set<number>([0]);
  for (const c of p.tracks.video) {
    if (c.id === excludeId) continue;
    points.add(c.timelineStart);
    points.add(clipEnd(c));
  }
  for (const list of [p.tracks.text, p.tracks.image, p.tracks.audio]) {
    for (const o of list) {
      if (o.id === excludeId) continue;
      points.add(o.start);
      points.add(o.end);
    }
  }
  return [...points];
}

export function snapTime(t: number, points: number[], threshold: number): number {
  let best = t;
  let bestDist = threshold;
  for (const point of points) {
    const dist = Math.abs(point - t);
    if (dist < bestDist) {
      best = point;
      bestDist = dist;
    }
  }
  return best;
}

/** Divide un clip en el instante t de la línea de tiempo. */
export function splitVideoClip(c: VideoClip, t: number): [VideoClip, VideoClip] {
  if (t <= c.timelineStart || t >= clipEnd(c)) {
    throw new Error("El punto de corte cae fuera del bloque");
  }
  const cutSource = sourceTimeFor(c, t);
  const left: VideoClip = { ...c, trimOut: cutSource };
  const right: VideoClip = {
    ...c,
    id: globalThis.crypto.randomUUID(),
    timelineStart: t,
    trimIn: cutSource,
  };
  return [left, right];
}
