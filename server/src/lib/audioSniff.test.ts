import { describe, expect, it } from "vitest";
import { sniffAudioExt } from "./audioSniff.js";

function bytes(...nums: number[]): Buffer {
  return Buffer.from(nums);
}

describe("sniffAudioExt", () => {
  it("detecta MP3 con cabecera ID3", () => {
    expect(sniffAudioExt(Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00\x00\x00"))).toBe("mp3");
  });

  it("detecta MP3 sin ID3 (frame sync 0xFFEx/0xFFFx)", () => {
    expect(sniffAudioExt(bytes(0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0))).toBe("mp3");
    expect(sniffAudioExt(bytes(0xff, 0xf3, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0))).toBe("mp3");
  });

  it("detecta WAV (RIFF....WAVE)", () => {
    const b = Buffer.alloc(12);
    b.write("RIFF", 0);
    b.write("WAVE", 8);
    expect(sniffAudioExt(b)).toBe("wav");
  });

  it("detecta OGG (OggS)", () => {
    expect(sniffAudioExt(Buffer.from("OggS\x00\x02\x00\x00\x00\x00\x00\x00"))).toBe("ogg");
  });

  it("devuelve null para imágenes, vídeo o texto", () => {
    expect(sniffAudioExt(bytes(0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0))).toBeNull();
    expect(sniffAudioExt(Buffer.from("hola mundo!!"))).toBeNull();
    expect(sniffAudioExt(bytes(0x00, 0x00))).toBeNull();
  });
});
