---
id: TASK-99
title: Gable Native design map
status: To Do
assignee: []
created_date: '2026-11-07T21:36:00Z'
updated_date: '2026-11-07T22:30:00Z'
labels:
  - wayfinder:map
dependencies: []
ordinal: 186000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Destination

A spec for Gable Native: a decision-complete design for a native renderer that replaces the DOM for driving desktop (Windows, macOS, Linux) and Android applications, ready for a later effort to plan and build. It covers the architecture and host, the Renderer-seam changes, the styling model, the shared template vocabulary, platform services, the dev loop, testing and packaging, and a recommended build order. No renderer code is written in this effort beyond throwaway prototypes that answer a question.

## Notes

Consult GLOSSARY.md (Renderer, Platform services, Test renderer, Host) and the Gable v0 design map, especially its Renderer abstraction decision; the current seam is `packages/core/src/renderer.ts`, with the DOM implementation in `packages/renderer-dom`. Decided: the host is Rust and Gable owns its JavaScript engine (in Rust, behind an engine interface; an adopted engine such as QuickJS-NG runs in the interim). The implementation of the engine is a later effort. Working direction: an own-drawn renderer (Gable runs its own layout and GPU rendering on every platform), to be validated or overturned by the first tickets. Target apps are UI-heavy (forms, lists, text, dialogs, scrolling, IME, accessibility); custom canvas and game-like drawing is an extension point, not a v1 goal. Template vocabulary direction: a shared subset with the DOM renderer plus renderer-specific extras. macOS standing constraint: the author cannot test on a Mac, so every stack choice must be cross-platform or have a macOS implementation, macOS-specific behaviour (menu bar, Cmd shortcuts, IME, Retina scaling, Metal, code signing and notarization) is designed in from the start, and verification relies on CI macOS runners. The no-framework-compiler rule from v0 still holds. Prefer Node.js scripts over Python for any scripting.

## Decisions so far

- [Own-drawn UI stacks across Windows, macOS, Linux and Android](backlog/tasks/task-99.1%20-%20Own-drawn-UI-stacks-across-Windows-macOS-Linux-and-Android.md): Skia and Vello are 2D renderers, Parley and AccessKit are building blocks, Slint is a stable toolkit but GPLv3 or commercial with its own model, the Flutter embedder runs Dart. Findings on branch `research/own-drawn-ui-stacks`.
- [Embeddable JS engines for desktop and Android](backlog/tasks/task-99.2%20-%20Embeddable-JS-engines-for-desktop-and-Android.md): V8 has no Android prebuilt and is large; QuickJS is tiny with near-full ES2025 but no inspector; Hermes lacks an ES module loader; JSC is macOS-only in practice; no engine has an HMR API. Findings on branch `research/embeddable-js-engines`.
- [Text shaping, layout, rendering and input across the four platforms](backlog/tasks/task-99.3%20-%20Text-shaping-layout-rendering-and-input-across-the-four-platforms.md): HarfRust shaping with Parley and Fontique as the most complete reusable stack; every platform needs its own IME bridge; macOS clipboard unverified. Findings on branch `research/native-text-and-input`.
- [Accessibility bridging across the four platforms](backlog/tasks/task-99.4%20-%20Accessibility-bridging-across-the-four-platforms.md): AccessKit has adapters for all four platforms but is pre-1.0 with no rich text and weak announce support; direct adapters are the alternative. Findings on branch `research/native-accessibility`.
- [Layout engines, windowing and the app shell](backlog/tasks/task-99.5%20-%20Layout-engines-windowing-and-the-app-shell.md): Taffy covers block, flex and grid (scrolling and hit testing are ours); winit and SDL3 cover all four platforms, winit lacks menus (muda) and has unclear Android IME. Findings on branch `research/native-layout-and-shell`.
- [Architecture and host language](backlog/tasks/task-99.6%20-%20Architecture-and-host-language.md): Rust host; Skia behind a display-list boundary with Parley, Taffy and AccessKit; winit plus muda on desktop and GameActivity on Android; JS thread plus main UI thread with batched ops and a retained Rust tree; prebuilt host runtime plus app bundle; Gable owns its JS engine in Rust behind an engine interface, with an adopted interim engine until a test262 gate; own the seams, adopt commodity layers.
- [Engine design prior art and test262 mechanics](backlog/tasks/task-99.10%20-%20Engine-design-prior-art-and-test262-mechanics.md): Rust engines (Boa, Nova, Brimstone) use bytecode VMs with shapes and mark-sweep or compacting GC, none has an inspector or HMR API; test262 has no edition field, so an ES2025 gate needs a pinned commit plus feature lists. Findings on branch `research/js-engine-design-and-test262`.
- [Renderer seam changes for a non-DOM renderer](backlog/tasks/task-99.7%20-%20Renderer-seam-changes-for-a-non-DOM-renderer.md): write ops unchanged but applied by the end of the flush (amends v0 "all synchronous"); reads move to new Geometry, FrameScheduler and MediaQuery Tokens; primitives-only property values on native; DOM-compatible events with blocking dispatch only for cancelable ones; remove is terminal and releases the subtree; other optional ops keep their signatures.
- [Rust CSS style engines and Tailwind v4 feature inventory](backlog/tasks/task-99.14%20-%20Rust-CSS-style-engines-and-Tailwind-v4-feature-inventory.md): Stylo is the only browser-grade Rust style engine (MPL-2.0, Python at build time) and Blitz pairs it with Taffy and Parley; selectors and cssparser give matching only; Tailwind v4 output relies on @layer, @property, @supports, color-mix, oklch, :where and :has. Findings on branch `research/rust-css-style-engines`.
- [Styling model](backlog/tasks/task-99.8%20-%20Styling-model.md): CSS subset with loud dev-time diagnostics; flex, grid and block via Taffy, tables lowered onto grid, sticky and fixed positioning; Tailwind v4 selectors and at-rules; ::before and ::after as generated boxes; filters, backdrop-filter (blur and colour functions) and single-element 3D transforms in the first version, preserve-3d later; attribute-token scoping unchanged; adopt Stylo behind a style-system boundary, to be verified in the prototype.
- [Gable JS engine design](backlog/tasks/task-99.11%20-%20Gable-JS-engine-design.md): full ES2025 plus Annex B on ICU4X Intl; register and accumulator bytecode with shapes and inline caches, no JIT, serializable bytecode; precise non-moving mark-sweep with incremental slices between flushes; a host-driven engine interface; WinterCG globals but no window or document by default; no engine-level HMR primitive; debugger interface with a CDP adapter; a pinned test262 gate with a switch-over rule from the interim engine.

## Not yet specified

- Testing and conformance strategy, including macOS CI and reuse of the existing renderer conformance suite.
- Build, packaging and the Android toolchain, plus macOS signing and notarization.
- The display-list boundary between style, layout and the painter: isolated layers, backdrop reads, 4x4 matrices with perspective, damage tracking and picking.
- An optional, opt-in DOM-compat package for browser-only libraries (a small DOM subset over the renderer, never on by default).
- A prototype spike (the thinnest vertical slice) to prove the chosen stack.
- The shape of the later gable-ui and Designer ports, as requirements on the renderer only.

## Out of scope

- iOS (initial implementation).
- Web or WASM output of the native renderer.
- Porting the Designer to preview native apps.
- Porting gable-ui, the editor and the other packages (the spec notes what they will need from the renderer).
<!-- SECTION:DESCRIPTION:END -->
