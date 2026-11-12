# Loading assets in a canvas scene

Assets load explicitly, through the app-level `Assets` service from `@gable/renderer-pixi`. A scene never starts a load by itself, so loading state is a set of signals you can put in a template.

## Declare bundles

Bundles are Pixi manifest entries, declared once in the app's root providers. Import single files normally so Vite hashes their URLs.

```ts
import { bootstrap } from "@gable/core";
import { provideAssets } from "@gable/renderer-pixi";
import shipUrl from "./ship.png";

bootstrap(Root, {
  renderer: dom(),
  providers: provideAssets({
    bundles: {
      menu: [{ alias: "logo", src: "/menu/logo.png" }],
      level1: [
        { alias: "ship", src: shipUrl },
        { alias: "hero", src: "/sprites/hero.json" }, // spritesheet: frame names become aliases
        { alias: "score-font", src: "/fonts/score.fnt" }, // bitmap font
      ],
    },
  }),
});
```

Spritesheet JSON and bitmap-font descriptors refer to sibling files by relative path, which hashing breaks, so keep those families in `public/`.

## Load in a scene and show loading UI

`inject(Assets).bundle("level1")` returns a handle with the signals `status` (`idle`, `loading`, `ready`, `error`), `progress` (0 to 1), `error` and `ready`, and the methods `load()` and `unload()`.

```ts
import { html, inject, onCleanup } from "@gable/core";
import { Assets } from "@gable/renderer-pixi";

export class Level {
  static meta = {
    selector: "game-level",
    template: html`
      @if (level.error()) {
        <text [x]="20" [y]="20">Could not load the level</text>
      } @else if (level.ready()) {
        <sprite texture="ship" [x]="100" [y]="100"></sprite>
        <sprite texture="hero/idle_0"></sprite>
        <bitmap-text fontFamily="score-font" [y]="10">Score</bitmap-text>
      } @else {
        <graphics>
          <rect [x]="20" [y]="20" [width]="level.progress() * 200" [height]="8" fill="#fff"></rect>
        </graphics>
      }
    `,
  };

  level = inject(Assets).bundle("level1");
  #start = void this.level.load(); // counted against this component's scope
}
```

To keep the heavy part of a scene out of the download until the assets are in, use `@defer (when level.ready()) { <game-world></game-world> }`.

## Lifetime

- `load()` is idempotent. Each call from inside a component or block is counted against that scope; when the last counting scope is disposed the bundle unloads (`Assets.unload`). Scenes that share a bundle keep it alive while any of them is mounted.
- `load({ keepAlive: true })`, or calling `load()` outside any scope, opts out: the bundle stays until you call `unload()`.
- `unload()` unloads immediately and returns the handle to `idle`.
- Removing a node never destroys a bundle texture. Textures you build in code belong to whoever built them.

## Strings in templates

`texture="ship"` (or `[texture]="alias"`) on `sprite`, `tiling-sprite` and `nine-slice-sprite` looks the string up synchronously in Pixi's asset cache: an alias, a URL, or a spritesheet frame name. If it is not loaded the node shows an empty texture and the dev build warns, naming the alias. Guard nodes with `@if (bundle.ready())`. Text that uses a web font must also be created only after its bundle is ready.
