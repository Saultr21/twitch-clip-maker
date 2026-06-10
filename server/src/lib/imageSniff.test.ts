import { describe, expect, it } from "vitest";
import { sniffImageExt } from "./imageSniff.js";

function bytes(...nums: number[]): Buffer {
  return Buffer.from(nums);
}

describe("sniffImageExt", () => {
  it("detecta PNG por su cabecera", () => {
    expect(sniffImageExt(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0))).toBe("png");
  });

  it("detecta JPEG", () => {
    expect(sniffImageExt(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe("jpg");
  });

  it("detecta GIF87a y GIF89a", () => {
    expect(sniffImageExt(Buffer.from("GIF87a000000"))).toBe("gif");
    expect(sniffImageExt(Buffer.from("GIF89a000000"))).toBe("gif");
  });

  it("detecta WebP (RIFF....WEBP)", () => {
    const b = Buffer.alloc(12);
    b.write("RIFF", 0);
    b.write("WEBP", 8);
    expect(sniffImageExt(b)).toBe("webp");
  });

  it("devuelve null para contenido no soportado (svg, exe, texto)", () => {
    expect(sniffImageExt(Buffer.from("<svg xmlns='x'/>"))).toBeNull();
    expect(sniffImageExt(bytes(0x4d, 0x5a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBeNull();
    expect(sniffImageExt(Buffer.from("hola mundo!!"))).toBeNull();
  });

  it("devuelve null si el buffer es demasiado corto", () => {
    expect(sniffImageExt(bytes(0x89, 0x50))).toBeNull();
  });
});
