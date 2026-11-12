import { BitmapText, Cache, NineSliceSprite, Rectangle, Sprite, Spritesheet, Texture, TextureSource, TilingSprite } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPixiRenderer } from "./renderer.js";

const cached: string[] = [];
const put = (alias: string, value: unknown) => {
  Cache.set(alias, value);
  cached.push(alias);
};
afterEach(() => {
  while (cached.length) Cache.remove(cached.pop()!);
  vi.restoreAllMocks();
});

const texture = () => new Texture({ source: new TextureSource({ width: 8, height: 8 }), frame: new Rectangle(0, 0, 8, 8) });

describe("[texture] strings", () => {
  it("resolve synchronously from Pixi's cache on sprite, tiling-sprite and nine-slice-sprite", () => {
    const r = createPixiRenderer();
    const tex = texture();
    put("ship", tex);
    for (const tag of ["sprite", "tiling-sprite", "nine-slice-sprite"] as const) {
      const node = r.createElement(tag, null) as Sprite | TilingSprite | NineSliceSprite;
      r.setProperty(node, "texture", "ship");
      expect(node.texture).toBe(tex);
    }
  });

  it("works as a static attribute", () => {
    const r = createPixiRenderer();
    const tex = texture();
    put("logo", tex);
    const node = r.createElement("sprite", null) as Sprite;
    r.setAttribute(node, "texture", "logo");
    expect(node.texture).toBe(tex);
  });

  it("still accepts a Texture built in code", () => {
    const r = createPixiRenderer();
    const tex = texture();
    const node = r.createElement("sprite", null) as Sprite;
    r.setProperty(node, "texture", tex);
    expect(node.texture).toBe(tex);
  });

  it("warns naming the alias and the renderer when not loaded, and shows an empty texture", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = createPixiRenderer();
    const node = r.createElement("sprite", null) as Sprite;
    r.setProperty(node, "texture", "missing-alias");
    expect(node.texture).toBe(Texture.EMPTY);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/missing-alias.*"pixi"|"pixi".*missing-alias/);
  });

  it("warns when the alias is cached but is not a texture", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    put("not-tex", { some: "json" });
    const r = createPixiRenderer();
    const node = r.createElement("sprite", null) as Sprite;
    r.setProperty(node, "texture", "not-tex");
    expect(node.texture).toBe(Texture.EMPTY);
    expect(String(warn.mock.calls[0]![0])).toContain("not-tex");
  });

  it("never destroys a cached texture when its node is destroyed", () => {
    const r = createPixiRenderer();
    const tex = texture();
    put("keep", tex);
    const node = r.createElement("sprite", null) as Sprite;
    r.setProperty(node, "texture", "keep");
    r.remove(node);
    node.destroy({ children: true });
    expect(tex.destroyed).toBe(false);
  });
});

describe("spritesheets and bitmap fonts from bundle entries", () => {
  it("resolves a spritesheet frame name the way the loader registers it", async () => {
    const sheet = new Spritesheet(texture(), {
      frames: { "hero/idle_0": { frame: { x: 0, y: 0, w: 4, h: 4 } }, "hero/idle_1": { frame: { x: 4, y: 0, w: 4, h: 4 } } },
      meta: { scale: 1 },
    });
    await sheet.parse();
    // Pixi's spritesheet loader parser registers each frame in the cache by name.
    for (const [name, tex] of Object.entries(sheet.textures)) put(name, tex);
    const r = createPixiRenderer();
    const node = r.createElement("sprite", null) as Sprite;
    r.setAttribute(node, "texture", "hero/idle_1");
    expect(node.texture).toBe(sheet.textures["hero/idle_1"]);
    expect(node.texture.frame.x).toBe(4);
  });

  it("passes fontFamily through to bitmap-text so a loaded bitmap font is used by name", () => {
    const r = createPixiRenderer();
    const node = r.createElement("bitmap-text", null) as BitmapText;
    r.setAttribute(node, "fontFamily", "PixelFont");
    expect(node.style.fontFamily).toBe("PixelFont");
  });
});
