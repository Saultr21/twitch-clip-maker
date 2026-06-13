import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClipInfo } from "@clipforge/shared";
import { addClip, listClips, removeClip } from "./clipsRegistry.js";

function makeClip(id: string): ClipInfo {
  return {
    id,
    url: `https://clips.twitch.tv/${id}`,
    title: `Clip ${id}`,
    fileName: `${id}.mp4`,
    duration: 28.5,
    width: 1920,
    height: 1080,
    createdAt: new Date().toISOString(),
  };
}

describe("clipsRegistry", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("devuelve lista vacía si no hay índice", () => {
    expect(listClips(dir)).toEqual([]);
  });

  it("añade un clip y lo persiste", () => {
    addClip(makeClip("a"), dir);
    expect(listClips(dir)).toHaveLength(1);
    expect(listClips(dir)[0].id).toBe("a");
  });

  it("añade los clips más recientes al principio", () => {
    addClip(makeClip("a"), dir);
    addClip(makeClip("b"), dir);
    expect(listClips(dir).map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("reemplaza un clip con el mismo id en lugar de duplicarlo", () => {
    addClip(makeClip("a"), dir);
    addClip({ ...makeClip("a"), title: "Actualizado" }, dir);
    expect(listClips(dir)).toHaveLength(1);
    expect(listClips(dir)[0].title).toBe("Actualizado");
  });

  it("removeClip quita la entrada y borra el archivo del vídeo", () => {
    const clip = makeClip("a");
    addClip(clip, dir);
    fs.writeFileSync(path.join(dir, clip.fileName), "x"); // vídeo simulado
    expect(removeClip("a", dir)).toBe(true);
    expect(listClips(dir)).toHaveLength(0);
    expect(fs.existsSync(path.join(dir, clip.fileName))).toBe(false);
  });

  it("removeClip devuelve false si el id no existe", () => {
    expect(removeClip("inexistente", dir)).toBe(false);
  });
});
