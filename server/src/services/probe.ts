import { execa } from "execa";
import { ffprobeBin } from "./binaries.js";

export async function probeVideo(
  file: string,
): Promise<{ duration: number; width: number; height: number }> {
  const { stdout } = await execa(ffprobeBin, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-show_entries", "format=duration",
    "-of", "json",
    file,
  ]);
  const data = JSON.parse(stdout) as {
    streams: Array<{ width: number; height: number }>;
    format: { duration: string };
  };
  const stream = data.streams[0];
  if (!stream) throw new Error("El archivo no contiene pista de vídeo");
  return {
    duration: parseFloat(data.format.duration),
    width: stream.width,
    height: stream.height,
  };
}
