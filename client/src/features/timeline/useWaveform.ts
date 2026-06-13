import { useEffect, useState } from "react";

export interface WaveformData {
  peaks: number[];
  duration: number;
}

export type WaveformKind = "clip" | "asset";

// Los picos son deterministas por archivo: una sola petición por (kind,fileName)
// para toda la vida de la página, compartida entre todos los bloques.
const cache = new Map<string, Promise<WaveformData>>();

function load(kind: WaveformKind, fileName: string): Promise<WaveformData> {
  const key = `${kind}/${fileName}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/waveform/${kind}/${encodeURIComponent(fileName)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`waveform ${r.status}`);
        return r.json() as Promise<WaveformData>;
      })
      .catch((err) => {
        cache.delete(key); // permite reintentar tras un fallo transitorio
        throw err;
      });
    cache.set(key, p);
  }
  return p;
}

/** Picos de amplitud del audio de un clip/asset, o null mientras carga/falla. */
export function useWaveform(kind: WaveformKind, fileName: string | undefined): WaveformData | null {
  const [data, setData] = useState<WaveformData | null>(null);
  useEffect(() => {
    if (!fileName) {
      setData(null);
      return;
    }
    let alive = true;
    load(kind, fileName)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [kind, fileName]);
  return data;
}
