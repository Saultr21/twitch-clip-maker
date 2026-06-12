export type AudioExt = "mp3" | "wav" | "ogg";

/** Detecta el tipo real de audio por magic bytes (allowlist cerrada). */
export function sniffAudioExt(buf: Buffer): AudioExt | null {
  if (buf.length < 12) return null;
  const ascii = buf.subarray(0, 12).toString("latin1");
  if (ascii.startsWith("ID3")) return "mp3";
  // frame sync MPEG: 0xFF seguido de 0xE0..0xFF en los 3 bits altos
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE") return "wav";
  if (ascii.startsWith("OggS")) return "ogg";
  return null;
}
