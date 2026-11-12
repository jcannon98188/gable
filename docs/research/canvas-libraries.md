# Canvas / WebGL / WebGPU libraries: facts for TASK-104.1

Researched 2026-11-12 for TASK-104 (Gable Canvas design map). Facts only; no recommendation (the pick is TASK-104.4).

Method: npm registry JSON and GitHub repo metadata fetched on 2026-11-12 (versions, licences, publish dates, `unpackedSize`, `types`, `sideEffects`); bundlephobia API for bundle sizes; library docs and source files at the tagged release for behaviour. Items I could not confirm from a primary source are marked **unverified** or **not checked**; nothing is filled in from memory.

## 0. What the Gable Renderer contract asks of a library

From `packages/core/src/renderer.ts` and `GLOSSARY.md` (Renderer, Test renderer, Platform services). A `Renderer<N>` is synchronous operations over opaque node handles:

- `createElement(tag, parent)`, `createText`, `createAnchor`: node creation **by string tag**, so the binding needs a tag -> constructor registry. `createAnchor` needs a cheap, non-rendering placeholder node (control-flow markers).
- `setProperty(node, name, value)`, `setAttribute`, `setClass`, `setStyle`, `setText`: per-property writes. Library objects whose properties are plain setters/accessors fit directly; objects configured only through constructor options, or needing explicit "dirty" calls, need glue.
- `insert(parent, node, before?)` and `remove(node)`: **ordered** child insertion before a reference sibling, plus removal. "Scene graph fit" below is judged mainly on: parent/child tree, insert-at-index (or before-node), removal, z-order model.
- `listen(node, name, handler)` returning an unsubscribe: per-node event subscription.
- Optional: `overlayRoot`, `compare` (document order), `resolveTarget`, `captureViewState`/`restoreViewState` (HMR), `observeTrigger`.

Precedent for the same shape of binding exists for two libraries: `@pixi/react` (JSX tags such as `<pixiSprite>` "backed by a Pixi.js Sprite", per its [getting-started page](https://react.pixijs.io/getting-started/)) and `@react-three/fiber` (`extend()` adds classes to a camel-cased JSX catalogue; props map onto `.set()` and dash-case nested props; `args` array for constructor args; `attach` for non-child relationships, per [R3F objects docs](https://r3f.docs.pmnd.rs/api/objects)). Both are custom React reconcilers; the pages I read do not describe the reconciler internals.

## 1. WebGPU status (browsers), as of 2026-11-12

Sources disagree on Firefox, so both are given.

- [gpuweb Implementation Status wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status): Chromium on Mac/Windows(x86/x64)/ChromeOS from 113; Android (Qualcomm/ARM/Intel GPUs, Android 12+) from 121; Chromium Linux Intel Gen12+ from 144, NVIDIA on Wayland from 147, other Linux behind a flag; Windows ARM64 behind a flag. **Firefox: Windows from 141, macOS from 145 (macOS 26+) and 147 (all macOS), Linux Nightly only, Android behind a flag.** Safari 26 on macOS, iOS/iPadOS, visionOS, enabled by default.
- [caniuse WebGPU](https://caniuse.com/webgpu) (fetched via a summarising tool, so treat percentages as approximate): global usage about 88.6%; Chrome/Edge 113+; Safari 26.0+ listed as partial on desktop and supported on iOS 26.0+; Chrome Android 157+; **Firefox listed as disabled by default in all versions shown**, which contradicts the gpuweb wiki above. Not resolved here; check caniuse directly.
- [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API): marked "Limited availability", not Baseline; secure contexts only. The compatibility table did not come through in my fetch.

Consequence stated by every library below that supports both: WebGPU needs a WebGL fallback or runtime detection (`navigator.gpu`).

## 2. Comparison table

Versions, licences and dates from the npm registry (`registry.npmjs.org/<pkg>`) on 2026-11-12. "Releases/12m" is the count of stable `x.y.z` versions published since 2025-11-12 (npm `time` field). Size column is the bundlephobia **whole-entry minified/gzip** figure, not a tree-shaken build of a realistic scene; see caveats in section 4.

| | PixiJS | Three.js | Babylon.js | Phaser | Excalibur | Konva | Two.js | Canvas2D |
|---|---|---|---|---|---|---|---|---|
| Latest (npm) | 8.23.0 (2026-11-11) | 0.187.0 / r187 (2026-10-30) | @babylonjs/core 9.35.0 (2026-11-06) | 4.2.1 (2026-07-09) | 1.0.0 (2026-11-08) | 10.9.1 (2026-10-31) | 0.8.24 (2026-08-29) | n/a (browser API) |
| Licence | MIT | MIT | Apache-2.0 | MIT | BSD-2-Clause | MIT (README and LICENSE file; GitHub API reports NOASSERTION) | MIT | n/a |
| Canvas2D renderer | Present in 8.23 source (`preference: 'canvas'`), docs say "coming soon" | No | No | Yes, deprecated in v4, no v4 advanced features | Yes (fallback, no post-processors/custom renderers) | Yes (only) | Yes | is the API |
| WebGL | Yes, default | Yes (`WebGLRenderer`) | Yes | Yes (v4 is a WebGL rebuild) | Yes, default | No | Yes | n/a |
| WebGPU | Yes, "experimental"/"still maturing" | Yes via `WebGPURenderer` (`three/webgpu`), auto WebGL2 fallback | Yes (`WebGPUEngine`, since 5.0) | Not mentioned in v4 notes | Not mentioned | No | No | No |
| Retained scene graph | Yes (`Container`) | Yes (`Object3D`) | Yes (`Node`/`TransformNode`, parent-based) | Yes, but objects owned by a Scene display list; `Container` for nesting | Yes (`Actor.addChild`) | Yes (`Stage`>`Layer`>`Group`>`Shape`) | Yes (`Group`) | No (immediate mode) |
| Insert before sibling | `addChildAt(child, index)` | `add` appends only (no index) | `parent` property / `addChild`; no ordered-children API found | `Container.addAt`, `moveTo` | not verified | not verified | not verified | n/a |
| 2D-first | Yes | No (3D, with ortho camera/sprites) | No (3D; sprites, GUI) | Yes | Yes | Yes | Yes | Yes |
| 3D path in same lib | Partial (3D/storage textures in WebGPU renderer, `Mesh`); not a 3D engine | Yes, native | Yes, native | No (`Mesh2D` only) | No | No | No | No |
| Pointer events on nodes | Yes, federated, CPU tree walk | No (manual `Raycaster`) | Yes (picking, `ActionManager`; not read in detail) | Yes (not read in detail) | Yes (collision geometry or graphics bounds) | Yes (per shape) | not verified | No (`isPointInPath` only) |
| Owns a loop | Ticker via `Application`, can be disabled | No (you call `render`) | Yes (`engine.runRenderLoop`, optional) | Yes (`TimeStep` on rAF) | Yes (engine owns loop) | No (draws on change) | `Two.play()` optional | No |
| TypeScript | Bundled `.d.ts` | Types not bundled; `@types/three` 0.187.0 (DefinitelyTyped) | Bundled | Bundled (`types/phaser.d.ts`) | Bundled, TS source | Bundled | Bundled (`src/two.d.ts`) | lib.dom |
| Entry size min/gzip (bundlephobia) | 995 KB / 282 KB | 742 KB / 186 KB | 8.28 MB / 1.84 MB (whole package; ES6 deep imports reduce) | 1.38 MB / 356 KB | 637 KB / 165 KB | 190 KB / 57 KB | 207 KB / 49 KB | 0 |
| Tree-shakeable | `sideEffects` list + per-feature exports | `sideEffects: ["./src/nodes/**/*"]` | `sideEffects` list (661 entries), deep imports | no `sideEffects` field | `sideEffects: false` | no field | no field | n/a |
| Releases/12m | 14 | 11 | 138 | 4 | 2 | 22 | 3 | n/a |
| Headless / no GPU | not documented (see note) | scene graph usable without GPU; rendering needs a context | `NullEngine` | `HEADLESS` renderType (v3 doc; v4 not re-verified) | not checked | Node via canvas/skia backend | Node via `canvas` package | OffscreenCanvas/node-canvas |

## 3. Per-library notes

### PixiJS 8.23.0

- Renderers: WebGL (default, "well supported and stable"), WebGPU ("supported but experimental", "feature complete, but browser implementations are inconsistent", docs recommend WebGL for production), and Canvas2D listed "coming soon" in the [renderers guide](https://pixijs.com/8.x/guides/components/renderers). **Surprising:** the 8.23.0 source already has `RendererPreference = 'webgl' | 'webgpu' | 'canvas'`, a `canvas/CanvasRenderer` directory, and a priority order `['webgl','webgpu','canvas']` ([autoDetectRenderer.ts](https://raw.githubusercontent.com/pixijs/pixijs/v8.23.0/src/rendering/renderers/autoDetectRenderer.ts)); release notes list canvas fixes in 8.18.0, 8.21.0 (CanvasLoader) and 8.23.0 ([releases](https://github.com/pixijs/pixijs/releases)). Docs lag source.
- WebGPU progress in 8.19-8.23 per release notes: render bundles, device-loss recovery (8.21), 3D/storage textures and sRGB view formats (8.22), Safari 27.x workaround (8.23).
- Scene graph: `Container` with `addChild`, `addChildAt`, `removeChild`, `removeChildAt`, `removeChildren`, `reparentChild`, `swapChildren`, `zIndex` with `sortableChildren`/`sortChildren`, `label` ([container guide](https://pixijs.com/8.x/guides/components/scene-objects/container)). No `insertBefore`; before-node insertion needs an index lookup. Render groups (`isRenderGroup`) exist in source ([Container.ts](https://raw.githubusercontent.com/pixijs/pixijs/v8.23.0/src/scene/container/Container.ts)). Transform, mask, filter and blend-mode property pages were not read in this pass.
- 2D features: asset types include PNG/JPG/GIF/WebP/AVIF/SVG, video, spritesheet JSON, bitmap fonts, web fonts, JSON, text, Basis/DDS/KTX/KTX2 compressed textures; manifests, bundles, background loading ([assets guide](https://pixijs.com/8.x/guides/components/assets)). Package `exports` include `text`, `text-bitmap`, `text-html`, `graphics`, `graphics-smooth`, `filters`, `mesh`, `sprite-tiling`, `sprite-nine-slice`, `particle-container`, `advanced-blend-modes`, `accessibility`, `events`, `gif` ([package.json](https://unpkg.com/pixi.js@8.23.0/package.json)). Bitmap text is recommended over `Text` for frequently changing text; Graphics under about 100 points batch ([performance tips](https://pixijs.com/8.x/guides/concepts/performance-tips)). Tilemaps: no built-in tilemap in the pages read; **not verified**.
- Events: `eventMode` none/passive/auto/static/dynamic; federated DOM-like events (`pointerdown`, `pointertap`, etc.); `hitArea` override; top-most hit, bubbling up the tree ([events guide](https://pixijs.com/8.x/guides/components/events)). Hit testing is a recursive CPU walk of the scene graph (`EventBoundary.hitTestRecursive`, [source](https://raw.githubusercontent.com/pixijs/pixijs/v8.23.0/src/events/EventBoundary.ts)). The v8 plain move events only fire over display objects; 8.23.0 changed global move events to fire once per move for interactive ancestors.
- Loop: `Application` with `TickerPlugin` renders each frame by default; `autoStart: false` plus calling `app.render()` is the documented manual path ([Application.ts](https://raw.githubusercontent.com/pixijs/pixijs/v8.23.0/src/app/Application.ts)). Ticker has priorities (HIGH 50, NORMAL 0, LOW -50), `maxFPS`, `minFPS` ([ticker guide](https://pixijs.com/8.x/guides/components/ticker)). Using a bare renderer without `Application` was not checked.
- Size: 8.23.0 whole-entry 995 KB min / 282 KB gzip, 10 dependencies; `sideEffects` list of 30 entries and subpath exports, so features register via side-effect imports (an `Application` option `skipExtensionImports` exists). Realistic tree-shaken size not measured.
- Types: bundled. 8.21.0 added TypeScript 5/6/7 support. Licence MIT. 48.7k stars, pushed 2026-11-11, not archived. About 14 stable releases in the last 12 months.
- 3D: not a 3D engine; WebGPU renderer gained 3D textures in 8.22; `Mesh` supports custom geometry/shaders. A separate Three-in-Pixi path is not documented in the pages read.
- Headless: not documented in a page I could fetch (the headless guide path I tried does not exist). **Not verified.**
- Declarative precedent: [`@pixi/react`](https://github.com/pixijs/pixi-react) 8.0.5 (2025-12-01), requires `pixi.js@^8.2.6`; "thin wrapper ... expressed via JSX"; says everything in Pixi works without wrapper updates.

### Three.js r187 (0.187.0)

- Renderers: `WebGLRenderer`; `WebGPURenderer` (via `three/webgpu`, with `three/tsl`) "tries to use a WebGPU backend if the browser supports WebGPU. If not, ... falls back to a WebGL 2 backend", `forceWebGL` option ([WebGPURenderer docs](https://threejs.org/docs/pages/WebGPURenderer.html), [package.json exports](https://raw.githubusercontent.com/mrdoob/three.js/r187/package.json)). The doc page and r187 release notes state no production/experimental status. A secondary guide claims "experimental" and limits on `ShaderMaterial`/`EffectComposer`; **unverified against a primary page** (the manual URL I tried 404'd).
- Scene graph: `Object3D` has `add`, `remove`, `attach`, `clear`, `children`, `parent`. `add` takes no index ([Object3D docs](https://threejs.org/docs/pages/Object3D.html)). Insert-before requires manipulating `children` directly (undocumented) or re-adding; z-order for 2D is `renderOrder`/depth, not child order. Lifecycle events `added`/`removed`/`childadded`/`childremoved` exist.
- Pointer events: none built in; docs show a manual `Raycaster` over `scene.children` ([Raycaster docs](https://threejs.org/docs/pages/Raycaster.html)). `@react-three/fiber` provides `onClick`-style props; mechanism not read here.
- 2D: no 2D-first API in the pages read; `Sprite` and orthographic cameras exist but were not fetched. 2D text, atlases, tilemaps, particles: **not verified**; most are addons or user code.
- Loop: none; the caller calls `renderer.render` (docs example uses `requestAnimationFrame`); `setAnimationLoop` exists on the renderer but was not fetched.
- Size: whole-entry 742 KB min / 186 KB gzip, zero dependencies, `sideEffects` only `./src/nodes/**/*`, ES modules; WebGPU is a separate entry (`three/webgpu`).
- Types: **not bundled** in the `three` package (no `types` field); typings come from DefinitelyTyped `@types/three` 0.187.0 (2026-10-30), versioned in lockstep. Licence MIT. 118k stars, pushed 2026-11-12. Releases: r184 16 Apr, r185 1 Jul, r186 24 Sep, r187 30 Oct (irregular, 5 weeks to 2.8 months); npm shows 11 stable releases in 12 months. No semver: each release has a migration guide.
- Headless: no GPU-free renderer shipped in the pages read. Scene-graph objects do not require a DOM, but rendering needs a GL/GPU context. **Not verified in docs.**

### Babylon.js 9.35.0

- Renderers: WebGL and WebGPU (`WebGPUEngine`, `await engine.initAsync()`, "currently no differences besides initialization", support since 5.0 / May 2022). Limitations listed: ray tracing in progress, WebXR over WebGPU experimental, cannot switch an existing WebGPU scene to WebGL, browser support varies ([WebGPU docs](https://doc.babylonjs.com/setup/support/webGPU)). No explicit "production ready" statement. No Canvas2D renderer.
- Scene graph: 3D nodes with a `parent` property, `setParent`, `addChild`, `removeChild`; setting `parent` directly and `setParent`/`addChild` differ in whether the child keeps its world transform ([parenting docs](https://doc.babylonjs.com/features/featuresDeepDive/mesh/transforms/parent_pivot/parent)). Ordered-child insertion was not found in the pages read; **not verified**.
- 2D: sprites via `SpriteManager`/`SpritePackedManager`, sprite maps for grid levels; sprites always face the camera ([sprites docs](https://doc.babylonjs.com/features/featuresDeepDive/sprites/)). 2D UI via GUI `AdvancedDynamicTexture` rendered to a texture (fullscreen or mesh texture mode) ([GUI docs](https://doc.babylonjs.com/features/featuresDeepDive/gui/gui)). Picking sprites has its own page, not read.
- 3D: native; it is a 3D engine first.
- Size: `@babylonjs/core` unpacked 73.6 MB; bundlephobia whole-entry 8.28 MB min / 1.84 MB gzip. Docs say deep per-module imports and side-effect imports are required for tree shaking and report one example dropping from about 2.3 MB to about 700 KB ([ES6 support](https://doc.babylonjs.com/setup/frameworkPackages/es6Support)). Zero dependencies.
- Types: bundled. Licence Apache-2.0. 26.3k stars, pushed 2026-11-11. 138 stable npm releases in 12 months (daily-to-weekly cadence).
- Loop: `engine.runRenderLoop` (optional; not fetched).
- Headless: `NullEngine` documented for server-side and testing ([typedoc](https://doc.babylonjs.com/typedoc/classes/BABYLON.NullEngine)); no pixels are rendered.

### Phaser 4.2.1

- v4.0.0 (10 Apr 2026, "Caladan") is "a ground-up rebuild of the WebGL renderer": v3 pipelines replaced by a node-based renderer; new filter system, `SpriteGPULayer`, `TilemapGPULayer`; 4.2.0 added cone lights, `Mesh2D`, `Stencil`; 4.2.1 on 2026-07-09 is bug fixes ([releases](https://github.com/phaserjs/phaser/releases)). Per search-engine summaries of the [v4.0.0 changelog](https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/CHANGELOG-v4.0.0.md) and [migration guide](https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/MIGRATION-GUIDE.md): the Canvas renderer is "still available but should be considered deprecated", lacks the advanced WebGL features, WebGL recommended for new projects; BitmapMask removed, GeometryMask Canvas-only. I did not fetch those two files directly. Source: `Phaser.AUTO` falls back to Canvas, `CANVAS` and `WEBGL` constants, `HEADLESS` listed in config docs ([const.js](https://raw.githubusercontent.com/phaserjs/phaser/v4.2.1/src/const.js), [Config.js](https://raw.githubusercontent.com/phaserjs/phaser/v4.2.1/src/core/Config.js)). No WebGPU mention in v4 notes read.
- Scene graph: game objects belong to a Scene (display list, created via the scene factory); `Container` nests children with `add`, `addAt(child, index)`, `moveTo`, `remove`, `sort` ([Container.js](https://raw.githubusercontent.com/phaserjs/phaser/v4.2.1/src/gameobjects/container/Container.js)). Whether objects can be constructed detached from a scene was **not verified**; the usual constructor takes a Scene.
- Loop: owned by the `Game`; `TimeStep` on `requestAnimationFrame` with optional `forceSetTimeOut` ([TimeStep.js](https://raw.githubusercontent.com/phaserjs/phaser/v4.2.1/src/core/TimeStep.js)); "The game loop starts immediately after `postBoot`" ([docs](https://docs.phaser.io/phaser/concepts/game)). Phaser also owns loader, scenes, input, physics, audio.
- Package: 4.2.1, MIT, types `./types/phaser.d.ts`, ESM `./dist/phaser.esm.js`; unpacked 112 MB; whole-entry 1.38 MB min / 356 KB gzip; one dependency; no `sideEffects` field. 40.7k stars, last push 2026-08-21. 4 stable releases in 12 months.
- 3D: none (Mesh2D only). Input, loader, tilemaps, particles, text/bitmap text are built in (not itemised from primary pages in this pass).

### Excalibur 1.0.0

- 1.0.0 released 2026-11-08: ESM-only, time units switched to milliseconds, many renames, 2D lighting (opt-in), pause system, serialization, plugin API, CLI ([release](https://github.com/excaliburjs/Excalibur/releases), [CHANGELOG](https://raw.githubusercontent.com/excaliburjs/Excalibur/v1.0.0/CHANGELOG.md)). Only 2 stable versions on npm in 12 months (the line before was long-running pre-1.0).
- Renderers: "The default implementation in Excalibur uses WebGL"; a Canvas 2D context exists as fallback or forced via `ex.Flags.useCanvasGraphicsContext()`, but custom renderers and post-processors do not work there; automatic fallback to Canvas 2D if the game runs at 20 FPS or lower for 100 frames, configurable via `configurePerformanceCanvas2DFallback` ([graphics context docs](https://excaliburjs.com/docs/graphics-context/)). WebGPU not mentioned. Described as a 2D engine in TypeScript ([docs home](https://excaliburjs.com/docs/)); no 3D.
- Scene graph: `Actor` with `parent.addChild(child)`, child transforms (position, rotation, scale, z) relative to parent ([actors docs](https://excaliburjs.com/docs/actors/)). Insert-at-index and removal API **not verified**. Entities are ECS-based internally (not read).
- Pointer events: "Actors use collision geometry for pointer events", or graphics bounds if configured.
- Loop: engine owns the update/draw loop; actor hooks `onPreUpdate`/`onPostUpdate`. Standalone use of just the renderer: not documented in pages read.
- Package: BSD-2-Clause, `sideEffects: false`, bundled types, zero dependencies, whole-entry 637 KB min / 165 KB gzip (bundlephobia). 2.4k stars, last push 2026-11-12.

### Konva 10.9.1

- Canvas2D only; "2D canvas framework for interactive graphics"; each shape has its own events, drag, transforms, animation, cache, export ([README](https://raw.githubusercontent.com/konvajs/konva/10.9.1/README.md)). Layers are separate canvas elements ([layer management](https://konvajs.org/docs/performance/Layer_Management.html)). Scene graph is Stage > Layer > Group > Shape (hierarchy names from docs; per-method insert/z-order API **not verified**).
- Events: `node.on('click' | 'mousedown' | 'tap' | pointer events | 'dragstart' ...)` ([binding events](https://konvajs.org/docs/events/Binding_Events.html)). Hit detection mechanism (hit-graph canvas) **not verified from a fetched page**.
- Node: package exports `./canvas-backend` and `./skia-backend` ([package.json](https://raw.githubusercontent.com/konvajs/konva/10.9.1/package.json)); CI has a node test workflow (README badges). Details of what works headless not read.
- Package: MIT (README says "does not require a license key"; GitHub's licence detector returns NOASSERTION because the file credits the KineticJS original work), bundled types, ESM, zero deps, whole-entry 190 KB min / 57 KB gzip. 14.9k stars, last push 2026-11-10. 22 stable releases in 12 months.
- Positioning is design editors, whiteboards and diagrams, not games; no sprite atlas, tilemap, particle or WebGL path in the README. 3D: none.

### Two.js 0.8.24

- "A two-dimensional drawing api ... renderer agnostic ... webgl, canvas2d, and svg" ([README](https://raw.githubusercontent.com/jonobr1/two.js/v0.8.24/README.md)); build can exclude renderers to cut size; headless in Node via the `canvas` package (since v0.7.x). MIT, `types: src/two.d.ts`, 0.x version, whole-entry 207 KB min / 49 KB gzip, 8.7k stars, 3 stable releases in 12 months, last push 2026-11-11.
- Scene graph (`Group`/shapes), event model, text, sprite sheets, hit testing: **not read in this pass**.

### Plain Canvas2D

- Immediate mode: draw calls paint pixels; the context keeps only a current path. `isPointInPath` tests the current path or a supplied `Path2D`, with the point in untransformed canvas coordinates ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/isPointInPath)). So a Gable Renderer over bare Canvas2D would have to implement its own retained tree, dirty tracking, z-order, hit testing and event dispatch.

### Other candidates found

- **melonJS 20.13.0** (2026-11-06, MIT, 34 stable releases in 12 months, whole-entry 1.05 MB / 314 KB gzip): README claims "2D & 3D ... running on WebGPU, WebGL 2 or Canvas", `AUTO` mode "tries WebGPU first", Canvas2D-style rendering API, built-in physics and Tiled support ([README](https://raw.githubusercontent.com/melonjs/melonJS/master/README.md)). A game engine that owns its loop, scenes and physics; scene-graph shape not read.
- **PlayCanvas engine 2.24.0** (2026-11-09, MIT, 56 stable releases in 12 months, 2.83 MB / 730 KB gzip whole-entry): "built on WebGL2 and WebGPU", "2D + 3D" ([README](https://raw.githubusercontent.com/playcanvas/engine/main/README.md)). Entity/component model; scene-graph fit not read.
- **KAPLAY** (`kaplay` npm): `latest` 3001.0.19 published 2025-06-15 (no stable release in the last 12 months); `next` tag 4000.0.0-alpha.27.1 published 2026-05-12; MIT; 1.8k stars, repo pushed 2026-11-11. WebGL/canvas details not read.
- `pixi.js-legacy` 7.4.3 (last published 2025-03-06) is the v7 line that carried the Canvas fallback; not deprecated on npm.
- Rapier 2D is physics (out of scope per TASK-104); noted only because it showed up in the registry check.

## 4. Caveats on the numbers

- Bundlephobia size is the package's entry bundled and minified as a whole, not what a Gable scene using a few tags would ship. For Pixi, Babylon and Three the tree-shaken size depends on which side-effect/subpath imports are loaded. A measured build per library is not in this document.
- Release counts are stable semver tags only (no `-alpha/-beta`), from the npm `time` field. Three.js numbering is not semver (each release is a minor).
- Star counts and `pushed_at` from the GitHub REST API on 2026-11-12.
- Several library docs pages were summarised by a fetch tool rather than read in full; where a page "did not cover" something I wrote **not verified** rather than assuming.
- Gaps to fill if TASK-104.4 needs them: Pixi headless/Node testing; Pixi detached-object lifecycle (constructing objects before attaching); Three.js `setAnimationLoop` and 2D addons; Phaser detached game objects and v4 headless; Excalibur and Konva insert-at-index APIs; Two.js event/hit-testing model; whether Pixi's CanvasRenderer is documented as stable.
