# Own-drawn UI stacks across Windows, macOS, Linux and Android

Research for backlog TASK-99.1 (parent: TASK-99, Gable Native design map). Facts and comparison only; no decision. Gathered 2026-11-07 from first-party pages (READMEs, official docs, crates.io metadata). Where a primary source did not state a fact, the cell says "not stated" rather than guessing. The macOS constraint (no Mac available to the author; Metal and CI-only verification) is applied as a column.

## Question

Which existing rendering stacks could Gable Native build on (Skia/skia-safe, Vello with wgpu, the Flutter engine embedder, Slint, and others found)? For each: Windows, macOS (Metal), Linux and Android support, maturity, licensing, binary size, text and accessibility story, and how it embeds in a custom host.

## Layering note

The candidates are not all the same kind of thing:

- Drawing libraries (2D rasterizers): Skia (via skia-safe or Skiko), Vello, tiny-skia, femtovg.
- GPU abstraction: wgpu (used under Vello, egui, iced, Xilem).
- Text and a11y building blocks: Parley (text layout, Linebender), AccessKit (accessibility tree to native APIs).
- Whole UI toolkits with their own layout and widgets: Slint, Flutter, Compose Multiplatform, egui, iced, Xilem/Masonry, GPUI, Makepad, Qt Quick.
- An HTML/CSS engine on top of Vello: Blitz.

Gable would provide its own layout and widget semantics (the template renderer), so drawing libraries plus text and a11y building blocks are the layers most directly relevant. Whole toolkits are listed for comparison.

## Summary matrix

| Stack | Kind | Windows | macOS | Linux | Android | License | Maturity signal | A11y (own-drawn) |
|---|---|---|---|---|---|---|---|---|
| skia-safe (Rust Skia bindings) | Drawing lib | Prebuilt (x86_64, aarch64) | Prebuilt (x86_64, aarch64); Metal | Prebuilt (glibc x86_64, aarch64) | Prebuilt (aarch64, x86_64), API 26+ | MIT (bindings); Skia is BSD-3-Clause | 0.157.0 (Nov 2026), tracks Skia m157, "prerelease" | None (Skia is a renderer) |
| Skiko (Skia for Kotlin) | Drawing lib | Yes (x86_64) | Yes (x86_64, arm64) | Yes (x86_64, arm64) | Yes (x86_64, arm64), API 24+ | Apache-2.0 | Powers Compose Multiplatform | None itself |
| Vello (+ wgpu) | Drawing lib | Via wgpu (DX12, Vulkan) | Via wgpu (Metal) | Via wgpu (Vulkan, GL) | Via wgpu (Vulkan, GLES) | Apache-2.0 OR MIT | vello 0.11.0; compute renderer "experimental"; Vello CPU most mature; Vello GPU maturing | None itself |
| Flutter engine + embedder API | Engine + toolkit | Yes (prebuilt embedder zip x64; Arm64 supported) | Yes (Metal) | Yes | Yes (API 24 to 37) | BSD-3-Clause | Production; Impeller default on all desktop since 3.47 | Semantics API in embedder header |
| Slint | Toolkit | Yes | Yes | Yes | Yes (API 26+) | GPL-3.0 / Royalty-free 2.0 / commercial | 1.x, stable API, 1.18.1; JS binding Beta | Yes (AccessKit via winit backend) |
| Compose Multiplatform Desktop | Toolkit (Skia) | Yes | Yes | Yes | Yes | Not verified here | Stable Skia-based desktop | macOS yes; Windows via Java Access Bridge; Linux none |
| egui / eframe | Immediate-mode toolkit | Yes | Yes | Yes | Yes (eframe) | MIT OR Apache-2.0 | 0.37.0; breaking changes each release | AccessKit on Windows and macOS (default) |
| iced | Toolkit | Yes | Yes | Yes | Not mentioned | MIT | "currently experimental software" | Not mentioned |
| Xilem / Masonry | Toolkit (Vello, Parley, AccessKit, winit) | Not stated | Not stated | Prereqs listed | Not stated | Apache-2.0 | "experimental"; 0.4.0 (Oct 2025) | AccessKit |
| GPUI (Zed) | Toolkit | Yes (Win32, DirectWrite) | Yes (Metal) | Yes (Wayland, X11) | Not mentioned | Apache-2.0 (LICENSE-APACHE present; page does not state it) | "pre-1.0", breaking changes; 0.2.2 | "Accessibility" topic exists but empty |
| Blitz (HTML/CSS on Vello) | Engine | Yes | Yes | Yes | Yes | MIT OR Apache-2.0 | Beta (0.3.0-beta.4) | AccessKit |
| Makepad | Toolkit | Yes (DX11) | Yes (Metal) | Yes (OpenGL) | Toolchain mentioned | MIT | Not stated | Not mentioned |
| Qt Quick | Toolkit | Not verified | Not verified | Not verified | Not verified | Commercial, LGPL v3 / GPL | Mature | Not verified |

## Per-stack facts

### Skia via skia-safe (rust-skia)

Source: https://github.com/rust-skia/rust-skia, https://crates.io/crates/skia-safe, https://github.com/google/skia (LICENSE)

- Platforms with prebuilt binaries: Windows (x86_64, aarch64 MSVC), Linux glibc (x86_64, aarch64), macOS (x86_64, aarch64), Android (aarch64, x86_64; API 26+), iOS, wasm32-unknown-emscripten. Source-only: visionOS.
- GPU backends: Vulkan, Metal, OpenGL, Direct3D; Skia on a `wgpu` device is marked experimental. Feature flags seen in README examples: `gl`, `vulkan`, `metal`, `d3d`, `wgpu`, `ganesh`, `graphite`, `binary-cache`. Examples show both Ganesh and Graphite with Metal.
- Version: skia-safe 0.157.0 (updated 2026-11-03); submodule tracks Skia `chrome/m157`. README describes bindings as up to date; crate described as a prerelease on crates.io.
- Licenses: bindings MIT; Skia is BSD-3-Clause.
- Build: `skia-bindings` build.rs downloads prebuilt binaries by default; prebuilt require glibc >= 2.31 and libstdc++ >= GLIBCXX_3.4.28; `FORCE_SKIA_BUILD=1` or disabling `binary-cache` builds from source, which needs LLVM/Clang, Python 3, Ninja; Windows needs VS 2022 Build Tools; macOS needs Xcode CLT; Android needs NDK r26d+. (Source builds need Python for Skia's tooling even though the project prefers Node scripts; this only affects the build of Skia itself.)
- Binary size: not stated by the README. (Slint's docs, below, call the Skia renderer "heavy disk footprint.")
- Text/a11y: Skia itself is a renderer; the rust-skia README fetched did not describe text layout or accessibility. Text shaping modules (SkParagraph/SkShaper) exist in Skia but their docs could not be fetched in this pass.
- Embedding: a library; the host supplies the window, GPU context and event loop (README ships winit-style window examples for gl, vulkan, d3d, wgpu).

### Skiko (Skia for Kotlin)

Source: https://github.com/JetBrains/skiko

- Platforms: Kotlin/JVM on Linux (x86_64, arm64), Windows (x86_64), macOS (x86_64, arm64), Android (x86_64, arm64, API 24+); Kotlin/JS and Wasm; Kotlin/Native on iOS and macOS. License Apache-2.0. Relevant only if the host language were Kotlin/JVM; listed because Compose Multiplatform builds on it.

### Vello (with wgpu)

Source: https://github.com/linebender/vello, https://crates.io/crates/vello, https://github.com/gfx-rs/wgpu

- Three renderers: Vello CPU (CPU-only, multithreaded, SIMD; described as most mature), Vello GPU (CPU path preprocessing, GPU rasterization and compositing; has wgpu and native WebGL2 backends; designed to work without compute shaders; "maturing"), and the compute-centric `vello` crate under research (described as "an experimental implementation"; needs compute-capable GPUs).
- Crate versions: vello 0.11.0, vello_cpu 0.3.0 (both 2026-10-02). License Apache-2.0 OR MIT (some shader files also Unlicense). MSRV Rust 1.89.
- Text: the `glifo` crate provides text and glyph-run support for both Sparse Strips renderers. Parley 0.12.0 (Apache-2.0 OR MIT) is the Linebender text layout crate (version from crates.io; Xilem lists it as its text stack).
- Platform support is inherited from wgpu. wgpu support table (wgpu README): Vulkan first-class on Windows and Linux/Android, Metal first-class on macOS/iOS, DX12 first-class on Windows, Vulkan on macOS only via MoltenVK, OpenGL downlevel/best-effort (GL 3.3+ on Windows, GLES 3.0+ on Linux/Android, ANGLE on macOS). wgpu 30.0.1 (2026-08-22), MIT OR Apache-2.0. Vello's own README does not mention Android or macOS.
- Slint's docs state its Vello renderer is experimental, requires compute shaders, has no software fallback, and is never auto-selected.
- Embedding: a library; host owns window and surface; windowed examples use winit.
- A11y: none itself; see AccessKit.

### Flutter engine and the embedder API

Source: https://github.com/flutter/flutter/blob/main/docs/engine/Custom-Flutter-Engine-Embedders.md, embedder.h (engine/src/flutter/shell/platform/embedder/embedder.h), https://docs.flutter.dev/reference/supported-platforms, https://docs.flutter.dev/perf/impeller, https://docs.flutter.dev/resources/faq

- Supported platforms (Flutter 3.47): Windows 10/11 (x64, Arm64), macOS 12 to 27 (x64, Arm64; Intel being phased out), Debian/Ubuntu Linux (x64, Arm64), Android API 24 to 37 (x64, Arm32, Arm64).
- Rendering: Impeller default on iOS and Android API 29+ (since 3.27) and on macOS, Linux, Windows (since 3.47); Android uses Vulkan with fallback to legacy OpenGL on lower API/no Vulkan; opt-out on desktop will be removed in a future release. The Impeller page does not map backends to platforms for desktop.
- Embedder: single C header `embedder.h`, claimed "no platform specific dependencies, has a stable ABI". `FlutterRendererType` = OpenGL, Software, Metal, Vulkan. Compositor API for backing stores. Task runners: caller supplies platform, render and UI runners, one thread per runner. Platform messages (channels) via `FlutterPlatformMessage`. Key input via `FlutterKeyEvent`; the header had no dedicated text-input API in the visible part (text input goes through channels, not confirmed here). Semantics: `FlutterSemanticsUpdate2`/`FlutterSemanticsNode2` (v1 structs deprecated and frozen), custom actions, accessibility feature flags. Only the first 100,000 of 171,854 characters of the header were read.
- Prebuilt embedder artifacts documented for macOS (darwin-x64 framework), Linux (x64) and Windows (x64). Android is not listed on that page.
- Caveat from Flutter: custom engine builds are "not officially supported", no timeline on fixes, intended as short-term, recommended mainly for porting to unsupported platforms.
- Important implication of the model (from the page): the engine runs Dart UI code (framework in Dart). The embedder embeds the engine, not a generic scene API; Gable's template runtime would not drive Flutter widgets directly through the embedder (inferred from the architecture, not a statement in the sources).
- License: BSD-3-Clause for framework and SDK; engine dependencies listed in its license file.
- Size: "engine adds a small baseline footprint (a few megabytes compressed), which varies by target platform and architecture"; no exact figures.

### Slint

Source: https://github.com/slint-ui/slint, https://docs.slint.dev/latest/docs/slint/guide/backends-and-renderers/backends_and_renderers/, https://docs.slint.dev/latest/docs/slint/guide/platforms/mobile/android/, https://slint.dev/terms-and-conditions, https://crates.io/crates/slint

- Platforms: Windows, macOS, Linux desktop; Android (backend `android-activity`, min API 26) and iOS; embedded Linux and MCUs; WebAssembly.
- Backends: winit (default), Qt, linuxkms. Renderers: software (no GPU; limitations: no rotation/scaling, no drop shadows, no border-radius with clip, western-script text only), FemtoVG (OpenGL; wgpu variant adds Metal/Vulkan/D3D; text quality "sometimes sub-optimal"), Skia (OpenGL, Metal, Vulkan, D3D; "heavy disk footprint"), Vello (experimental).
- Maturity: stable 1.x API, 1.18.1 (2026-09-21). Bindings: Rust (stable), C++, JavaScript/Node.js (Beta), Python (Beta). Android build is slow first time (compiles Skia).
- License: user chooses GPL-3.0, Royalty-free License 2.0, or commercial. Royalty-free terms: desktop, mobile and web apps only (no embedded), requires AboutSlint widget in an About screen or a badge on a public download page, cannot be distributed standalone, applications may not expose Slint's APIs. Commercial plans are paid per seat.
- Text/a11y: a winit-backend AccessKit adapter that maps the item tree to AccessKit nodes (source of crate i-slint-backend-winit 1.9.2; older than current). Slint language has `accessible-*` properties (role, label, value, live region, actions). Current docs on per-platform a11y support were not found.
- Embedding: Slint owns the component model, `.slint` language and event loop; it is not a drawing library. A runtime-driven tree from outside Slint's language would need to use its interpreter or generated components (not investigated).

### Compose Multiplatform Desktop

Source: https://kotlinlang.org/docs/multiplatform/compose-desktop-accessibility.html, https://github.com/JetBrains/skiko, release notes at kotlinlang.org

- Desktop draws with Skia (via Skiko) on Windows, macOS, Linux. Skia moved to milestone 138 in 1.10.0-rc02.
- A11y: macOS fully supported; Windows via Java Access Bridge (must be enabled; `jdk.accessibility` module for distributions); Linux not supported.
- JVM-hosted; licence of Compose Multiplatform itself not verified in this pass.

### egui / eframe

Source: https://github.com/emilk/egui, https://crates.io/crates/egui

- eframe targets Web, Linux, Mac, Windows, Android. Backends: egui-wgpu or egui_glow. 0.37.0, MIT OR Apache-2.0. Immediate mode: full layout every frame, about 1 to 2 ms typical; large UIs and long scroll areas can be costly; one-frame layout delay unless `request_discard` is used.
- A11y: AccessKit on Windows and macOS (enabled by default in eframe); other platforms get an experimental built-in screen reader.
- IME: not described on the page. Non-Latin glyphs require supplying a font. README says interfaces are changing and releases include breaking changes.

### iced

Source: https://github.com/iced-rs/iced, https://crates.io/crates/iced

- Windows, macOS, Linux, Web; Android not mentioned. Renderers: `iced_wgpu` (Vulkan, Metal, DX12) and `iced_tiny_skia` (software). MIT. 0.14.0 (2025-12-07). Self-described "currently experimental software". Accessibility and IME not mentioned.

### Xilem / Masonry (Linebender)

Source: https://github.com/linebender/xilem, https://crates.io/crates/masonry

- Stack: Masonry (retained widget tree), Xilem (reactive layer), winit, Vello + wgpu, Parley + Fontique (text), AccessKit. Apache-2.0. Described as "experimental"; xilem and masonry 0.4.0 (2025-10-29). MSRV Rust 1.96. README lists prerequisites only for Linux/BSD; does not mention Android, macOS or Windows.

### GPUI (Zed)

Source: https://github.com/zed-industries/zed/tree/main/crates/gpui, https://crates.io/crates/gpui

- macOS Metal; Windows Win32 + DirectWrite; Linux Wayland/X11; Android and web not mentioned. "Pre-1.0", "breaking changes between versions"; gpui 0.2.2. Hybrid immediate/retained. Accessibility page linked but empty.

### Blitz (DioxusLabs)

Source: https://github.com/DioxusLabs/blitz, https://crates.io/crates/blitz-dom

- Modular HTML/CSS engine: Stylo (CSS), Taffy (layout), Parley (text), Vello via AnyRender (paint), AccessKit (via blitz-shell). Browser UI builds listed for Windows, macOS, Linux, Android. Status "Beta" (0.3.0-beta.4); many bugs and missing features. MIT OR Apache-2.0 (`stylo_taffy` also MPL 2.0).

### Makepad

Source: https://github.com/makepad/makepad

- Web (WebGL), macOS (Metal), Windows (DX11), Linux (OpenGL); iOS, tvOS, Android toolchains mentioned. MIT. Accessibility and IME not mentioned.

### Qt Quick

Source: https://doc.qt.io/qt-6/qtquick-index.html

- Commercial license from The Qt Company; also LGPL v3 or GPL v2 (per page, "as of Qt 5.4"). The page does not describe rendering backends or platforms; the Qt licensing page could not be fetched. Included for completeness; the Slint docs show Slint can itself use Qt as a backend.

## Cross-cutting: AccessKit

Source: https://github.com/AccessKit/accesskit, https://crates.io/crates/accesskit

- Adapters released for Windows (UI Automation), macOS (NSAccessibility), Linux (AT-SPI over D-Bus), Android, iOS. Web adapter planned, not available. accesskit 0.25.2 (2026-10-25), MIT OR Apache-2.0.
- Model: toolkit pushes a full accessibility tree then incremental updates via function calls; adapter holds the tree; toolkit handles action requests; each node needs a stable ID. `accesskit_winit` recommended for winit apps. C and Python bindings exist.
- Stated limitations: adapters are "at rough feature parity", do not support all element types or schema properties, no rich text or hypertext; single and multi-line text input supported.
- Users per its own page: not named; Slint (winit backend), egui, Xilem and Blitz integrate it per their own pages.

## macOS and Metal specifics (per sources)

- Skia: prebuilt macOS binaries for x86_64 and aarch64; Metal available with both Ganesh and Graphite features in rust-skia examples.
- wgpu: Metal is first-class on macOS; Vulkan only through MoltenVK; GL via ANGLE only. Vello rides on this.
- Flutter: macOS 12 to 27 supported, CI-tested on Sequoia (15); Impeller default on macOS since 3.47; embedder zip for darwin-x64 documented (the arm64 artifact is not mentioned on that page).
- Slint: macOS listed as a desktop target; Skia renderer supports Metal; FemtoVG wgpu variant adds Metal.
- GPUI: Metal, and the only listed platform where it is "always available".
- AccessKit: macOS adapter released.
- Not covered by these sources: menu bar, Cmd shortcuts, IME, Retina scaling, code signing and notarization for any stack (belongs to other TASK-99 tickets).

## Gaps and unverified items

- Binary size: no primary source gave figures for skia-safe, Vello, Slint, or Flutter. Only qualitative claims (Flutter engine "a few megabytes compressed"; Slint Skia "heavy disk footprint"). A measured size test would be needed.
- Text (shaping, bidi, IME) was not documented in the sources reached for Skia, Flutter or Slint; Skia SkParagraph docs and Impeller backend-per-platform docs returned 404 or lacked detail. Parley is documented only through other projects' pages here.
- Vello Hybrid is not named in the Vello README fetched (it uses "Vello GPU" / "Sparse Strips").
- Android status for Vello, Xilem, GPUI, iced is not stated in their READMEs.
- Compose Multiplatform licence, Qt per-platform support and Qt LGPL obligations were not verified.
- Fetches were made through a summarising tool; quoted wording is the tool's extraction of the page, not a byte-exact copy.
- Release pages were empty in captured GitHub content; versions come from crates.io metadata.

## Source list

- https://github.com/rust-skia/rust-skia and https://raw.githubusercontent.com/rust-skia/rust-skia/master/README.md
- https://raw.githubusercontent.com/google/skia/main/LICENSE
- https://github.com/linebender/vello and its README
- https://github.com/gfx-rs/wgpu
- https://github.com/flutter/flutter/blob/main/docs/engine/Custom-Flutter-Engine-Embedders.md
- https://raw.githubusercontent.com/flutter/flutter/main/engine/src/flutter/shell/platform/embedder/embedder.h
- https://docs.flutter.dev/reference/supported-platforms, /perf/impeller, /resources/faq
- https://github.com/slint-ui/slint; docs.slint.dev backends/renderers, Android, reference/common pages; https://slint.dev/terms-and-conditions
- https://github.com/AccessKit/accesskit
- https://github.com/linebender/xilem, https://github.com/emilk/egui, https://github.com/iced-rs/iced
- https://github.com/zed-industries/zed/tree/main/crates/gpui, https://github.com/DioxusLabs/blitz, https://github.com/makepad/makepad
- https://github.com/JetBrains/skiko, https://kotlinlang.org/docs/multiplatform/compose-desktop-accessibility.html
- https://doc.qt.io/qt-6/qtquick-index.html
- crates.io API for skia-safe, vello, vello_cpu, wgpu, slint, iced, egui, accesskit, masonry, xilem, parley, gpui, blitz-dom
