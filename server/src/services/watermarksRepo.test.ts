import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addWatermark, listWatermarks, removeWatermark } from "./watermarksRepo.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-wm-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("watermarksRepo", () => {
  it("lista vacío sin índice", () => {
    expect(listWatermarks(dir)).toEqual([]);
  });

  it("añade y persiste, más reciente primero", () => {
    addWatermark({ id: "a", fileName: "a.png", name: "Logo A", createdAt: "2026-01-01T00:00:00Z" }, dir);
    addWatermark({ id: "b", fileName: "b.png", name: "Logo B", createdAt: "2026-01-02T00:00:00Z" }, dir);
    expect(listWatermarks(dir).map((w) => w.id)).toEqual(["b", "a"]);
  });

  it("elimina por id", () => {
    addWatermark({ id: "a", fileName: "a.png", name: "Logo A", createdAt: "2026-01-01T00:00:00Z" }, dir);
    removeWatermark("a", dir);
    expect(listWatermarks(dir)).toEqual([]);
  });
});
