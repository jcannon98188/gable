// The manifest shape is Pixi's own ({ alias, src }); only the way `src` is obtained differs.
import heroSheet from "./art/hero.json?family";
import pixelFont from "./art/pixel.fnt?family";
import shipUrl from "./art/ship.png";

export const bundles = {
  level1: [
    { alias: "hero", src: heroSheet },
    { alias: "pixel", src: pixelFont },
    { alias: "ship", src: shipUrl },
  ],
};

(globalThis as { __bundles?: unknown }).__bundles = bundles;
