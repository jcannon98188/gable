# Rust CSS style engines and Tailwind v4 feature inventory (TASK-99.14)

Question: what does Rust offer for CSS parsing, selector matching, cascade and computed-value resolution (Stylo, lightningcss, cssparser plus selectors, simplecss, others); how does Blitz combine them with Taffy, Parley and Vello; licences, binary-size and build-time costs, Android and macOS build story; which CSS features does Tailwind v4 output (and gable-ui's own CSS) rely on; how much of that does Taffy's style model cover. Facts and comparison only, no decision.

Researched 2026-11-07 from official docs, repos, crates.io and the repo's own built CSS. Page fetches were summarised by a fetch tool, so verbatim quotes are limited; follow the links for anything load-bearing. Where a source was silent this says "not stated". Earlier findings on Blitz, Taffy, Parley, Skia, Vello and winit are in `docs/research/own-drawn-ui-stacks.md` and `docs/research/native-layout-and-shell.md` (branches `research/own-drawn-ui-stacks`, `research/native-layout-and-shell`); this note only adds what is new. Nothing was built or run.

## 1. Rust CSS libraries

Crate versions and dates are from the crates.io API on 2026-11-07.

| Library | Scope (per its own docs) | Latest | Licence |
|---|---|---|---|
| `stylo` (servo/stylo) | "browser-grade CSS style engine": parse, selector match, cascade, computed values, animations | 0.23.0 (2026-11-02) | MPL-2.0 |
| `selectors` (in the stylo repo) | "CSS Selectors matching for Rust": parse, serialise, match against a generic element tree | 0.42.0 (2026-11-02) | MPL-2.0 |
| `cssparser` (servo/rust-cssparser) | "Rust implementation of CSS Syntax Level 3" (tokenizer and parsing helpers) | 0.38.0 (2026-09-07) | MPL-2.0 |
| `lightningcss` (parcel-bundler) | parser, transformer, bundler, minifier | 1.0.0-alpha.72 (2026-07-20) | MPL-2.0 |
| `simplecss` (RazrFalcon) | "A simple CSS 2 parser and selector" | 0.2.2 (2025-01-06) | Apache-2.0 OR MIT |
| `azul-css` | "Common datatypes used for styling applications using the Azul desktop GUI framework" (only the description was read) | 0.0.16 (2026-09-05) | MIT |
| `taffy` (layout only, for comparison) | CSS block/flex/grid layout | 0.15.1 (2026-10-25) | MIT |

Sources: https://crates.io/api/v1/crates/stylo, `/selectors`, `/cssparser`, `/lightningcss`, `/simplecss`, `/azul-css`, `/taffy`.

### Stylo
- "Stylo is a high-performance, browser-grade CSS style engine written in Rust that powers Servo and Firefox." The repo is Servo's downstream copy; upstream is mozilla-central. MPL 2.0. `selectors` and `servo_arc` are described as usable standalone; `cssparser` lives in servo/rust-cssparser. ([README](https://github.com/servo/stylo))
- Feature flags: `default = ["servo"]`; `gecko` pulls in `bindgen` and Gecko-specific code; `servo` pulls in `web_atoms`, `string_cache`, `url`, `encoding_rs`, `mime`, `serde`. ([style/Cargo.toml](https://raw.githubusercontent.com/servo/stylo/main/style/Cargo.toml)) Regular deps include `rayon`, `cssparser 0.38`, `selectors`, `servo_arc`, `euclid`, `icu_segmenter` (compiled data), `rustc-hash`. Edition 2024.
- Build: `style/build.rs` runs `properties/build.py` with a Python 3 interpreter (`PYTHON3` env var, else `python3` / `python.exe`; panics if none found). That script imports `mako`; the repo vendors Mako 1.3.10 and markupsafe wheels under `vendored_python`. ([build.rs](https://raw.githubusercontent.com/servo/stylo/main/style/build.rs), [build.py](https://raw.githubusercontent.com/servo/stylo/main/style/properties/build.py)) So building Stylo needs a working Python 3 on the build machine; no further Python packages are required.
- Embedding: the README does not list the traits an embedder must implement. Blitz's `stylo.rs` shows the surface: it implements `TDocument`, `TNode`, `TElement` for its own DOM (attributes, classes, ids, element state bits, animation hooks, selector flags), builds a `Stylist`, a `SharedStyleContext`, and runs `style::driver::traverse_dom`, optionally on a global rayon style thread pool. ([blitz-dom/src/stylo.rs](https://raw.githubusercontent.com/DioxusLabs/blitz/main/packages/blitz-dom/src/stylo.rs))
- Rule types present as source files in `style/stylesheets/`: `layer_rule`, `container_rule`, `property_rule`, `supports_rule`, `media_rule`, `keyframes_rule`, `starting_style_rule`, `scope_rule`, `nested_declarations_rule`, `import_rule`, `font_face_rule`, `position_try_rule`, `view_transition_rule`. Also `custom_properties.rs`, `invalidation/`, `color/`, `properties_and_values/`, `queries/`. ([directory listing](https://api.github.com/repos/servo/stylo/contents/style/stylesheets)) File presence shows the engine parses these; whether each is enabled in the Servo configuration (preferences) or wired up by the embedder is separate (see Blitz below).
- Release model: "Releases are made every time this repository rebases its changes on top of the latest version of upstream Stylo." Version numbers move fast (0.23 by Nov 2026); `selectors` README warns "breaking changes are made to this library fairly frequently."
- Servo, the main consumer, is "developed on 64-bit macOS, 64-bit Linux, 64-bit Windows, 64-bit OpenHarmony, and Android" and builds with `./mach` (uv, rustup; Xcode on macOS; ANDROID_SDK_ROOT and ANDROID_NDK_ROOT for Android). ([servo/servo README](https://github.com/servo/servo)) No Stylo-specific Android or macOS build page was found; the platform story for Stylo itself is inferred from Servo and Blitz.

### selectors and cssparser
- `selectors` matches selectors against "a generic tree of elements"; pseudo-elements and most pseudo-classes are generic. The README points to Kuchiki for an example tree and does not list `:is`, `:where`, `:has` or nth-of support. ([README](https://raw.githubusercontent.com/servo/stylo/main/selectors/README.md)) That is the layer Stylo uses for matching.
- `cssparser` is tokenizer and parsing infrastructure; it does not know CSS properties. Cascade, inheritance, custom property substitution and computed values would be written on top.

### lightningcss
- "An extremely fast CSS parser, transformer, bundler, and minifier written in Rust." Built on `cssparser` and `selectors` (uses a fork named `parcel_selectors`). ([README](https://github.com/parcel-bundler/lightningcss), [docs.rs](https://docs.rs/lightningcss/latest/lightningcss/))
- docs.rs: "supports fully parsing all CSS rules, properties, and values into normalized structures exactly how a browser would." `CssRule` variants include `Container`, `Property`, `LayerBlock`, `LayerStatement`, `Supports`, `StartingStyle`, `Keyframes`, `Media`, `Scope`, `Nesting`, `NestedDeclarations`. ([CssRule](https://docs.rs/lightningcss/latest/lightningcss/rules/enum.CssRule.html))
- Neither README nor docs.rs mentions selector matching against a DOM, cascade resolution or computed values. It transforms (prefixing, syntax lowering for older browsers including nesting, `color-mix()` and `oklch`/`lab` colours per README) and prints CSS.
- Features: `default = bundler, nodejs, sourcemap`; optional `visitor`, `substitute_variables` (enables `visitor`), `serde`, `browserslist`, `cli`. ([features](https://docs.rs/crate/lightningcss/latest/features)) What `substitute_variables` does is not described on the pages read.
- Tailwind v4 itself uses Lightning CSS internally: "Under the hood Tailwind uses Lightning CSS to process nested CSS". ([Tailwind compatibility](https://tailwindcss.com/docs/compatibility))

### simplecss
- Supports selector matching, specificity ordering, `@font-face` and `!important` parsing. "Most at-rules are not supported. They will be skipped during parsing." "Property values are not parsed." Case-sensitive, no Unicode escapes, "This is not a browser-grade CSS parser." Cascade and no_std not stated. ([README](https://github.com/RazrFalcon/simplecss))

### Other
- No other maintained browser-grade style engine was found in the sources read. `azul-css` (MIT) belongs to the Azul GUI framework; its capabilities were not read beyond the crates.io description.

## 2. Blitz: how the pieces combine

Source: [Blitz README](https://github.com/DioxusLabs/blitz), [blitz-dom Cargo.toml](https://raw.githubusercontent.com/DioxusLabs/blitz/main/packages/blitz-dom/Cargo.toml), workspace [Cargo.toml](https://raw.githubusercontent.com/DioxusLabs/blitz/main/Cargo.toml), [anyrender](https://github.com/DioxusLabs/anyrender).

- `blitz-dom` is "the core DOM abstraction, covering style resolution, layout, and event handling, but not parsing, rendering, or system integration. It uses Stylo for CSS parsing and resolution, Taffy for box-level layout, and Parley for text layout."
- Glue: `stylo_taffy` (in the Blitz repo; extra MPL-2.0 licence noted in the README) converts Stylo computed styles to `taffy::Style`. Features `floats` and `writing-mode` exist. Its README was not fetched; role inferred from name, Cargo features and README license note.
- `blitz-paint` turns the DOM into AnyRender draw commands. AnyRender backends: `anyrender_vello`, `anyrender_vello_hybrid` (vello_gpu), `anyrender_vello_cpu`, and `anyrender_skia` (via skia-safe); tiny-skia and femtovg not yet available. Blitz's own README lists only the Vello renderer for its wrappers; Skia backend exists at the AnyRender level. The CSS status page says filter is "Full with Skia backend; blur and drop-shadow only with Vello Hybrid", and backdrop-filter is supported with Skia.
- `blitz-shell`: winit, AccessKit, muda. `blitz-html`: html5ever. Not needed if the DOM is built directly (Blitz's Dioxus integration does that).
- Pinned versions in the workspace: `style` 0.23.0 and `selectors` 0.42.0 from the stylo git repo at a pinned rev, `cssparser` 0.38, `parley` 0.12, `accesskit` 0.25, `winit =0.31.0-beta.4`, Taffy and AnyRender by git rev or branch. Blitz version 0.3.0-beta.4 (2026-10-16), latest stable 0.2.4; edition 2024, `rust-version 1.91`. MIT OR Apache-2.0 (crates.io), `stylo_taffy` also MPL-2.0.
- Default `blitz-dom` features: `svg`, `woff`, `accessibility`, `system-fonts`, `file-input`, `custom-widget`, `text-transform-icu`. Also depends on `rayon`, `image`, ICU4X crates, `objc2` on Apple targets.
- Status: "beta"; "many bugs and missing features". Non-goals include JavaScript, WebRTC, WebSockets, localStorage. ([README](https://github.com/DioxusLabs/blitz))
- Platforms: "runnable builds of the Browser UI (Windows / macOS / Linux / Android)". Roadmap #119 lists "Mobile (Android/iOS) support #323" under 0.3 Beta, plus Android back button and app icon; the only Apple-specific item is a CJK font rendering fix. ([roadmap](https://github.com/DioxusLabs/blitz/issues/119))
- What Blitz wires up of Stylo (from `stylo.rs`): container queries are stubbed: `query_container_size` returns default with the comment "FIXME: Implement container queries. For now this effectively disables them without panicking." `update_animations` and `needs_transitions_update` are commented out in the file read (the status page nonetheless lists transitions and animations as supported). `:focus-visible`, `:placeholder-shown`, `:target` hardcoded to false; `:lang()` returns false; shadow DOM `todo!()`. `:has()` relative-selector flags are handled. Parallel traversal is guarded by a global lock because of a panic with concurrent traversals (issue #430).
- CSS status page ([blitz.is/status/css](https://blitz.is/status/css)), with the page's usage percentages: Transitions supported, Animations supported, 2D transforms supported, 3D transforms not, box-shadow supported, gradients supported, filter partial, backdrop-filter partial (Skia), `container-type` and `container` not supported. The page has no entries for `@layer`, `@property`, custom properties, `calc`, `color-mix`, `oklch`, `:where`, `:is`, `:has`, `@supports`, `@media`.
- Issue [#389](https://github.com/DioxusLabs/blitz/issues/389) (2026-04-14, a third-party component library report with a maintainer reply): `@media (hover: hover)` not supported (tracked in #252, since closed as completed); `position: sticky`, `::placeholder`, `backdrop-filter` blur, scrollbar styling "known not to be supported" at that date; `::after` only with string `content`; `:nth-child`, `:last-child` "should work, but untested, invalidation issues suspected"; 2D transforms "a bit buggy / incomplete". Other issues: #455 (Tailwind `group-hover` `:is(:where(.group):hover *)` descendant restyle, closed as completed); #1215 (Tailwind v4 `oklch` palette and `currentColor` in SVG rendered black, PR closed unmerged). These were found via an issue search; later fixes may exist.
- Binary size and build time: not stated in the README, roadmap or crate pages. A third-party docs page claims "~10-15MB" bundle size for Dioxus Native with no method; treated as unverified. No Stylo compile-time figure found.

## 3. Licences (as stated)

| Component | Licence |
|---|---|
| stylo, selectors, cssparser, lightningcss | MPL-2.0 |
| simplecss | Apache-2.0 OR MIT |
| Taffy | MIT |
| Blitz crates | MIT OR Apache-2.0 (`stylo_taffy` additionally MPL-2.0) |
| Servo | MPL-2.0 |
| Vello (earlier note) | Apache-2.0 OR MIT |

MPL-2.0 is a file-level copyleft licence; this note does not analyse its obligations.

## 4. What Tailwind v4 output and gable-ui CSS rely on

### Official statements
- v4 "is designed for Safari 16.4+, Chrome 111+, and Firefox 128+"; "We depend on modern CSS features like `@property` and `color-mix()` for core framework features"; "we are using native cascade layers" (so `@layer` is emitted as real CSS). ([upgrade guide](https://tailwindcss.com/docs/upgrade-guide)) It also supports `field-sizing: content`, `@starting-style`, `text-wrap: balance`. ([compatibility](https://tailwindcss.com/docs/compatibility))
- Layer order `theme, base, components, utilities`, with Preflight in `base`. Preflight sets `box-sizing: border-box`, zero margins/padding, `border: 0 solid`, unstyled lists/headings, `display: block` replaced elements, and `[hidden]:where(:not([hidden="until-found"])) { display: none !important; }`. ([preflight](https://tailwindcss.com/docs/preflight))
- Theme: `@theme` variables become `:root` custom properties, default palette in `oklch()`. Chained `var()` references resolve at the definition site unless `@theme inline`. ([theme](https://tailwindcss.com/docs/theme))
- Variant output: `group-*` is `:is(:where(.group)... *)`, `peer-*` `:is(:where(.peer)... ~ *)`, `has-*` `:has(...)`, `not-*` `:not(...)`, `in-*` `:where(...) &`, `nth-*` `:nth-child` and kin, `data-*`/`aria-*` attribute selectors, `supports-*` `@supports`, `starting` `@starting-style`, container variants `@container (width >= ...)`, `hover` `@media (hover: hover)`, `dark` `@media (prefers-color-scheme: dark)` (gable-ui overrides it), `motion-*`, `forced-colors`, and pseudo-elements `::before`, `::after`, `::placeholder`, `::file-selector-button`, `::marker`, `::selection`, `::backdrop`, `::first-line`, `::first-letter`. ([states](https://tailwindcss.com/docs/hover-focus-and-other-states))

### Measured in the repo
Built from `examples/ui-gallery` (Tailwind 4.3.5 plus `tw-animate-css` plus `packages/ui/theme.css`), file `examples/ui-gallery/dist/assets/index-hvCSwAxj.css`, 46,429 bytes (minified, so counts are regex counts, indicative only). `packages/gable-ui` and `packages/ui` carry no separate compiled CSS; `packages/ui/theme.css` is 4,183 bytes of oklch variables plus `@custom-variant dark (&:is(.dark *))`. Compiled output of all three shares one pipeline, so the gallery build is the representative sample.

| Feature | Present in output | Notes |
|---|---|---|
| `@layer` | 5 blocks: `properties`, `theme`, `base`, `components`, `utilities` | `@layer properties` holds a fallback inside `@supports`, see below |
| `@property` | 41 rules (e.g. `--tw-shadow`, `--tw-translate-x`, `--tw-enter-*`); the one inspected is `@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}` | composite utilities (`shadow-*`, ring, transforms, animations) read `var(--tw-...)` registered with initial values |
| `@supports` | 30 | e.g. `(color:color-mix(in lab, red, red))` guarding the `color-mix` branch; `(((-webkit-hyphens:none)) and (not (margin-trim:block))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b))))` wrapping the `@property` fallback; `(not ((-webkit-appearance:-apple-pay-button))) or (contain-intrinsic-size:1px)` |
| Custom properties and `var()` | ~490 `var(--...)` uses, with fallbacks such as `var(--tw-animation-duration,var(--tw-duration,.15s))` | |
| `calc()` | 128 | arbitrary values mix `calc()` and `var()` |
| `oklch()` | 38 | palette and theme |
| `color-mix()` | 56 | e.g. `color-mix(in oklab, currentcolor 50%, transparent)`, `color-mix(in oklab, var(--ring) ...)`; opacity modifiers on theme colours compile to it |
| `:where`, `:is`, `:not` | 11, 28, 3 | `:is(:where(.group):hover *)`, `:where([type=button],...)`, `:not([hidden=until-found])`, `:not([class*=size-])` |
| `:has` | 6 | e.g. `:has(>svg)`, `:has([role=checkbox])` |
| Attribute selectors | ~219 matches, many false positives from escaped class names | real ones: `[data-state=open]` (10), `[data-state=closed]` (9), `[data-orientation=...]`, `[data-highlighted]`, `[data-selected]`, `[data-drop-over]`, `[data-focus-visible]`, `[data-disabled=true]`, `[title]`, `[type=button]`, `[class*=size-]` |
| State pseudo-classes | `:hover`, `:focus`, `:focus-visible`, `:active`, `:disabled`, `:first-child`, `:last-child`, `:empty` | |
| Pseudo-elements | `::backdrop`, `::placeholder`, `::file-selector-button`, `::selection`, plus WebKit date/search internals in Preflight | no `::before`/`::after` counted in this sample |
| `@media` | `(width>=40rem)` etc. (range syntax) for breakpoints, `(hover:hover)`, `(forced-colors:active)` | |
| `@container` | 1 container declaration `container:card-header/inline-size`; no `@container (...)` query rules in this build | Tailwind generates query rules only for `@sm`-style variants, none used here |
| `@keyframes` | 5: `pulse`, `enter`, `exit`, `accordion-down`, `accordion-up` | `enter`/`exit` driven by `--tw-enter-*` registered properties (tw-animate-css) |
| `transition-property` | colour lists, `box-shadow`, `transform`, `translate`, `scale`, `rotate`, `filter`, `backdrop-filter`, `opacity`, plus `display`, `content-visibility`, `overlay`, `pointer-events` | the last four imply discrete transitions; `transition-behavior` itself not found in output |
| Transforms | individual `translate`, `scale`, `rotate` properties (not just `transform`) | |
| Layout | `display`: `block`, `flex`, `grid`, `inline-flex`, `inline-block`, `list-item`, `table`, `-webkit-box`, `none`; also `field-sizing` | |
| Units | `rem`, `em`, `px`, `%`, `vh/vw`-style via arbitrary values | `--spacing: .25rem` multiplied with `calc()` |
| Not found | `@starting-style` rules, gradient functions, `min()/max()/clamp()`, `light-dark()`, `@font-face` | `rgb(from ...)` appears only inside the `@supports` test |
| Nesting | none native in output | Lightning CSS flattens; `&` hits were escaped class names |

Build-time vs runtime: `@theme`, `@utility`, `@apply`, `@custom-variant`, `@source` and `@import` are Tailwind build directives resolved before the browser sees the file; the output contains only the plain CSS above. Tailwind is a build step (Lightning CSS based), so a native host would receive its compiled stylesheet. Tailwind's own docs call it "not designed to be used with CSS preprocessors".

## 5. Taffy's style model against that inventory

Source: [taffy::Style](https://docs.rs/taffy/latest/taffy/style/struct.Style.html) (0.15.1, 45 fields) and [Display](https://docs.rs/taffy/latest/taffy/style/enum.Display.html); earlier findings in `docs/research/native-layout-and-shell.md` section 1. Taffy takes already-resolved style values; it does not parse CSS, resolve `var()`, or evaluate selectors, so it covers only the layout slice of the table above.

| CSS used by the build | Taffy `Style` |
|---|---|
| `display: block, flex, grid, none` | `Display::{Block, FlowRoot, Flex, Grid, None}` (feature-gated) |
| `display: inline-flex`, `inline-block`, `inline`, `list-item`, `table`, `-webkit-box` | no inline or list-item variants in `Display`; `item_is_table`, `item_is_replaced`, `item_is_compressible_replaced` flags exist. Inline layout is not in Taffy (Blitz handles inline roots itself via Parley; "Inline roots" PR #464 is open) |
| `position` (static, relative, absolute, fixed), `inset` | `position`, `inset: Rect<LengthPercentageAuto>` |
| `sticky` | not implemented (earlier note, 0.15 changelog); Blitz lists it unsupported |
| `overflow`, scrollbar | `overflow: Point<Overflow>`, `scrollbar_width`; scroll offsets and clipping outside Taffy |
| width/height, min/max, `aspect-ratio`, `box-sizing`, margin/padding/border | `size`, `min_size`, `max_size`, `aspect_ratio`, `box_sizing`, `margin`, `padding`, `border` |
| flex properties, `gap` | `flex_direction`, `flex_wrap`, `flex_basis`, `flex_grow`, `flex_shrink`, `gap`, `align_*`, `justify_*` |
| grid (`grid-cols-[...]`, placement) | `grid_template_rows/columns/areas`, `grid_auto_*`, `grid_row`, `grid_column`, named lines |
| `calc()` | supported via the `calc` feature (earlier note) |
| float, clear | `float`, `clear` behind `float_layout` |
| `contain`, `direction`, `text-align` | `contain`, `direction`, `text_align` (block layout) |
| everything else in the table (colours, shadows, filters, transforms, transitions, animations, text styling, custom properties, selectors, layers, `@property`, `@supports`, `@media`, container queries) | outside Taffy; with Blitz these are Stylo (cascade, computed values, selectors, animation timelines) and `blitz-paint` (painting) |

Percentage and intrinsic keywords: since 0.14 `width`, `height`, `flex-basis` accept `min-content`, `max-content`, `fit-content`, `stretch`; min/max sizes do not yet (earlier note). Container queries need layout results fed back into style; Blitz stubs this (section 2).

## 6. Comparison summary

| Capability | stylo (via Blitz) | lightningcss | cssparser + selectors | simplecss |
|---|---|---|---|---|
| Parses modern at-rules (`@layer`, `@property`, `@supports`, `@container`) | yes (rule files exist) | yes (`CssRule` variants) | tokens only | no (skipped) |
| Selector matching on a DOM | yes | not stated | `selectors` yes | yes (CSS 2 level) |
| Cascade, layers, specificity, inheritance, computed values | yes | not stated | no | rules sorted by specificity only |
| Custom properties and `var()` | yes (`custom_properties.rs`) | `substitute_variables` feature (undocumented on pages read) | no | no |
| `@property` registration | rule type exists; Blitz status not stated | parsed | no | no |
| `color-mix`, `oklch` | computed values in `color/` (Blitz renders oklch; #1215 shows an SVG currentColor bug) | transforms them | no | no |
| Animations and transitions | yes in Blitz status; hooks partly commented out | keyframes parsed only | no | no |
| Container queries | engine has rule; Blitz stubbed | parsed only | no | no |
| Build needs | Python 3 at build time, `rayon`, ICU4X | pure Rust crate | pure Rust | pure Rust |
| Licence | MPL-2.0 | MPL-2.0 | MPL-2.0 | Apache-2.0 OR MIT |

## 7. Open gaps
- Binary size and build time for Stylo and Blitz: no primary source found; needs a measured hello-world (Blitz plus Stylo, release, per target).
- Whether Stylo's `@layer`, `@property`, `@supports`, `:has` and `@starting-style` are enabled and correct in the Servo-feature build as Blitz consumes it was not verified; only source-file presence and Blitz's issue tracker were read. The Blitz CSS status page does not list them. A conformance run against the gallery CSS would answer it.
- No documentation for using Stylo without Servo's DOM beyond the Blitz source; trait list not enumerated.
- `lightningcss` `substitute_variables` and `parcel_selectors` matching behaviour not read.
- Android and macOS build story for Stylo specifically (NDK toolchain, Python on the build host, `objc2`) not documented on its own; inferred from Servo and Blitz downloads.
- Counts in section 4 are regex counts on a minified file; run on one build only. Other components (editor, designer, Tailwind features not used by the gallery such as `@container` queries, gradients, `::before`) are not represented.
- `azul-css` and other Rust style crates not examined beyond crates.io metadata.
