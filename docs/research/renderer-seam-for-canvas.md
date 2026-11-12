# What Gable core assumes about the DOM, and what a second renderer under a DOM app needs (TASK-104.2)

Facts only, no design recommendations. Question: TASK-104.2 (`backlog/tasks/task-104.2 - ....md`, lines 21-23).

## Sources and caveats

- Code is read at commit `29d9e7d` (main). Paths are repo-relative, `file:line`.
- The Backlog files for TASK-99.x and TASK-104.x are not in this commit's tree. They were read from the main checkout (`C:/Users/Jason/.t3/projects/gable/backlog/tasks/`, branch `integration/js-engine`); the same 99.x files exist on `prototype/native-renderer-spike`. Cited below as `99.N:line`.
- TASK-99.7 has only one comment, its resolution (`99.7:32`); there is no separate final summary. It cites TASK-99.6, the styling-model ticket (99.8) and the Platform-services ticket (99.12).
- ADR 0005 (`docs/adr/0005-gable-native-owns-a-hybrid-renderer-on-wgpu.md`) exists on `integration/js-engine`, not in this commit. It is about the native renderer stack (wgpu compositor, vello_gpu behind a path seam, lines 3-5); it contains no statement about the Renderer contract.
- The v0 decision the resolution amends is `task-1.12 - Renderer-abstraction.md:41` onward.
- No test, doc or code in the repo mixes two renderers in one app (greps for "second renderer", "two renderers", "different renderer", "another renderer" return nothing relevant; the only related text is `packages/ui-primitives/src/env.ts:9-12`, about running machines under the test renderer).

## 1. The Renderer contract (`packages/core/src/renderer.ts:23-69`)

The contract is described as "a small set of synchronous operations over opaque node handles" (`renderer.ts:17-19`). Node type `N` is opaque (`renderer.ts:21`).

Operation by operation, with what the DOM and Test renderers do and what the core needs from it. "Natural / awkward" is stated only where the code or the 99.x tickets say something checkable; otherwise the facts are listed.

| Operation | Contract | Core call sites | DOM renderer | Test renderer |
|---|---|---|---|---|
| `createElement(tag, parent)` | `renderer.ts:31`; `parent` is "context only (e.g. SVG/MathML namespace); it does not insert" (`:30`) | `view.ts:197` (every template element, tag verbatim); `component.ts:289` (root host, tag from selector, `"div"` if none) | Picks HTML/SVG/MathML from tag + parent (`renderer-dom/src/renderer.ts:28-37, 99-109`); in DEV throws on tags not in its tag tables or hyphenated (`:101-107`) | Any tag string, returns plain node (`testing/src/renderer.ts:78`) |
| `createText` / `createAnchor` | `renderer.ts:32-33` | text: `view.ts:63`, `i18n-view.ts:21`; anchor: `view.ts:295, 406` (every `@if`, `@switch`, `@for`, `@defer`) | `renderer.ts:110-111` (Text, Comment) | `testing/src/renderer.ts:79-80` |
| `setProperty(node, name, value)` | `renderer.ts:36` | `[x]="..."` not consumed by a child component (`view.ts:98-99`); `[(x)]` writes (`:110-115`) | Writes `el[name]`, with an unsafe-name denylist (`:58, 115`), attribute fallback on SVG/MathML (`:49-54, 116`), DEV error for unknown property (`:117-119`) | `node.props[name] = value` (`testing/src/renderer.ts:81-83`) |
| `setAttribute(node, name, value\|null)` | `renderer.ts:37` | static attrs (`view.ts:90`), `[attr.x]` (`:101`), scoping token (`component.ts:190`, `view.ts:200`), `stampSelector` (`component.ts:266-267`), router `data-state` (`router-view.ts:49, 80`) | DOM attribute; rejects `on*` and `srcdoc` (`renderer.ts:123`) | `node.attrs` (`testing/src/renderer.ts:84-87`) |
| `setClass(node, name, on)` | `renderer.ts:38` | `[class.x]` (`view.ts:102-103`), `stampSelector` (`component.ts:268`), router outlet classes (`router-view.ts:155-156`) | `classList.toggle` (`renderer.ts:127`) | `node.classes` (`testing/src/renderer.ts:88-92`) |
| `setStyle(node, name, value\|null)` | `renderer.ts:39` | `[style.x]` (`view.ts:104-105`; `null`/`false`/`undefined` become `null`, else `String(value)`) | kebab-cases the name, `style.setProperty` (`renderer.ts:56, 128-132`) | `node.styles` (`testing/src/renderer.ts:93-96`) |
| `setText` | `renderer.ts:40` | `view.ts:79`, `i18n-view.ts:29` | `textContent` (`renderer.ts:133`) | `testing/src/renderer.ts:97-99` |
| `insert(parent, node, before?)` | `renderer.ts:43` | initial placement (`view.ts:64, 201, 296`) and moves of already attached nodes in `@for` (`view.ts:508`) | `insertBefore` (`renderer.ts:135`) | detaches first, then splices (`testing/src/renderer.ts:100-106`) |
| `remove(node)` | `renderer.ts:44` | `disposeAndRemove` (`removal.ts:29-31`, used by `@if/@switch/@for/@defer` at `view.ts:310, 422, 469` and router `router-view.ts:53`), `PreparedComponent.clear` (`component.ts:215`), `instantiate` destroy (`:309`), DEV rebuilds (`:248, 253`, `view.ts:34, 174, 179, 264`) | `ChildNode.remove()` (`renderer.ts:142`) | `detach` (`testing/src/renderer.ts:122`) |
| `listen(node, name, handler) -> unsubscribe` | `renderer.ts:47` | `(event)` bindings (`view.ts:120-123`; handler gets `$event` = whatever the renderer passes, `view.ts:127-130`); the `${name}Change` event of an unconsumed `[(name)]` (`view.ts:117`, comment `:116`: "The renderer decides what produces `<name>Change`"); `waitForExit` registers `animationend/animationcancel/transitionend/transitioncancel` (`transition.ts:58, 66-71`) | `addEventListener`; maps `fooChange` to the control's event or to `CustomEvent.detail` (`renderer.ts:144-158`) | stores handlers per name (`testing/src/renderer.ts:123-130`); no mapping of `Change` events |
| `registerStyles?(id, css, {scoped})` | `renderer.ts:49-50`, returns scoping token ("empty when `scoped` is false") | `registerComponentStyles` (`component.ts:87-97`): joins `meta.styles` to one CSS string, skipped when the renderer has no `registerStyles` (`:90`), cached per renderer object in a `WeakMap` (`:84, 92`); token stamped on host (`:190`) and on every element of the component's template (`view.ts:200`) | `<style data-gable>` in `document.head`, scoped via `scopeCss` (`renderer.ts:201-212`) | records CSS in a Map, returns `g-<id>` (`testing/src/renderer.ts:167-170`) |
| `resolveTarget?(target)` | `renderer.ts:51-52` | `bootstrap` only (`app.ts:93-96`); absent with a `target` throws (`app.ts:94`) | selector or element (`renderer.ts:214-222`) | a test node (`testing/src/renderer.ts:171-177`) |
| `observeTrigger?` + `triggers?` | `renderer.ts:26, 53-54` | `defer.ts:154-161`; DEV throws if renderer has no `observeTrigger` or the name is not in `triggers` (`defer.ts:155-159`); `idle`/`timer`/`when` are core-owned (`defer.ts:64, 140-170`) | `viewport`, `interaction`, `hover` (`renderer-dom/src/triggers.ts:4, 19-56`) | none |
| `fieldControl?(node)` | `renderer.ts:55-56`; `FieldControl` = `write`, `setState`, `listen` (`:7-14`) | `bindNativeField` (`field-binding.ts:253-276`) throws "does not support [field]" when absent (`:255`). Custom controls (a component with `value = model()`) bypass the renderer (`field-binding.ts:244-247, 282-317`; `view.ts:256-257`) | Maps by `input type`/tag (`renderer.ts:160-199`, `controls.ts:5-27`) | Same mapping over `props`/`attrs` (`testing/src/renderer.ts:131-166`) |
| `overlayRoot?()` | `renderer.ts:57-63`; must be "in the same document/root node as the app" (`:60-62`) | `ui-primitives/src/portal.ts:32-40` (throws naming the renderer if absent), `ui-primitives/src/dnd.ts:36` | `options.overlayRoot` or `document.body` (`renderer.ts:136-139`) | A `gable-overlay` element under the mounted host (`testing/src/renderer.ts:64-73`) |
| `compare?(a, b)` | `renderer.ts:64-65`; "0 when unknown (detached)" | `registerEntry` for `viewChild/contentChildren` ordering (`view.ts:210-211`; `query.ts:64, 75-77`); with no `compare`, matches are appended in creation order (`query.ts:76-77`) | `compareDocumentPosition` (`renderer.ts:141`) | walks parent chain and `children.indexOf` (`testing/src/renderer.ts:107-121`) |
| `captureViewState?` / `restoreViewState?` | `renderer.ts:66-68` | only `retireView` (`dev-hooks.ts:95-105`), used by DEV HMR rebuilds (`component.ts:244, 339`, `view.ts:170`); both wrapped in try/catch | DEV only (`renderer.ts:224`; `renderer-dom/src/view-state.ts`) | none |
| `name?`, `providers?` | `renderer.ts:25, 28` | `providers` are put in the root injector by `bootstrap` (`app.ts:97`); `name` appears in errors (`defer.ts:66-68, 158`, `field-binding.ts:255`) | `name: "dom"`, six Platform-service providers (`renderer.ts:88-97`) | `name: "test"`, `platform.providers` (`testing/src/renderer.ts:74-77`) |

### Template-level facts the renderer has to live with

- The core knows no tags: any `<name ...>` matching `/^<([A-Za-z][\w-]*)/` is parsed (`template.ts:349-351`); the tag string is forwarded unchanged to `createElement` (`view.ts:197`). Only the void-element list is HTML-specific in the core (`template.ts:118-120, 389`).
- Attribute syntax is fixed by the core: `[x]` property, `[attr.x]`, `[class.x]`, `[style.x]`, `[(x)]` two-way, `(event)`, `#ref`, plain static attribute (`template.ts:468-488`). Names keep the source's case (`ATTR` at `template.ts:121`; no lower-casing in `addAttribute`).
- A `#ref` on an element binds the node handle itself into template locals (`view.ts:203`) and into `viewChild("ref")` queries as `node` (`view.ts:211`; `query.ts:97`, `valueOf = e.instance ?? e.node`).
- An element whose attributes/bindings match a component's selector becomes that component's host and the component renders into it with the same renderer (`view.ts:137, 205-208`).
- `{{ }}` text is always a text node created via `createText` and inserted (`view.ts:61-65`); text children of any element, including under a non-DOM renderer's "scene" tags, go through the same path.
- Bindings are core effects (`view.ts:94, 112`); the core schedules one microtask flush for all effects (`signals.ts:224-226`; `flushNow` ordering by scope depth then seq, `signals.ts:239-242`). The renderer is not involved in scheduling, and the contract has no per-frame or "end of flush" hook; `runAfterFlush` (`signals.ts:229-233`) is a core function, not a renderer operation.
- `remove` is only called on root nodes of a part, never on their descendants (`view.ts:34, 310, 422, 469`; `component.ts:215` iterates `part()` roots). The 99.7 resolution makes the same observation (`99.7:32`, item 6).
- Moves are `insert` on an already attached node (`view.ts:508`); the Test renderer handles that by detaching first (`testing/src/renderer.ts:101`).
- `createElement`'s `parent` argument is passed only for namespace context (`renderer.ts:30`); in `instantiate` it is `options.parent ?? null` (`component.ts:289`).

### Core code that touches the DOM or browser globals outside the Renderer (verified by grep over `packages/core/src` non-test files)

- `defer.ts:109-112`: `requestIdleCallback`/`cancelIdleCallback` from `globalThis`, else `setTimeout`.
- `transition.ts:46-47` (`matchMedia`), `transition.ts:52-56` (`document.startViewTransition`), `exit-duration.ts:41-43` (`getComputedStyle`; returns null unless `host.nodeType === 1`). Both are overridable through `RouteTransitionOptions` (`transition.ts:14-25`).
- `devtools.ts:732` (`HTMLElement` highlight), `devtools.ts:946-972` (`document.createElement` overlay), `devtools.ts:830-840` (host tag/label read `tagName`/`tag`/`nodeName`, `getAttribute`, `textContent`, falling back to `"node"`/empty).
- `app.ts:99` and `designer.ts`, `hmr.ts:607` read `globalThis` hooks/`location.reload`.
- `input.ts`, `forms.ts` (the `Node` at `forms.ts:353-402` is a form-tree node), `scope.ts`, `view-context.ts` contain no DOM references (grep for `document.|window.|HTMLElement|Element|matchMedia|getComputedStyle|requestAnimationFrame` found none in them).
- `router-view.ts:20, 36-38`: the outlet uses `injectHost()` for its renderer and host (so it renders routes through whatever renderer owns the outlet's host).
- Platform-service Tokens in core (`platform.ts:8-119`): `Location`, `History`, `Title`, `Meta`, `LiveAnnouncer`, `FocusManager`. There are no `Geometry`, `FrameScheduler` or `MediaQuery` Tokens in `packages/` at this commit (grep matches only unrelated names in `ui-primitives/src/carousel.ts:184` and `ui/src/components/chart.ts:519+`).

## 2. How a renderer is chosen, and whether a subtree can use a different one today

### Selection

- `bootstrap(Root, { renderer, providers, target })` takes the renderer as an argument, "never a global" (`app.ts:69-76, 90`). It puts `{ provide: RENDERER, useValue: renderer }`, then `renderer.providers`, then user providers into a fresh root injector (`app.ts:97-100`) and calls `createComponent(Root, { renderer, injector, host })` (`app.ts:101`).
- `createComponent` uses `options.renderer`, else `injector.get(RENDERER)`, else throws (`app.ts:44-45`). `RENDERER` is read nowhere else in `packages/` outside tests except `designer/src/server/vite-plugin.ts:53, 78-79` (which provides it and passes `renderer` explicitly).
- `RENDERER` is an `InjectionToken` (`app.ts:8`), so a child injector could shadow it, but nothing in core reads it below the root.
- `createComponent` does not accept `parentScope` (`CreateComponentOptions`, `app.ts:21-31`; the call to `instantiate` at `app.ts:46-52` passes none), so a component created through it has a root scope (`component.ts:294`, `parentScope ?? null`) not owned by any calling component; its lifetime is the caller's `destroy()` (`app.ts:60`; `component.ts:306-310`).
- `instantiate` (exported through `@gable/core/internal`, `internal.ts:8`) takes `renderer`, `host`, `parent`, `parentScope`, `injector`, `inputs`, `lenientInputs` (`component.ts:271-283`). `router-view.ts:71-80` calls it this way with `parentScope: next`; the renderer there comes from `injectHost()` (`router-view.ts:20, 38`).
- `injectHost()` returns the `{ renderer, host }` of the component being set up (`component.ts:127-147`, set at `:176`). `INJECTOR` (`di.ts:28`) resolves to the injector that asked.

### Is the renderer fixed down a template?

- Inside a template the renderer is a function argument threaded through `buildNodes → buildNode → buildElement/buildIf/buildFor/buildSwitch/buildDefer/buildSlot/buildText` (`view.ts:28, 40-59, 134, 188-197, 280-289, 294, 319, 353, 405`; `defer.ts:70, 87`; `i18n-view.ts:18`). It is not stored on `Env`, `ViewContext` (`view-context.ts:181-194`) or the injector.
- A child component found by selector is prepared with the same `renderer` (`view.ts:208`; `prepare` options `component.ts:99-109`). The child's host is a node of that renderer created at `view.ts:197`.
- `<slot>` content is built with the same renderer, in the parent's Env (`view.ts:280-289`; `Content` at `view-context.ts:196-200`). `@if/@switch/@for` bodies (`view.ts:341-348, 369, 438`) and `@defer` blocks (`defer.ts:87`) use the caller's renderer too.
- Consequence verified in code: there is no template syntax or `meta` field that switches renderer for a subtree. A component can obtain a second renderer instance only through code, e.g. by calling `createComponent`/`instantiate` with an explicit `renderer` and a `host`/`parent` node (`app.ts:21-31`, `component.ts:271-283`). The host/parent node passed must be a node of the renderer given; `instantiate` does `renderer.createElement(...)` then `renderer.insert(options.parent, host)` when `parent` is given and the host is not adopted (`component.ts:289-291`), or adopts `options.host` and stamps the selector with `renderer.setAttribute`/`setClass` (`component.ts:265-269, 290`). With an adopted `host` that belongs to another renderer, no cross-renderer call is made by the core (`instantiate` makes calls only on `options.renderer`).
- Nothing in the repo exercises this path with two different renderers (see caveats).

### Injector scoping

- Each component with `meta.providers` gets a child injector of the parent's (`component.ts:154-157`); components without providers share the parent's injector (`:156`, `own = options.injector` when no providers). The injector reaches children through `ViewContext.injector` (`view-context.ts:187`, set at `component.ts:189`) and `prepare` options (`view.ts:208`).
- `bootstrap` adds `renderer.providers` only to the root injector (`app.ts:97`). A second renderer's `providers` (its Platform services) are only used if a caller adds them to an injector; `createComponent`/`instantiate` do not read `renderer.providers`.
- `RENDERER` in a child injector is not consulted by view building, since the renderer is passed down as an argument (above).

### Host nodes

- A component's host is supplied by the caller or created via `createElement` from the selector (`component.ts:289`); `meta.host` bindings run through `applyBindings(host, ...)` on the same renderer (`component.ts:196`).
- Scoping token is `renderer.setAttribute(host, token, "")` (`component.ts:190`).
- `resolveTarget` is only used by `bootstrap` (`app.ts:93-96`).

### Control flow, projection, `@defer`

- `createSwitcher` creates an anchor with `renderer.createAnchor()`, inserts it, and swaps bodies via `disposeAndRemove` (`view.ts:294-316`); `@for` keeps one anchor and moves rows via `insert` (`view.ts:406-408, 502-511`). So every control-flow block needs `createAnchor`, `insert` with a `before` node, and `remove` from its renderer.
- `holdRemoval` defers `renderer.remove` until promises settle (`removal.ts:14-34`); the held promise is created by cleanups (e.g. `router-view.ts:51`). The removal is called on the same renderer that built the nodes (`view.ts:310, 422, 469`).
- `@defer`: `placeholderNode` is the first element of the placeholder block (`defer.ts:79, 88`) and is handed to `observeTrigger` (`defer.ts:160`); `lazy()` entries load once (`defer.ts:109-118`); `idle`/`timer` use `globalThis` timers (`defer.ts:140-153`).
- Content projection: `partitionContent` splits children into slots keyed by `slot="name"` (`view.ts:270-277`), and `<slot>` is a template element named `slot` handled in `buildElement` (`view.ts:135`), not a renderer tag.

### HMR

- DEV only. `prepare` records `renderer` and `injector` per component (`component.ts:222-229`, `hmr.ts:173-174, 250-251`); style re-registration uses the stored renderer (`hmr.ts:572`).
- View rebuilds build the new view beside the old one with the component's own `renderer` and retire the old nodes via `retireView(renderer, ...)` (`component.ts:229-256`, `dev-hooks.ts:95-105`); `instantiate`'s DEV region does the same for roots, on `host` and `renderer` (`component.ts:312-353`). So HMR state is tracked per component, with the component's own renderer.
- Both rebuild paths depend only on `createScope`, the renderer ops, and (optionally) `captureViewState`/`restoreViewState`; the older v0 note says HMR "uses only `remove`/`insert`" (`task-1.12:41` onward, HMR comment).
- The designer hooks (`design.current?.element(el, node, env.instance)`, `view.ts:198`) and `design.current.listener(el, name, listener)` (`view.ts:122`) receive nodes of whichever renderer; `designer.ts:86` keys a `WeakMap<object, Entry>` by node, so object-valued handles are assumed (`designer.ts:86, 162`).

## 3. What the TASK-99.7 resolution says, and what it changes (`99.7:32`)

The resolution keeps the seam "low-level and nodes-only" and changes wording and DOM leaks only. Each numbered point, with the state of the current code:

1. Write ops keep names/signatures; contract becomes "applied by the end of the flush" (amends v0's "All synchronous", `task-1.12:41` onward, "Seam level"). Current contract text still says "synchronous" (`renderer.ts:17`). Native allocates integer handles JS-side and queues ops into one command buffer per flush. DOM and Test renderers still apply immediately.
2. Reads leave the Renderer for three new Tokens in core `platform`: `Geometry` (node rect, `observeSize`, `scrollIntoView`), `FrameScheduler` (rAF equivalent), `MediaQuery`. None exist yet (section 1). The ui-primitives/gable-ui port off direct `getBoundingClientRect`, `ResizeObserver`, `getComputedStyle`, `matchMedia`, `requestAnimationFrame`, `scrollIntoView` is stated as out of scope but a spec requirement.
3. `setClass`, `setStyle`, `registerStyles` keep signatures; `registerStyles` loosens from CSS to a "style source in a format the renderer documents", token optionally empty. (Code today: the core already accepts an empty token, `component.ts:96` returns `entry.token || null`, and skips renderers without `registerStyles`, `:90`.)
4. `setProperty` on native carries only strings, numbers, booleans, null and node handles; other values are a dev-time error naming renderer and property. The DOM renderer "still accepts anything" (e.g. `renderer.ts:120`).
5. Events: DOM-compatible names/fields (`click`, `pointerdown`, `pointermove`, `pointerup`, `keydown`, `keyup`, `input`, `change`, `focus`, `blur`, `scroll`, `wheel`); `$event` a plain data object with `preventDefault`/`stopPropagation`; cancelable events with a listener are a blocking round trip; touch and mouse arrive as pointer events.
6. `remove` is terminal (host releases the subtree under a removed root), `holdRemoval` may defer it; `compare` served from a JS-side mirror of tree order; `fieldControl`, `overlayRoot` ("a top layer in the same window"), `resolveTarget` (window identifier such as `"main"`), `observeTrigger` (viewport, interaction, pointer-only hover) and optional `captureViewState`/`restoreViewState` keep signatures. The Test renderer has no new obligations beyond fakes for the three Tokens.

Related 99.x resolutions that bear on the seam (read, not re-derived):

- Styling model (`99.8:34`): "Scoped styles: unchanged core; `registerStyles` returns a scoping token that the core stamps with `setAttribute`, and the host compiles scoped selectors to the same attribute selectors the DOM renderer produces." `::before`/`::after` are style-system boxes "with no Renderer handles, so the seam is unchanged".
- Shared template vocabulary (`99.9:42`): native uses HTML tag names, "no primitive tags" of its own; `canvas` is in the v1 tag set with width/height attributes; "no native-only tags in v1: the extension point is hyphenated names that a host registers, typed through the element map; an unregistered hyphenated tag is a native error"; each renderer ships an element map (properties, tags, events) for the template language service; unknown-tag errors are dev-only. Unknown-tag/property behaviour for the DOM renderer is at `renderer-dom/src/renderer.ts:101-107, 117-119`, and v0 says renderers "ship a TypeScript element/property map" (`task-1.12:41` onward, "Tags/properties").
- Media and canvas (`99.17:43`): "a template ref on native resolves to a lazily created JS-side element facade ... the Renderer node type stays opaque and the DOM renderer returns the real element", with `canvas.getContext('2d')` as a documented example; canvas 2D contexts reserve `webgpu`/`webgl2` names; WebGL/WebGPU contexts are out of native v1. (Today a `#ref` returns the raw node, `view.ts:203`.)
- Platform services (`99.12:33`): `Geometry`, `MediaQuery` and the window's overlay root are per-window, requiring "a window injector level" in core; `FrameScheduler` "calls back once per display refresh with a timestamp before layout"; the root component mounts "through the Renderer's `resolveTarget(id)`"; "Renderer handle space is global; a node belongs to the window it is inserted under; inserting a node across windows is a dev-time error and a component moves by being re-created"; Tokens are always provided, with an `isSupported` flag. No window-injector level exists in `di.ts` (the injector API is `get/run/createChild/destroy`, `di.ts:74-82`).
- v0 Renderer abstraction (`task-1.12:41` onward): "the core knows nothing about tags or properties"; `createElement(tag, parent)` lets the renderer pick SVG/MathML context ("native ignores it"); "`$event` ... renderer decides"; "No event modifiers in v0"; "Static fast path: not in v0"; `@defer` unknown trigger = dev-time error naming the renderer; "Test renderer ... second implementation, keeping the seam honest".
- GLOSSARY: Renderer ("pluggable layer that turns a Component's Template into output on a target platform", `GLOSSARY.md:39-40`), Platform services (`:43-44`), Test renderer ("reference implementation of the Renderer contract", `:47-49`), Host ("renderer-provided output node a Component mounts into ... Not a custom element", `:59-60`).

## 4. Reusable pieces and gaps for a non-DOM renderer (facts about what exists)

### Existing machinery a second renderer gets without changes

- The `Renderer<N>` interface with only the write ops + `listen` required; everything else is optional (`renderer.ts:23-69`). Every optional op has a defined failure or no-op in the core: no `registerStyles` skips styles (`component.ts:90`); no `resolveTarget` errors only if `target` is passed (`app.ts:93-95`); no `fieldControl` errors only for `[field]` on a native element (`field-binding.ts:255`); no `compare` falls back to creation order (`query.ts:76-77`); no `overlayRoot` errors only for `<ui-portal>` (`ui-primitives/src/portal.ts:32-36`); no capture/restore is skipped (`dev-hooks.ts:98, 105`); `triggers`/`observeTrigger` absent errors only on non-core `@defer` triggers (`defer.ts:155-159`).
- The conformance suite `defineRendererConformance(api, harness)` (`testing/src/conformance.ts:41-321`) covers: create/insert/before, move and remove, anchors, text/property/attribute/class/style updates, `listen` and unsubscribe (`:56-134`), `fieldControl` mappings (`:135-236`, requires `harness.edit`/`blur`, `:22-25`), `registerStyles` token rules (`:237-250`), and `bootstrap`/`createComponent` on the renderer including `@for` ordering and scoping-token stamping (`:251-321`). The harness needs the renderer's nodes to expose `tag`, `children`, `text`, `attribute`, `hasClass`, `style`, `property`, `fire` (`:11-27`). It does not exercise `compare`, `overlayRoot`, `observeTrigger`, `captureViewState`, `resolveTarget` with `@defer`, or slots/`@if`/`@defer` as separate cases (by the test titles listed in the file).
- The Test renderer (`testing/src/renderer.ts:49-179`) is a complete in-memory implementation including `compare`, `overlayRoot`, `fieldControl`, `registerStyles`, `resolveTarget`; `mount()` accepts `options.renderer` and mounts under a `createTestRoot()` container (`testing/src/index.ts:239-254`).
- The DOM renderer already builds `<canvas>` as a known HTML tag (`renderer-dom/src/tags.ts:19`) and returns the raw element for `#ref` (`view.ts:203`).
- `listen` has no DOM requirement in the core: handlers receive whatever the renderer passes (`view.ts:127-130`); the only core listeners with fixed event names are `waitForExit` (`transition.ts:58-71`) and the DOM-only `${name}Change` convention (`view.ts:117`).
- `injectHost()` gives a directive-style class the renderer and host of its element (`component.ts:127-147`); core's router outlet already uses it to render under the host's renderer (`router-view.ts:20, 36-80`).

### Gaps found (each stated against code; none are proposals)

1. No template-level way to render a subtree through a different renderer (section 2). The renderer is a function argument through `view.ts`/`defer.ts`/`i18n-view.ts`; `Env`/`ViewContext` do not carry it.
2. `createComponent` cannot take a `parentScope`; a dynamically created component is a root scope not owned by the calling component (`app.ts:21-31, 46-52`; `component.ts:294`). `instantiate` can (`component.ts:271-277`) but is under `@gable/core/internal` (`internal.ts:8`).
3. `createComponent`/`instantiate` do not install `renderer.providers`; only `bootstrap` does (`app.ts:97`). A second renderer's Platform services (and the `RENDERER` token) are not set up for a component mounted that way.
4. `bootstrap` is the only user of `resolveTarget` (`app.ts:93-96`), and is single-root; `bootstrap` also owns `injector.destroy()` (`app.ts:107-111`).
5. Contract text says "synchronous" (`renderer.ts:17`); 99.7 amends that to "applied by the end of the flush", not yet reflected in the code or doc comment. No hook runs at the end of a core flush that a renderer could use: `flushNow` (`signals.ts:242-288`) and `runAfterFlush` (`signals.ts:229-233`) are core internals not exposed through `Renderer`; `whenFlushed` is exported from `@gable/core/internal` (used in `testing/src/conformance.ts:2`).
6. `FrameScheduler`, `Geometry`, `MediaQuery` do not exist yet (section 1); core's own timing paths use browser globals (`defer.ts:109-112`; `transition.ts:46-56`; `exit-duration.ts:41-43`) with partial overrides only for transitions (`transition.ts:14-25`).
7. `listen` for `${name}Change` (two-way `[(x)]` on a non-component element) is renderer-defined; the Test renderer does nothing special for it (`testing/src/renderer.ts:123-130`); a renderer that does not emit `xChange` leaves `[(x)]` a one-way binding (`view.ts:112-118`).
8. `setProperty` is the only way a binding reaches a non-attribute value (`view.ts:98-99`); the 99.7 "primitives only on native" rule is a renderer-side check, not enforced in core. The Test renderer stores anything (`testing/src/renderer.ts:81-83`); the DOM renderer accepts any value and throws on unknown names in DEV (`renderer.ts:117-120`).
9. `registerStyles` is invoked for any component with `meta.styles` and `encapsulation !== "none"` gets a `scoped: true` request (`component.ts:87-97`); scoped-token stamping happens through `setAttribute` on every element and on the host (`view.ts:200`, `component.ts:190`). A renderer without `registerStyles` silently ignores `meta.styles` (`component.ts:90`).
10. No window/injector level for per-window services (`di.ts:74-82`), required by `99.12:33`.
11. DEV hooks and devtools make DOM-leaning assumptions: devtools highlight and overlay use `HTMLElement` and `document` (`devtools.ts:732, 946-972`), the host label reads `getAttribute`/`textContent` (`devtools.ts:835-840`), and `designer.ts:86` keys per-node data by object identity. Host tag falls back to `"node"` for handles without `tagName`/`tag`/`nodeName` (`devtools.ts:830-833`). Integer handles (as 99.7 proposes for native) would not be valid `WeakMap` keys at `designer.ts:86`.
12. Query `viewChild("ref")` returns the raw node (`query.ts:97`, `view.ts:211`); 99.17 describes element facades, which do not exist in code.
