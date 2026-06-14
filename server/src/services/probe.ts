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

/** Códecs de la 1.ª pista de vídeo y de audio (o null si no hay), para decidir
 *  si un vídeo subido es reproducible en el navegador o hay que transcodificarlo. */
export async function probeCodecs(
  file: string,
): Promise<{ video: string | null; audio: string | null }> {
  const { stdout } = await execa(ffprobeBin, [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name",
    "-of", "json",
    file,
  ]);
  const data = JSON.parse(stdout) as {
    streams: Array<{ codec_type: string; codec_name: string }>;
  };
  const find = (type: string) => data.streams.find((s) => s.codec_type === type)?.codec_name ?? null;
  return { video: find("video"), audio: find("audio") };
}
