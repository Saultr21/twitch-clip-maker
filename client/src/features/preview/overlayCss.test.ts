import { describe, expect, it } from "vitest";
import { imageOverlayStyle, imageInnerStyle, textOverlayStyle } from "./overlayCss";
import type { ImageOverlay, TextOverlay } from "@clipforge/shared";

// Helper factories
function makeImage(overrides: Partial<ImageOverlay> = {}): ImageOverlay {
  return {
    id: "img-1",
    assetId: "asset-1",
    fileName: "photo.jpg",
    x: 0.5,
    y: 0.5,
    width: 0.4,
    height: 0.3,
    crop: null,
    rotation: 0,
    opacity: 1,
    start: 0,
    end: 4,
    ...overrides,
  };
}

function makeText(overrides: Partial<TextOverlay> = {}): TextOverlay {
  return {
    id: "txt-1",
    content: "Hola",
    fontFamily: "Segoe UI",
    fontSize: 0.06,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 0,
    shadow: false,
    x: 0.5,
    y: 0.5,
    rotation: 0,
    opacity: 1,
    start: 0,
    end: 4,
    ...overrides,
  };
}

const W = 1080;
const H = 1920;

describe("imageOverlayStyle", () => {
  it("posiciona el contenedor en left=x*W, top=y*H", () => {
    const s = imageOverlayStyle(makeImage({ x: 0.3, y: 0.7 }), W, H);
    expect(s.left).toBe(0.3 * W);
    expect(s.top).toBe(0.7 * H);
  });

  it("calcula width y height en px desde valores normalizados", () => {
    const s = imageOverlayStyle(makeImage({ width: 0.4, height: 0.3 }), W, H);
    expect(s.width).toBe(0.4 * W);
    expect(s.height).toBe(0.3 * H);
  });

  it("genera transform con translate(-50%,-50%) y rotación", () => {
    const s = imageOverlayStyle(makeImage({ rotation: 45 }), W, H);
    expect(s.transform).toBe("translate(-50%, -50%) rotate(45deg)");
  });

  it("aplica opacity del overlay", () => {
    const s = imageOverlayStyle(makeImage({ opacity: 0.6 }), W, H);
    expect(s.opacity).toBe(0.6);
  });

  it("sin crop: sin overflow hidden", () => {
    const s = imageOverlayStyle(makeImage({ crop: null }), W, H);
    expect(s.overflow).toBeUndefined();
  });

  it("con crop: overflow hidden en el contenedor", () => {
    const s = imageOverlayStyle(
      makeImage({ crop: { x: 0.25, y: 0, w: 0.5, h: 1 } }),
      W,
      H,
    );
    expect(s.overflow).toBe("hidden");
  });

  it("posición es absolute", () => {
    const s = imageOverlayStyle(makeImage(), W, H);
    expect(s.position).toBe("absolute");
  });
});

describe("imageInnerStyle — sin crop", () => {
  it("la imagen interna llena el contenedor", () => {
    const s = imageInnerStyle(makeImage({ crop: null }), W, H);
    expect(s.width).toBe("100%");
    expect(s.height).toBe("100%");
  });
});

describe("imageInnerStyle — con crop", () => {
  it("la imagen se expande al frame completo: width = containerW / cw", () => {
    const crop = { x: 0.25, y: 0, w: 0.5, h: 1 };
    const img = makeImage({ width: 0.4, height: 0.3, crop });
    const s = imageInnerStyle(img, W, H);
    const containerW = img.width * W;
    expect(s.width).toBeCloseTo(containerW / crop.w);
  });

  it("la imagen se desplaza a la izquierda: left = -(cx/cw)*containerW", () => {
    const crop = { x: 0.25, y: 0, w: 0.5, h: 1 };
    const img = makeImage({ width: 0.4, height: 0.3, crop });
    const s = imageInnerStyle(img, W, H);
    const containerW = img.width * W;
    expect(s.left).toBeCloseTo(-((crop.x / crop.w) * containerW));
  });

  it("maxWidth none para que la imagen no quede limitada por el contenedor", () => {
    const s = imageInnerStyle(
      makeImage({ crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }),
      W,
      H,
    );
    expect(s.maxWidth).toBe("none");
  });
});

describe("textOverlayStyle", () => {
  it("posiciona en left=x*W, top=y*H", () => {
    const s = textOverlayStyle(makeText({ x: 0.3, y: 0.7 }), W, H);
    expect(s.left).toBe(0.3 * W);
    expect(s.top).toBe(0.7 * H);
  });

  it("fontSize = overlay.fontSize * H", () => {
    const s = textOverlayStyle(makeText({ fontSize: 0.06 }), W, H);
    expect(s.fontSize).toBeCloseTo(0.06 * H);
  });

  it("genera transform con translate(-50%,-50%) y rotación", () => {
    const s = textOverlayStyle(makeText({ rotation: 30 }), W, H);
    expect(s.transform).toBe("translate(-50%, -50%) rotate(30deg)");
  });

  it("color = fill del overlay", () => {
    const s = textOverlayStyle(makeText({ fill: "#ff0000" }), W, H);
    expect(s.color).toBe("#ff0000");
  });

  it("sin stroke: WebkitTextStroke es undefined", () => {
    const s = textOverlayStyle(makeText({ strokeWidth: 0 }), W, H);
    expect(s.WebkitTextStroke).toBeUndefined();
  });

  it("con stroke: WebkitTextStroke = strokeWidth*H + 'px ' + stroke", () => {
    const s = textOverlayStyle(
      makeText({ strokeWidth: 0.005, stroke: "#000000" }),
      W,
      H,
    );
    const expectedPx = 0.005 * H;
    expect(s.WebkitTextStroke).toBe(`${expectedPx}px #000000`);
  });

  it("shadow=false: sin text-shadow", () => {
    const s = textOverlayStyle(makeText({ shadow: false }), W, H);
    expect(s.textShadow).toBeUndefined();
  });

  it("shadow=true: text-shadow contiene blur~fontSize*0.15 y rgba(0,0,0,0.8)", () => {
    const overlay = makeText({ shadow: true, fontSize: 0.06 });
    const s = textOverlayStyle(overlay, W, H);
    const fontSize = overlay.fontSize * H;
    const expectedBlur = fontSize * 0.15;
    expect(s.textShadow).toContain(`${expectedBlur}px`);
    expect(s.textShadow).toContain("rgba(0,0,0,0.8)");
  });

  it("opacity aplicada", () => {
    const s = textOverlayStyle(makeText({ opacity: 0.7 }), W, H);
    expect(s.opacity).toBe(0.7);
  });

  it("whiteSpace nowrap", () => {
    const s = textOverlayStyle(makeText(), W, H);
    expect(s.whiteSpace).toBe("nowrap");
  });

  it("pointerEvents none", () => {
    const s = textOverlayStyle(makeText(), W, H);
    expect(s.pointerEvents).toBe("none");
  });
});
