import * as PIXI from "pixi.js";
import "pixi.js/events"; // installs eventMode, cursor, hitArea and interactiveChildren on Container
import type { AllFederatedEventMap } from "pixi.js";
import { describe, expect, it } from "vitest";
import { SCENE_EVENTS, SCENE_TAGS, SHAPE_TAGS, propertiesOf, type SceneEventName, type SceneTagName } from "./elements.js";

// Properties that are Gable-level conventions rather than fields of a Pixi class.
const GABLE_ONLY = new Set(["fill", "stroke", "strokeWidth", "text", "context", "a11y", "dynamicProperties"]);

function make(tag: SceneTagName): object {
  switch (tag) {
    case "container":
      return new PIXI.Container();
    case "sprite":
      return new PIXI.Sprite();
    case "text":
      return new PIXI.Text({ text: "" });
    case "bitmap-text":
      return new PIXI.BitmapText({ text: "" });
    case "graphics":
      return new PIXI.Graphics();
    case "tiling-sprite":
      return new PIXI.TilingSprite({ texture: PIXI.Texture.EMPTY });
    case "nine-slice-sprite":
      return new PIXI.NineSliceSprite({ texture: PIXI.Texture.EMPTY });
    case "particle-container":
      return new PIXI.ParticleContainer();
  }
}

// Fields Pixi declares on its types but leaves uninitialised, so `in` cannot see them. Their
// existence is checked by the compile-time assertions at the bottom of this file.
const DECLARED_ONLY = new Set(["cursor"]);
const _cursor: PIXI.Container["cursor"] = "pointer";
void _cursor;

const TEXT_STYLE_FIELDS = new Set([
  "fontSize",
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "fill",
  "align",
  "wordWrap",
  "wordWrapWidth",
  "letterSpacing",
  "stroke",
  "lineHeight",
]);

describe("property table conforms to Pixi's own classes", () => {
  for (const tag of Object.keys(SCENE_TAGS) as SceneTagName[]) {
    it(`${tag}: every property exists on the Pixi object (or its TextStyle)`, () => {
      const node = make(tag);
      const style = "style" in node ? (node as { style: object }).style : undefined;
      const missing: string[] = [];
      for (const name of Object.keys(propertiesOf(tag))) {
        if (GABLE_ONLY.has(name) && !(name in node)) continue;
        if (name in node) continue;
        if (DECLARED_ONLY.has(name)) continue;
        if (style && TEXT_STYLE_FIELDS.has(name) && name in style) continue;
        missing.push(name);
      }
      expect(missing).toEqual([]);
    });
  }

  it("point-like properties are Pixi ObservablePoints", () => {
    for (const tag of Object.keys(SCENE_TAGS) as SceneTagName[]) {
      const node = make(tag) as Record<string, unknown>;
      for (const [name, spec] of Object.entries(propertiesOf(tag))) {
        if (spec.kind !== "point") continue;
        const value = node[name];
        expect(value, `${tag}.${name}`).toBeTypeOf("object");
        expect(value, `${tag}.${name}`).toHaveProperty("x");
        expect(value, `${tag}.${name}`).toHaveProperty("y");
      }
    }
  });

  it("simple properties hold that primitive type on a fresh node", () => {
    // Size getters on text measure through a canvas, which needs a DOM; skip them here.
    const measured = new Set(["width", "height"]);
    for (const tag of Object.keys(SCENE_TAGS) as SceneTagName[]) {
      const node = make(tag) as Record<string, unknown>;
      for (const [name, spec] of Object.entries(propertiesOf(tag))) {
        if (measured.has(name) || !(name in node) || node[name] === undefined) continue;
        if (spec.kind === "number") expect(typeof node[name], `${tag}.${name}`).toBe("number");
        if (spec.kind === "boolean") expect(typeof node[name], `${tag}.${name}`).toBe("boolean");
      }
    }
  });

  it("shape tag geometry names match Pixi's shape classes", () => {
    const shapes = {
      rect: new PIXI.Rectangle(),
      "rounded-rect": new PIXI.RoundedRectangle(),
      circle: new PIXI.Circle(),
      ellipse: new PIXI.Ellipse(),
      polygon: new PIXI.Polygon([0, 0, 1, 0, 1, 1]),
    } as const;
    for (const [tag, shape] of Object.entries(shapes)) {
      const spec = SHAPE_TAGS[tag as keyof typeof SHAPE_TAGS];
      for (const name of Object.keys(spec.props)) {
        if (GABLE_ONLY.has(name)) continue;
        expect(name in shape, `${tag}.${name}`).toBe(true);
      }
    }
  });
});

// Type-level (checked by `npm run typecheck:tests`): the event table and Pixi's event map list
// exactly the same names, and each name's declared event class is the one Pixi types it with.
type PixiEvents = AllFederatedEventMap;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const sameNames: Same<SceneEventName, keyof PixiEvents> = true;
const sameTypes: Same<
  { [K in SceneEventName]: (typeof SCENE_EVENTS)[K] },
  { [K in SceneEventName]: PixiEvents[K] extends PIXI.FederatedWheelEvent ? "FederatedWheelEvent" : "FederatedPointerEvent" }
> = true;
void sameNames;
void sameTypes;

describe("event table", () => {
  it("only names events Pixi's FederatedEventMap defines, with Pixi's event classes", () => {
    for (const type of new Set(Object.values(SCENE_EVENTS))) {
      expect(PIXI, type).toHaveProperty(type);
    }
  });
});
