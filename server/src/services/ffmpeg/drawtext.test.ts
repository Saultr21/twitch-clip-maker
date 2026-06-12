import { describe, expect, it } from "vitest";
import { createTextOverlay } from "@clipforge/shared";
import { drawtextFilter, drawtextFilterCentered, escapeDrawtextText, fontFileFor } from "./drawtext.js";

describe("escapeDrawtextText", () => {
  it("escapa los caracteres especiales de drawtext", () => {
    expect(escapeDrawtextText("a:b")).toBe("a\\:b");
    // la comilla simple rompería el quoting del parser de filtros:
    // se sustituye por el apóstrofo tipográfico (visualmente idéntico)
    expect(escapeDrawtextText("it's")).toBe("it’s");
    expect(escapeDrawtextText("a\\b")).toBe("a\\\\b");
    expect(escapeDrawtextText("100%")).toBe("100%");
  });

  it("el filtro desactiva la expansión %{...} (texto siempre literal)", () => {
    expect(escapeDrawtextText("%{pts}")).toBe("%{pts}");
  });

  it("convierte saltos de línea en saltos reales de drawtext", () => {
    expect(escapeDrawtextText("hola\nmundo")).toBe("hola\\nmundo");
  });
});

describe("fontFileFor", () => {
  it("mapea las familias conocidas a TTF de Windows con la ruta escapada", () => {
    expect(fontFileFor("Arial")).toBe("C\\:/Windows/Fonts/arial.ttf");
    expect(fontFileFor("Impact")).toBe("C\\:/Windows/Fonts/impact.ttf");
    expect(fontFileFor("Segoe UI")).toBe("C\\:/Windows/Fonts/segoeui.ttf");
  });

  it("cae a Segoe UI si la familia no está en el mapa", () => {
    expect(fontFileFor("Comic Neue")).toBe("C\\:/Windows/Fonts/segoeui.ttf");
  });
});

describe("drawtextFilter", () => {
  const base = { ...createTextOverlay(2), id: "t1", content: "Hola", x: 0.5, y: 0.25 };

  it("genera el filtro completo centrado con enable", () => {
    const f = drawtextFilter({ ...base, fontFamily: "Arial", fontSize: 0.05, fill: "#ffffff", opacity: 1, strokeWidth: 0, shadow: false, end: 6 }, 1080, 1920);
    expect(f).toContain("fontfile='C\\:/Windows/Fonts/arial.ttf'");
    expect(f).toContain("text='Hola'");
    expect(f).toContain("expansion=none");
    expect(f).toContain("fontsize=96"); // 0.05·1920
    expect(f).toContain("fontcolor=0xffffff@1");
    expect(f).toContain("x=540-text_w/2");
    expect(f).toContain("y=480-text_h/2");
    expect(f).toContain("enable='between(t,2,6)'");
    expect(f).not.toContain("borderw");
    expect(f).not.toContain("shadowcolor");
  });

  it("añade borde y sombra cuando procede", () => {
    const f = drawtextFilter(
      { ...base, stroke: "#000000", strokeWidth: 0.005, shadow: true, opacity: 0.8 },
      1080,
      1920,
    );
    expect(f).toContain("borderw=10"); // 0.005·1920 redondeado
    expect(f).toContain("bordercolor=0x000000@0.8");
    expect(f).toContain("shadowcolor=black@0.64"); // 0.8·0.8
    expect(f).toContain("shadowx=3");
  });
});

describe("drawtextFilterCentered", () => {
  const base = { ...createTextOverlay(2), id: "t1", content: "Hola", x: 0.5, y: 0.25 };

  it("centra en la capa y no lleva enable (lo pone el overlay)", () => {
    const f = drawtextFilterCentered({ ...base, content: "Giro" }, 1080, 1920);
    expect(f).toContain("text='Giro'");
    expect(f).toContain("x=(w-text_w)/2");
    expect(f).toContain("y=(h-text_h)/2");
    expect(f).not.toContain("enable=");
  });
});
