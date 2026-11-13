import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SCENE_EVENTS,
  SCENE_TAGS,
  SHAPE_TAGS,
  convertStaticAttribute,
  propertiesOf,
  resolveProperty,
  type SceneEventName,
} from "./elements.js";

describe("tag table coverage", () => {
  it("lists the v1 scene tags", () => {
    expect(Object.keys(SCENE_TAGS).sort()).toEqual(
      ["bitmap-text", "container", "graphics", "nine-slice-sprite", "particle-container", "sprite", "text", "tiling-sprite"].sort(),
    );
  });

  it("lists the graphics shape children", () => {
    expect(Object.keys(SHAPE_TAGS).sort()).toEqual(["circle", "ellipse", "polygon", "rect", "rounded-rect"]);
    expect(SCENE_TAGS.graphics.children).toEqual(["rect", "rounded-rect", "circle", "ellipse", "polygon"]);
    expect(SCENE_TAGS.sprite.children).toBeUndefined();
  });

  it("gives every tag the shared container properties", () => {
    for (const tag of Object.keys(SCENE_TAGS) as (keyof typeof SCENE_TAGS)[]) {
      const props = propertiesOf(tag);
      for (const p of ["x", "y", "rotation", "alpha", "visible", "tint", "zIndex", "label", "position", "scale", "pivot", "skew"]) {
        expect(props[p], `${tag}.${p}`).toBeDefined();
      }
    }
  });

  it("marks point-like properties", () => {
    const props = propertiesOf("sprite");
    for (const p of ["position", "scale", "pivot", "skew", "anchor"]) expect(props[p]?.kind, p).toBe("point");
    expect(props.x?.kind).toBe("number");
    expect(props.visible?.kind).toBe("boolean");
    expect(props.tint?.kind).toBe("color");
  });

  it("flat text style fields live on text and bitmap-text only", () => {
    for (const tag of ["text", "bitmap-text"] as const) {
      const props = propertiesOf(tag);
      for (const p of ["text", "style", "fontSize", "fontFamily", "fill", "align", "wordWrap", "wordWrapWidth", "letterSpacing", "stroke"]) {
        expect(props[p], `${tag}.${p}`).toBeDefined();
      }
    }
    expect(propertiesOf("sprite").fontSize).toBeUndefined();
    expect(propertiesOf("text").text?.kind).toBe("string");
  });
});

describe("particle-container", () => {
  it("maps onto Pixi ParticleContainer with the container properties and its own", () => {
    expect(SCENE_TAGS["particle-container"].pixiClass).toBe("ParticleContainer");
    const props = propertiesOf("particle-container");
    for (const p of ["x", "y", "alpha", "visible", "label", "zIndex", "texture", "dynamicProperties", "roundPixels"]) expect(props[p], p).toBeDefined();
    expect(SCENE_TAGS["particle-container"].children).toBeUndefined();
  });
});

describe("events", () => {
  it("covers Pixi's federated pointer events with their types", () => {
    for (const n of ["pointerdown", "pointerup", "pointerupoutside", "pointermove", "pointertap", "pointerover", "pointerout", "pointerenter", "pointerleave", "rightdown", "rightup", "click", "wheel"]) {
      expect(SCENE_EVENTS[n as SceneEventName], n).toBeDefined();
    }
    expect(SCENE_EVENTS.wheel).toBe("FederatedWheelEvent");
    expect(SCENE_EVENTS.pointerdown).toBe("FederatedPointerEvent");
  });
});

describe("dotted paths", () => {
  it("accepts one axis of a point-like property, typed number", () => {
    expect(resolveProperty("sprite", "scale.x")).toEqual({ kind: "number", axis: "x", of: "scale" });
    expect(resolveProperty("sprite", "anchor.y")).toEqual({ kind: "number", axis: "y", of: "anchor" });
    expect(resolveProperty("container", "pivot.x")?.kind).toBe("number");
  });

  it("rejects deep paths, non-point parents and unknown names", () => {
    expect(resolveProperty("sprite", "scale.z")).toBeUndefined();
    expect(resolveProperty("sprite", "scale.x.y")).toBeUndefined();
    expect(resolveProperty("sprite", "alpha.x")).toBeUndefined();
    expect(resolveProperty("sprite", "style.color")).toBeUndefined();
    expect(resolveProperty("container", "anchor.x")).toBeUndefined();
    expect(resolveProperty("sprite", "nope")).toBeUndefined();
  });

  it("resolves plain properties", () => {
    expect(resolveProperty("sprite", "alpha")).toMatchObject({ kind: "number" });
  });
});

describe("static attribute conversion", () => {
  const spec = (tag: Parameters<typeof propertiesOf>[0], name: string) => propertiesOf(tag)[name]!;

  it("converts numbers", () => {
    expect(convertStaticAttribute(spec("sprite", "x"), "12.5")).toEqual({ ok: true, value: 12.5 });
    expect(convertStaticAttribute(spec("sprite", "x"), "abc").ok).toBe(false);
    expect(convertStaticAttribute(spec("sprite", "x"), "").ok).toBe(false);
  });

  it("keeps string properties as strings, never guessing a number", () => {
    expect(convertStaticAttribute(spec("text", "text"), "123")).toEqual({ ok: true, value: "123" });
  });

  it("converts booleans", () => {
    expect(convertStaticAttribute(spec("sprite", "visible"), "")).toEqual({ ok: true, value: true });
    expect(convertStaticAttribute(spec("sprite", "visible"), "true")).toEqual({ ok: true, value: true });
    expect(convertStaticAttribute(spec("sprite", "visible"), "false")).toEqual({ ok: true, value: false });
    expect(convertStaticAttribute(spec("sprite", "visible"), "yes").ok).toBe(false);
  });

  it("converts colors", () => {
    expect(convertStaticAttribute(spec("sprite", "tint"), "#ff8000")).toEqual({ ok: true, value: 0xff8000 });
    expect(convertStaticAttribute(spec("sprite", "tint"), "#f80")).toEqual({ ok: true, value: 0xff8800 });
    expect(convertStaticAttribute(spec("sprite", "tint"), "0x00ff00")).toEqual({ ok: true, value: 0x00ff00 });
    expect(convertStaticAttribute(spec("sprite", "tint"), "#zzz").ok).toBe(false);
  });

  it("converts point-like values, rejects malformed ones", () => {
    expect(convertStaticAttribute(spec("sprite", "anchor"), "0.5")).toEqual({ ok: true, value: 0.5 });
    expect(convertStaticAttribute(spec("sprite", "anchor"), "1, 2")).toEqual({ ok: true, value: { x: 1, y: 2 } });
    expect(convertStaticAttribute(spec("sprite", "anchor"), "1 2")).toEqual({ ok: true, value: { x: 1, y: 2 } });
    const bad = convertStaticAttribute(spec("sprite", "anchor"), "abc");
    expect(bad.ok).toBe(false);
  });

  it("rejects static values for object-typed properties", () => {
    expect(convertStaticAttribute(spec("sprite", "texture"), "x.png").ok).toBe(false);
  });

  it("converts dotted axis paths as numbers", () => {
    const axis = resolveProperty("sprite", "scale.x")!;
    expect(convertStaticAttribute(axis, "2")).toEqual({ ok: true, value: 2 });
  });
});

describe("/elements stays free of pixi.js", () => {
  it("has no runtime or type import of pixi.js", () => {
    const src = readFileSync(fileURLToPath(new URL("./elements.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/from\s+["']pixi\.js/);
    expect(src).not.toMatch(/import\(\s*["']pixi\.js/);
    expect(src).not.toMatch(/require\(\s*["']pixi\.js/);
  });
});
