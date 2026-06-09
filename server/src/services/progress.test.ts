import { describe, expect, it } from "vitest";
import { parseYtDlpProgress } from "./progress.js";

describe("parseYtDlpProgress", () => {
  it("extrae el porcentaje de una línea de descarga", () => {
    expect(
      parseYtDlpProgress("[download]  45.2% of 12.34MiB at 2.50MiB/s ETA 00:03"),
    ).toBe(45.2);
  });

  it("extrae 100% al completar", () => {
    expect(parseYtDlpProgress("[download] 100% of 12.34MiB in 00:05")).toBe(100);
  });

  it("devuelve null para líneas sin progreso", () => {
    expect(parseYtDlpProgress("[twitch] Extracting clip info")).toBeNull();
    expect(parseYtDlpProgress("")).toBeNull();
  });

  it("limita valores anómalos a 100", () => {
    expect(parseYtDlpProgress("[download] 100.8% of ~10MiB")).toBe(100);
  });
});
