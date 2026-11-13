# Canvas author guide

`@gable/renderer-pixi` lets a Gable app draw a 2D scene with PixiJS 8 while everything else, the HUD, menus and routing, stays ordinary DOM. This guide is the set of patterns to follow when you build a game or an interactive scene with it. Each section has an example that runs: the files are in `packages/renderer-pixi/src/guide/` and are tested against the scene test renderer, so what you read here is what the tests execute.

Companion pages: [loading assets](./canvas-assets.md), [hit areas](./canvas-hit-areas.md) and [very high counts with `<particle-container>`](./canvas-particles.md).

## How a canvas fits into a page

The DOM page holds a `<gable-canvas>` host. Components in the host's template build Pixi display objects instead of DOM nodes, using scene tags (`container`, `sprite`, `text`, `graphics`, `tiling-sprite`, ...) with Pixi's own property names, bound to signals like any other template.

```html
<h1>Dodge</h1>
<gable-canvas aria-label="The game field" [options]="options">
  <game-rocks></game-rocks>
</gable-canvas>
<p>Score {{ world.score() }}</p>
```

Two things to know from the start.

**Scene components belong in a host component's own template.** The host and its services (`Frame`, `CanvasSize`, `Pointer`, `Keyboard`, `Gamepad`, `ReducedMotion`) exist inside the renderer boundary. A component that you write between `<gable-canvas>` and `</gable-canvas>` in a page is declared by the page, so its injection resolves in the page's injector (ADR 0019), where those services do not exist: `inject(Frame)` there fails, and the component does not build. The same holds for the host component's own Setup, which is built by the parent renderer: injecting `Frame` or `Pointer` there throws a "No provider" error that names the cause. Put the scene in a component of its own, whose template starts the scene, and use that component's template for everything that needs a boundary service. Services you provide yourself (a `World`, a score) are visible from both sides, which is the point: they are how the DOM HUD and the scene share state.

**Testing uses the scene test renderer.** `createSceneTestRenderer()` from `@gable/renderer-pixi/testing` is an in-memory scene with the real tags and the real `Frame`, `Pointer`, `Keyboard` and `Gamepad` services, driven by a deterministic frame step. `mountWithScene` mounts a page with a canvas in it, so one fixture queries the DOM HUD and the scene. In production the host is `<gable-canvas>`; in a test, `renderer: scene.boundary` makes a component the host. This is the shape every example test below uses:

```ts
import { describe, expect, it } from "vitest";
import { html } from "@gable/core";
import { createSceneTestRenderer, mountWithScene } from "@gable/renderer-pixi/testing";
import { Rocks, World } from "./entities.js";

// In production the host is <gable-canvas>; the test renderer's boundary stands in for it. The scene components are in
// the host component's OWN template (ADR 0019).
function mount() {
  const scene = createSceneTestRenderer();
  class Canvas {
    static meta = { selector: "game-canvas", imports: [Rocks], renderer: scene.boundary, template: html`<game-rocks></game-rocks>` };
  }
  class Page {
    static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
  }
  const fixture = mountWithScene(Page, { scene });
  return { scene, fixture, world: fixture.injector.get(World)! };
}

describe("guide: entities as components, state in services", () => {
  it("renders one component per entity from the service's list and moves them each frame", () => {
    const { scene, fixture, world } = mount();
    world.spawn(100);
    world.spawn(200);
    fixture.frame(16);
    expect(scene.findAll("sprite#rock")).toHaveLength(2);
    expect(scene.find("sprite#rock")!.x).toBe(100);
    expect(scene.find("sprite#rock")!.y).toBeCloseTo(1.92);
  });

  it("a tap on an entity updates the service, and the entity goes away", () => {
    const { scene, fixture, world } = mount();
    world.spawn(100);
    fixture.frame(16);
    scene.pointer.tap(110, 10);
    fixture.frame(16);
    expect(world.score()).toBe(10);
    expect(scene.findAll("sprite#rock")).toHaveLength(0);
  });
});
```

## Entities are components; state lives in services

The default shape is: each entity is a Gable component with its own signal-bound template; the scene's template composes entities; services hold the state that matters and coordinate them. Entities are plain data in a service's list, and an entity component renders that data and owns only transient view state.

```ts
import { html, inject, input, signal } from "@gable/core";
import { Frame } from "@gable/renderer-pixi";

/** An entity is plain data. */
export interface Rock {
  id: number;
  x: number;
  y: number;
}

/** Game state lives in a root service, so it survives scene rebuilds and hot edits. */
export class World {
  static scope = "root";
  rocks = signal<Rock[]>([]);
  score = signal(0);
  nextId = 1; // not #private: hot edits can carry it over

  spawn(x: number): Rock {
    const rock = { id: this.nextId++, x, y: 0 };
    this.rocks.update((all) => [...all, rock]);
    return rock;
  }

  hit(id: number): void {
    this.rocks.update((all) => all.filter((r) => r.id !== id));
    this.score.update((s) => s + 10);
  }

  fall(dt: number): void {
    this.rocks.update((all) => all.map((r) => ({ ...r, y: r.y + 120 * dt })));
  }
}

/** One entity, one component: its template binds the entity's data to a sprite. */
export class RockView {
  static meta = {
    selector: "game-rock",
    template: html`<sprite label="rock" [x]="rock().x" [y]="rock().y" width="32" height="32" (pointertap)="world.hit(rock().id)" />`,
  };
  rock = input.required<Rock>();
  world = inject(World);
}

/** The scene composes the entities; it also owns the per-frame update through the Frame service. */
export class Rocks {
  static meta = {
    selector: "game-rocks",
    imports: [RockView],
    template: html`@for (r of world.rocks(); track r.id) {<game-rock [rock]="r"></game-rock>}`,
  };
  world = inject(World);
  tick = inject(Frame).onFrame((dt) => this.world.fall(dt));
}
```

Why services: a hot edit to a component class rebuilds its instances (see [HMR rules](#hmr-rules)), and the DOM HUD needs the same score the scene does. State in a root service survives the first and is shared for the second. The `World` above is not `#private` anywhere, and the entity list is replaced rather than mutated, so `@for` with `track r.id` keeps one component per entity.

## The Frame service

Gable owns one frame loop per canvas boundary. Each frame runs in this order (ADR 0020): frame hooks run with `dt` and write signals; then one synchronous flush applies those writes to Pixi nodes; then one render. Input events between frames only mark the scene dirty; the next frame picks them up. The loop pauses when the tab is hidden or the host is detached.

`inject(Frame)` gives you two registrations. Both are tied to the component that registers them and are removed when its scope ends.

| call | runs |
| --- | --- |
| `onFrame(dt => ...)` | every frame; `dt` is seconds since the previous frame, clamped to 50 ms (`MAX_FRAME_DT`) so a stalled tab is not one giant step |
| `onFixedStep(hz, (dt, alpha) => ...)` | zero or more times per frame so simulated time keeps up with real time at exactly `hz` steps per second; `dt` is always `1 / hz`, `alpha` (0 to 1) is the unspent part of a step, for interpolating what you draw |

Fixed-step accumulators live in the `Frame` service, so rebuilding a scene never resets time debt. Physics is out of scope: use the fixed step to drive whatever engine you choose.

`renderMode="on-demand"` on the host renders only when a hook or an effect wrote to the scene, for scenes that are still most of the time. The default renders every frame.

```ts
import { html, inject, signal } from "@gable/core";
import { Frame } from "@gable/renderer-pixi";

/** Simulation state in a service: the clock and the fixed-step tick count survive scene rebuilds. */
export class Clock {
  static scope = "root";
  ticks = signal(0);
  blend = signal(0); // where we are inside the current step, 0 to 1
  x = signal(0);
}

export class Runner {
  static meta = { selector: "game-runner", template: html`<sprite label="runner" [x]="clock.x()" />` };
  clock = inject(Clock);
  frame = inject(Frame);

  // Every frame, with a variable dt in seconds (clamped to 50 ms).
  move = this.frame.onFrame((dt) => this.clock.x.update((x) => x + 100 * dt));

  // 20 deterministic steps per second, however fast frames come; alpha is the unspent part of a step.
  step = this.frame.onFixedStep(20, (_dt, alpha) => {
    this.clock.ticks.update((n) => n + 1);
    this.clock.blend.set(alpha);
  });
}
```

**Custom tags and the checker.** A tag you add with `renderer.registerTag("star", ...)` is known to `gable-check` and the editor when the call passes a string literal anywhere in the project; for any other registration list the name in the plugin option `"sceneTags": ["star"]` (tsconfig `compilerOptions.plugins`). Such a tag no longer raises `scene-unknown-tag`; its properties are not checked.

## Input services and DOM rules

**Pointer events on scene tags** map one to one to Pixi's federated event names, with the same bubbling: `(pointerdown)`, `(pointerup)`, `(pointerupoutside)`, `(pointermove)`, `(pointertap)`, `(pointerover)`, `(pointerout)`, `(rightdown)`, `(wheel)` and the rest. Attaching a listener turns on `eventMode: static` for you; `[eventMode]` overrides it (for example `dynamic` for hover while an object moves under a still pointer). Handlers receive Pixi's own `FederatedPointerEvent` unwrapped (`$event.global`, `$event.getLocalPosition(node)`, `$event.stopPropagation()`). A node is hit where its bounds are; to change that, see [hit areas](./canvas-hit-areas.md). The canvas takes no pointer input until its first frame has been rendered (before that no node has a position to hit, so the event would only reach the stage); that is a few milliseconds after mount.

**Services** (inject them in a scene component):

| service | gives you |
| --- | --- |
| `Pointer` | signals: `position` in scene coordinates, `buttons`, `overCanvas` |
| `Keyboard` | `isDown(code)`, `justPressed(code)`, `justReleased(code)` for frame hooks (`KeyboardEvent.code` names), plus a `keys` signal for templates |
| `Gamepad` | one snapshot of connected pads (axes and buttons) per frame, plus signals for connect and disconnect |

`createDrag` and `createLongPress` compose gestures from a node's `pointerdown` and the `Pointer` service; they are not template syntax. Call them in a component's setup and forward the event: `(pointerdown)="drag.down($event)"`.

```ts
import { html, inject, signal } from "@gable/core";
import { Frame, Keyboard, Pointer, createDrag } from "@gable/renderer-pixi";

export class Player {
  static meta = {
    selector: "game-player",
    template: html`
      <sprite label="ship" [x]="x()" y="100" width="40" height="40" (pointerdown)="drag.down($event)" />
      <sprite label="cursor" [x]="pointer.position().x" [y]="pointer.position().y" />
    `,
  };
  keyboard = inject(Keyboard); // polled per frame; listens only while the canvas host has focus
  pointer = inject(Pointer); // position in scene coordinates, as signals
  x = signal(0);
  shots = signal(0);

  // Dragging is composed from a pointerdown plus the Pointer service; it is not template syntax.
  drag = createDrag({ onMove: (e) => this.x.update((x) => x + e.step.x) });

  poll = inject(Frame).onFrame((dt) => {
    if (this.keyboard.isDown("ArrowRight")) this.x.update((x) => x + 200 * dt);
    if (this.keyboard.isDown("ArrowLeft")) this.x.update((x) => x - 200 * dt);
    if (this.keyboard.justPressed("Space")) this.shots.update((n) => n + 1); // true for exactly one frame
  });
}
```

**DOM and scene rules.** These are plain DOM rules; the scene adds none of its own.

- The HUD is DOM, next to or over the canvas. An overlay that must not block the game uses `pointer-events: none`, and its interactive children turn it back on with `pointer-events: auto`.
- The canvas gets `touch-action: none` by default so touch drags reach the scene; set the `touchAction` renderer option (for example `pan-y`) for a game strip in a scrolling page.
- Pointer down focuses the host, which has `tabindex="0"` unless you set one. The `Keyboard` service listens only while the host has focus, and releases every held key when focus leaves. Use a `(keydown)` binding on the DOM host for discrete handling, or the `keyboard: "global"` renderer option to listen on the window.
- The scene never calls `preventDefault` or `stopPropagation` on the underlying DOM event unless your handler calls the matching method on `$event`.
- There is no pointer capture. A drag that leaves the canvas still delivers moves, and ends with `pointerupoutside` on the node that was pressed.
- A `(wheel)` handler on a scene node cannot stop the page from scrolling (Pixi's wheel listener is passive, so `preventDefault` is ignored). Use CSS: `overscroll-behavior: contain`, or `touch-action`.

```css
.hud { position: absolute; inset: 0; pointer-events: none; }
.hud button { pointer-events: auto; }
```

Test input with `scene.pointer` (`move`, `down`, `up`, `tap`, `leave`), `scene.keyboard` (`press`, `release`, `blur`) and `scene.gamepad`; they drive the same services your components inject.

## Assets and loading UI

Assets load explicitly through the app-level `Assets` service; a scene never starts a load by itself, so loading state is signals you put in a template. Declare bundles once with `provideAssets({ bundles })`, then `inject(Assets).bundle("level1")` returns a handle with the signals `status` (`idle`, `loading`, `ready`, `error`), `progress` (0 to 1), `error` and `ready`, and the methods `load()` and `unload()`. Strings in templates (`texture="ship"`) are looked up synchronously in Pixi's asset cache, so guard nodes with `@if (level.ready())`. The [asset page](./canvas-assets.md) covers spritesheets, bitmap fonts, web fonts, lifetime and the Vite rules for hashed URLs.

Templates cannot compute (`level.progress() * 200` is rejected), so derive values in a `computed`.

```ts
import { computed, html, inject } from "@gable/core";
import { Assets, provideAssets } from "@gable/renderer-pixi";

/** Declared once, in the app's root providers. Import single files normally so Vite hashes their URLs. */
export const assetProviders = provideAssets({
  bundles: {
    level1: [{ alias: "ship", src: "/sprites/ship.png" }],
  },
});

export class Level {
  static meta = {
    selector: "game-level",
    template: html`
      @if (level.error()) {
        <text label="failed">Could not load the level</text>
      } @else if (level.ready()) {
        <sprite label="ship" texture="ship" />
      } @else {
        <graphics label="loading">
          <rect [width]="barWidth()" height="8" fill="#ffffff"></rect>
        </graphics>
      }
    `,
  };

  level = inject(Assets).bundle("level1");
  barWidth = computed(() => this.level.progress() * 200); // templates cannot compute: derive in a computed
  // Counted against this component's scope: unloads when the last scene using it goes. A failure shows in level.error(), so swallow the rejection here.
  start = this.level.load().catch(() => {});
}
```

`@defer (when level.ready()) { <game-world></game-world> }` keeps the heavy part of a scene out of the download until the assets are in. In tests, `provideTestAssets` replaces the asset system under the real `Assets` service and lets a test hold a load, report progress, finish it or fail it (`bundle.setStatus("loading", 0.25)`, `setStatus("ready")`, `fail(error)`); see `packages/renderer-pixi/src/guide/assets.test.ts`.

**Spritesheets and bitmap fonts: `?family`.** A descriptor names its image by relative path, which Vite's hashing would break. Add `gableAssetFamilies()` from `@gable/vite` to the Vite plugins and import the descriptor with the query: `import sheet from "./hero.json?family"` gives the URL of the descriptor with its siblings hashed and rewritten; use it as a bundle entry's `src`. For types, add `/// <reference types="@gable/vite/client" />` (or `"@gable/vite/client"` in tsconfig `types`). A real-browser test of the built output runs under `GABLE_BROWSER_SMOKE=1`.

## Accessibility checklist

A canvas is not exposed as content. There is no automatic accessibility tree guessed from sprites; what a user must perceive or operate comes from the DOM HUD, live announcements, or the opt-in semantic mirror below.

**What the framework provides**

- A labelled host. `<gable-canvas>` gets `role="group"` (an author's `role` wins) and takes `aria-label` or `aria-labelledby` from host attributes. It is `aria-hidden` only when you mark the scene decorative (`aria-hidden="true"` on the host). `role="application"` is opt-in only, because it suppresses screen-reader browse mode.
- Non-trapping focus. The host is one tab stop. Tab and Shift+Tab always leave, and Escape is never captured. The focus ring is DOM (an outline on the host or the mirror element), so forced-colours and system settings apply. Use the injected `FocusManager` for programmatic focus, for example to focus Resume when a pause menu opens.
- An opt-in semantic mirror. A scene tag accepts `[a11y]="{ role, label, description?, focusable?, order? }"`. The canvas package keeps a visually hidden DOM subtree beside the canvas with one real element per tagged node (`button`, `img`, `listitem`, ...), positioned from the node's bounds and ordered by scene order unless `order` overrides. When mirror elements exist they become the tab stops, in order. Activating one (click, Enter, Space) dispatches the node's own `pointertap` handler with `pointerType: "a11y"`, and also its `pointerup`, `click` and `tap` handlers when it has them. Enter and Space on a mirror element do not reach the `Keyboard` service. The `scene-pointer-a11y` lint asks for `[a11y]` on nodes that listen to activation events (down, up, tap, click, contextmenu and their right/mouse/touch variants) and not on hover or tracking events (over, out, enter, leave, move). Untagged nodes have no mirror. Pixi's built-in accessibility plugin is not used.
- Announcer access. Game events go through the injected `LiveAnnouncer` (`polite` or `assertive`), the same path the router uses. `announceOnChange(signal, format)` wires a signal to it, throttled to at most one polite message per second by default so a per-frame signal cannot flood a screen reader.
- A `ReducedMotion` service: a `reduced` signal that follows `prefers-reduced-motion`. The framework has no motion of its own to respect; your scene reads it to tone down shake, parallax and particles.

**What you must do yourself** (the checklist)

- [ ] Label the host with `aria-label` or `aria-labelledby` (or mark a purely decorative scene `aria-hidden="true"`).
- [ ] Mark every interactive node with `[a11y]`: a role and a label at least.
- [ ] Announce meaningful state changes (score, level, game over) through the `LiveAnnouncer`, for example with `announceOnChange`.
- [ ] Give every pointer action a non-pointer route: a keyboard handler, a mirror element, or a DOM control.
- [ ] Keep the HUD in the DOM, not in the scene: text, buttons and form controls are accessible, translatable and themeable there for free.
- [ ] Do not rely on colour alone to carry meaning.
- [ ] Respect `ReducedMotion` for any motion that is not essential.
- [ ] Do not trap focus: arrow-key navigation inside the scene is yours to build with `Keyboard`, but Tab and Escape must keep leaving.

There is no automated game accessibility audit in v1; a lint that flags pointer-listening nodes without `[a11y]` is a possible follow-up.

```ts
import { computed, html, inject, signal } from "@gable/core";
import { ReducedMotion, announceOnChange } from "@gable/renderer-pixi";

export class Score {
  static scope = "root";
  points = signal(0);
}

export class Hud {
  static meta = {
    selector: "game-hud",
    template: html`
      <sprite label="start" width="80" height="30" [a11y]="startA11y" (pointertap)="start()" />
      <sprite label="shaker" [x]="shake()" />
    `,
  };
  score = inject(Score);
  reduced = inject(ReducedMotion); // a signal: tone down shake, parallax and particles when it is true

  // Meaningful changes go through the app's LiveAnnouncer, throttled to one polite message per second.
  say = announceOnChange(this.score.points, (n) => `Score ${n}`);

  shake = computed(() => (this.reduced.reduced() ? 0 : 5)); // templates cannot use ?: derive in a computed

  startA11y = { role: "button", label: "Start game" };

  start() {
    this.score.points.set(1);
  }
}
```

Test it as recorded data: `scene.a11y()` returns the mirror's entries (`role`, `label`, bounds, order); `scene.focus(node)`, `scene.tab()` and `scene.press("Enter")` simulate focus movement and activation; `scene.click(node)` activates a node as a screen reader would; `fixture.announcer.messages` records announcements. The scene test renderer provides `ReducedMotion` like the real host: flip it with `scene.services.reducedMotion.reduced.set(true)`. The opt-in real-browser smoke suite adds an axe-core check on a host with a mirror.

## HMR rules

During development, Vite swaps edited modules without a reload. For a canvas game the aim is: the Pixi `Application` and its GL context survive every edit; durable game state survives; and a rebuilt scene never runs a hook or timer twice. The rules that make that true:

1. **Durable state lives in services.** The clock, score, entity list and physics data go in a root service (or in signals on one). Component fields hold view-local, derivable state. Editing a provider (adding a field to a root service) rebuilds the scene content below it, but not the Application.
2. **No `#private` members in hot-edited classes.** A method-only edit of a class is patched in place when it has no `#private` members; otherwise, and for any other class edit, all live instances are rebuilt. State transfer copies public fields by name and kind. Use plain (`private` in TypeScript is fine) fields instead.
3. **No raw `setInterval` or `setTimeout`.** A timer started in a component's setup and never cleared keeps running after the component is replaced, so every edit would add one. Use `Frame.onFrame` or `onFixedStep` (they unregister with the component's scope), or pair a timer with `onCleanup`. The dev build warns when a component registers a raw timer without `onCleanup`.
4. **`hotData` for resources that cannot be copied.** `hotData(key, create)`, called in a field initialiser, returns the value stored for this component's identity and calls `create` only the first time (in production it just calls `create`). `<gable-canvas>` uses it to keep its `Application`. Use it for a socket, a worker or any resource a replacement instance must inherit instead of rebuilding. On a page with several canvases, give each `<gable-canvas>` an `id` (or a `canvas-key` attribute): a rebuild hands each canvas back its own `Application` by that key, whatever order the rebuild creates them in. Canvases with neither are paired in the order they are created.
5. **Rebuilds are cheap and safe by construction.** An entity class edit rebuilds all live instances of it; that is fine because the state that matters is entity data in a service. Fixed-step accumulators live in the `Frame` service, so time debt carries across a rebuild, and a rebuild in the middle of a frame takes effect at the next frame, never inside one.

```ts
import { hotData, html, inject, signal } from "@gable/core";
import { Frame } from "@gable/renderer-pixi";

/** What must survive a hot edit lives in a root service: the spawn clock and the count. */
export class SpawnState {
  static scope = "root";
  spawned = signal(0);
  show = signal(true);
}

/** A non-copyable resource a component owns. hotData hands the same one back to the replacement instance. */
export interface Meter {
  id: number;
}
let meters = 0;

export class Spawner {
  static meta = { selector: "game-spawner", template: html`<container label="spawner" />` };
  state = inject(SpawnState);

  // No #private members here: a method-only edit of this class is then patched in place instead of rebuilt.
  meter = hotData<Meter>("meter", () => ({ id: ++meters }));

  // No setInterval and no setTimeout: a frame hook is removed with this component's scope, so a rebuild never leaves
  // the old timer running. Two spawns per second, deterministically, whatever the frame rate.
  every = inject(Frame).onFixedStep(2, () => this.state.spawned.update((n) => n + 1));
}
```

The repository's HMR suites in `packages/renderer-pixi` check these rules: Application survival, no leaked display objects over many edits (`npm run soak -w @gable/renderer-pixi`), the raw-timer warning, and service-state carry-over.

## Performance tiers

An entity as a component with signal-bound properties is the default and is affordable up to a point. Past it, move down a tier. The rule: when your scene's JS cost per frame (frame hooks, effect flush, render submit) passes **half a frame**, about 8 ms at 60 Hz and 4 ms at 120 Hz, move to the next tier.

| tier | how an entity is updated | fits, measured |
| --- | --- | --- |
| 1. components with signals | each entity is a component, each property a signal with a binding | up to about 1,000 entities (about 2,000 with three bindings each, about 5,000 with one binding, at half a frame) |
| 2. pose | one signal per entity feeding a point-like property, e.g. `[position]="pose().pos"` | a few thousand |
| 3. `#ref` writes | the entity writes to its Pixi node through a template `#ref`: no signals, no bindings | several thousand to about 10,000 |
| 4. `<particle-container>` | particles are plain records written through `particles(ref)` | 10,000 to 100,000 and beyond |

### Measured costs

These are the published figures, from the Pixi renderer spike and the TASK-104.14 budgets. The reference machine is an i9-9900KF with an RTX 2060 SUPER running Chromium through ANGLE D3D11. The counts below were measured with 60 Hz capped frames and software GL for the JS phases (software GL runs the JS phases 1.5 to 2 times slower than a real machine, so read them as conservative).

Costs you can use to compute your own scene:

- about **0.75 microseconds per binding write** (the effect flush re-running one property binding);
- about **0.8 microseconds per entity** for the one-signal style;
- about **0.3 ms of Pixi render submit per 1,000 sprites**.

Per frame, in milliseconds (hooks, flush and render together), as measured before the flush work described below:

| entities | 3 signals each | 1 signal, 1 binding | `#ref` writes | particles |
| --- | --- | --- | --- | --- |
| 5,000 | 18.4 (76 of 600 frames dropped) | 7.9 | 3.3 | |
| 10,000 | 41.9 | 16.9 (21 dropped) | 6.1 | |
| 100,000 | | | | 3.9 |

Read it as: three signals per entity is over a 16.7 ms frame at 5,000 entities; one signal per entity is over it at 10,000; `#ref` writes pass half a frame at about 10,000; a `ParticleContainer` with 100,000 particles cost 3.9 ms. The effect flush dominates the signal styles; Pixi's render submit stayed under 4 ms even at 10,000 display objects. The measured ceilings at half a 16.7 ms frame for Gable plus Pixi are about 2,000 entities with three bindings each, about 5,000 with one binding, and 10,000 or more with `#ref` writes.

### What the flush optimisation bought

TASK-105.17 profiled and measured four gated steps to cut flush time. The honest result, on the same machine and the canvas benchmark's three-signal style at 5,000 entities (15,000 binding effects per frame), measured interleaved against the baseline: flush p50 went from **22.2 ms to 15.9 ms, 28 percent less** (the `shared` style, 22.4 ms to 16.2 ms, also 28 percent). The target was 30 percent, so it **fell about 2 points short**. The kept changes were in Gable's own flush and in the renderer's property writes; one candidate (coalescing a node's bindings into one effect) gained only about 5 percent and was dropped because it is not behaviour-preserving. The largest remaining lever, native `#brand in` checks inside signal-polyfill, has since been applied by vendoring a rebuilt copy (upstream fix filed as proposal-signals/signal-polyfill#64): measured interleaved, the flush is now about 41 percent below the pre-optimisation baseline and total JavaScript per frame 29 to 32 percent below it. The full account is in `docs/research/frame-flush-optimisation.md`. The table above was measured before this work, so on the same hardware the signal tiers should now do somewhat better than it shows; the numbers are conservative, not re-published.

Not measured yet, and tracked as release-gate work: real-GPU execution time, Linux, macOS, integrated GPUs and a phone, 120 Hz displays, the WebGPU backend, long-run GC pressure, text, filters and masks, and high-rate DOM HUD updates beside the scene. Before release the same suite runs on at least one low-end laptop and one phone-class device, and those numbers are published beside these.

### Choosing a tier

Tier 1 is the right default. Reduce the binding count first (tier 2): one pose signal feeding `[position]` re-runs one binding where `[x]` and `[y]` re-run two. Tier 3 writes to Pixi nodes directly through a template `#ref` and a frame hook, which skips signals and bindings entirely; it works on real Pixi nodes, so it is not exercised by the scene test renderer, whose nodes are records. Tier 4, `<particle-container>`, is for many simple entities that need no events, children or per-entity logic beyond a per-frame loop (sparks, rain, bullets, star fields); see the [particle page](./canvas-particles.md) for its rules. Keep components for anything that needs pointer events, accessibility, children or its own state.

```ts
import { html, inject, signal, viewChild } from "@gable/core";
import { Frame, particles, pixiElements, type ParticleSet } from "@gable/renderer-pixi";

/** Tier 1, components with signals: fine up to about 1,000 entities. Each entity is a component, each property a signal. */
export class Dot {
  static meta = { selector: "game-dot", template: html`<sprite label="dot" [x]="x()" [y]="y()" />` };
  x = signal(0);
  y = signal(0);
}

/** Tier 2, pose: one signal per entity feeds a point-like property, so one binding re-runs, not two. */
export class PoseDot {
  static meta = { selector: "game-pose-dot", template: html`<sprite label="pose" [position]="pose().pos" />` };
  pose = signal({ pos: { x: 0, y: 0 } });
}

/** Tier 4, particles: plain records written directly; no signals, no bindings, no per-entity component. */
export class Sparks {
  static meta = { selector: "game-sparks", elements: pixiElements, template: html`<particle-container #sparks texture="spark" />` };
  sparks = viewChild("sparks");
  field: ParticleSet | undefined; // not #private (see the HMR rules)

  hook = inject(Frame).onFrame((dt) => {
    if (!this.field) {
      const ref = this.sparks();
      if (!ref) return; // the template is not built yet
      this.field = particles(ref);
      for (let i = 0; i < 1000; i++) this.field.add({ x: i, y: 0 });
    }
    for (const p of this.field.items) p.y += 40 * dt; // direct writes
  });
}
```

To see where a frame goes in development, add `debug` to the host (`<gable-canvas debug>`) or call `provideCanvasDebug()`: an overlay shows per-phase milliseconds (hooks, flush, render), rolling p50 and p95, dropped frames, the display-object count and the bindings re-run in the last frame. The reproducible benchmark is `examples/canvas-benchmark` (styles `signals`, `shared`, `ref` and `particles`); CI gates on relative regression of its JS-side phases (15 percent worse than a baseline from the same runner), never on absolute numbers.

## Known behaviours

These are not bugs to work around; they are how the canvas works, and each is easier to meet here than in a debugger.

- **(a) Scene components belong in a host component's own template.** Components projected into `<gable-canvas>` from a page resolve injection in the declaring component's injector (ADR 0019), so they cannot inject `Frame`, `CanvasSize`, `Pointer`, `Keyboard`, `Gamepad` or `ReducedMotion`. If a scene component fails to build and the error mentions one of those services, this is why. Move the scene into a component whose own template contains it.
- **(b) First-frame pointer events can fall through to the stage.** A pointer event that arrives before the first frame has run may be delivered to the stage instead of the node under the pointer. Do not depend on a tap in that window: enable a control only once the scene is showing, or give the same action a DOM control.
- **(c) A press and release within a single flush is a non-event** for `createDrag` and `createLongPress`: they read the `Pointer` service once per frame flush, so a press and its release that both land between two flushes never become a drag or a long-press. Moves within a frame coalesce to the latest position. (A node's own `(pointertap)` is not affected.)
- **(d) Hyphenated scene tags work in templates:** `tiling-sprite`, `nine-slice-sprite`, `bitmap-text`, `particle-container`, the `rounded-rect` graphics shape and the `hit-rect`, `hit-circle`, `hit-rounded-rect`, `hit-ellipse` and `hit-polygon` children. They are scene tags, not components, and need no import.
- **(e) The golden-image and real-browser smoke suites are opt-in.** They need a Chromium (set `GABLE_BROWSER` to a binary if none is found), so a plain test run skips them: set `GABLE_GOLDEN=1` for the golden-image suite (`npm run golden -w @gable/renderer-pixi`, and `golden:update` to rewrite the goldens) and `GABLE_BROWSER_SMOKE=1` for the smoke suite.

```ts
import { describe, expect, it, vi } from "vitest";
import { html } from "@gable/core";
import { createDrag } from "@gable/renderer-pixi";
import { createSceneTestRenderer, mountWithScene } from "@gable/renderer-pixi/testing";
import { Runner } from "./frame.js";

describe("guide: known behaviours", () => {
  it("(a) a scene component projected into the canvas from a page cannot inject boundary services", () => {
    const scene = createSceneTestRenderer();
    class Canvas {
      static meta = { selector: "game-canvas", renderer: scene.boundary, template: html`<slot></slot>` };
    }
    class Page {
      static meta = { selector: "app-page", imports: [Canvas, Runner], template: html`<game-canvas><game-runner></game-runner></game-canvas>` };
    }
    // Runner injects Frame, but projected content resolves injection in the page injector, where Frame does not exist:
    // the component fails to build (the error goes to the app error handler) and its sprite never appears.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const fixture = mountWithScene(Page, { scene });
    fixture.frame();
    expect(scene.find("sprite#runner")).toBeNull();
    errors.mockRestore();
  });

  it("(a) the same component works in the host component's own template", () => {
    const scene = createSceneTestRenderer();
    class Canvas {
      static meta = { selector: "game-canvas", imports: [Runner], renderer: scene.boundary, template: html`<game-runner></game-runner>` };
    }
    class Page {
      static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
    }
    const fixture = mountWithScene(Page, { scene });
    fixture.frame();
    expect(scene.find("sprite#runner")).not.toBeNull();
  });

  it("(c) a press and release inside one flush starts no drag", () => {
    const scene = createSceneTestRenderer();
    const log: string[] = [];
    class Card {
      static meta = { selector: "game-card", template: html`<sprite label="card" width="40" height="40" (pointerdown)="drag.down($event)" />` };
      drag = createDrag({ onStart: () => log.push("start"), onEnd: () => log.push("end") });
    }
    class Canvas {
      static meta = { selector: "game-canvas", imports: [Card], renderer: scene.boundary, template: html`<game-card></game-card>` };
    }
    class Page {
      static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
    }
    const fixture = mountWithScene(Page, { scene });
    scene.pointer.down(10, 10);
    scene.pointer.move(60, 10);
    scene.pointer.up(60, 10); // no frame between the press and the release
    fixture.frame();
    expect(log).toEqual([]);
  });

  it("(d) hyphenated scene tags work in templates", () => {
    const scene = createSceneTestRenderer();
    class Canvas {
      static meta = {
        selector: "game-canvas",
        renderer: scene.boundary,
        template: html`<tiling-sprite label="ground" /><graphics label="box"><rounded-rect [width]="10" [height]="10" [radius]="2" /></graphics><sprite label="icon" width="10" height="10"><hit-rect [width]="40" [height]="40" /></sprite><particle-container label="dust" />`,
      };
    }
    class Page {
      static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
    }
    const fixture = mountWithScene(Page, { scene });
    expect(fixture.scene.find("tiling-sprite#ground")).not.toBeNull();
    expect(fixture.scene.find("graphics#box")).not.toBeNull();
    expect(fixture.scene.find("particle-container#dust")).not.toBeNull();
    expect(fixture.scene.find("sprite#icon")!.hitShapes).toHaveLength(1);
  });
});
```
