export type ImageExt = "png" | "jpg" | "gif" | "webp";

/** Detecta el tipo real de imagen por magic bytes. SVG queda excluido a propósito (XSS). */
export function sniffImageExt(buf: Buffer): ImageExt | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  const ascii = buf.subarray(0, 12).toString("latin1");
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "webp";
  return null;
}
