# Layout engines, windowing and the app shell (TASK-99.5)

Question: which layout engines (Taffy, Yoga, own) and windowing/shell layers (winit, SDL, GLFW, Android NativeActivity/GameActivity, direct platform code) fit an own-drawn renderer on Windows, macOS, Linux and Android? Facts and comparison only, no decision.

Researched 2026-11-07 from official docs and repos. Versions: Taffy 0.15.1, winit 0.30.13 stable (0.31 in beta), SDL3, GLFW 3.4 (3.5.1 notes exist). Where a source was silent, this says "not stated". Page-level fetches were summarised by a fetch tool, so verbatim quotes are limited; follow the links to confirm anything load-bearing.

## 1. Layout engines

### Taffy (Rust, DioxusLabs)
- Algorithms: CSS Block, Flexbox and CSS Grid; float layout is a sub-feature of Block (default features `block_layout`, `float_layout`, `flexbox`, `grid`, `calc`, `content_size`). "Support for other paradigms is planned." ([README](https://github.com/DioxusLabs/taffy), [docs.rs](https://docs.rs/taffy/latest/taffy/))
- Intrinsic sizing: since 0.14 `width`, `height` and `flex-basis` accept `min-content`, `max-content`, `fit-content`, `fit-content()`, `stretch`. Known gaps listed: min/max-width/height do not yet accept these keywords (0.14); `contain: size` unsupported; sticky positioning not implemented (0.15). ([CHANGELOG](https://github.com/DioxusLabs/taffy/blob/main/CHANGELOG.md))
- Text and leaf content: Taffy does not do text layout. `TaffyTree::compute_layout_with_measure` takes a measure closure for leaves. ([docs.rs](https://docs.rs/taffy/latest/taffy/), README)
- Embedding: high-level `TaffyTree` owns nodes and caching; low-level traits (`LayoutPartialTree`, per-algorithm compute functions) let a framework keep its own node tree and caching. ([docs.rs](https://docs.rs/taffy/latest/taffy/))
- Scrolling: `Style.overflow` (per axis) and `scrollbar_width` (space reserved for `Scroll`/`Auto` nodes); output carries scrollable overflow (`content_size` renamed `scrollable_overflow_rect` in 0.14). Docs describe layout output only; scroll offsets, clipping and hit testing are not part of Taffy. ([Style](https://docs.rs/taffy/latest/taffy/style/struct.Style.html), CHANGELOG)
- Pixels/DPI: `round_layout` snaps to the pixel grid; units are points, scale handled by caller. Also `box_sizing`, `aspect_ratio`, `position` (static default since 0.15, fixed supported), `calc()`.
- Language: Rust crate. 0.15 removed no-alloc support (always requires `alloc`).

### Yoga (Meta, C++20)
- Model: "embeddable and performant flexbox layout engine with bindings for multiple languages." Property list: align-content/items/self, aspect-ratio, display, flex basis/grow/shrink/direction/wrap, gap, insets, justify-content, layout direction, margin/padding/border, position, min/max/width/height. Grid and block layout are not in the styling docs' property list. Behaves as `box-sizing: border-box`; defaults differ from web (column direction, shrink 0) unless `UseWebDefaults`. Units: points and percent only. ([README](https://github.com/facebook/yoga), [styling docs](https://www.yogalayout.dev/docs/styling/))
- Rounding: rounds to the physical pixel grid using `PointScaleFactor` (0 disables). Errata presets (None/Classic/All) trade web conformance for Yoga 1.x compatibility. ([configuring](https://www.yogalayout.dev/docs/getting-started/configuring-yoga))
- Bindings linked from README: npm `yoga-layout`, Maven `com.facebook.yoga`, Swift Package Manager, vcpkg. Rust bindings: not stated in sources read.
- Measure functions, scrolling, hit testing: not covered in the pages read (the "integrating with external layout systems" URL tried returned 404). Text layout is explicitly outside both Yoga and Taffy (Taffy README).

### Own layout engine
- No primary source applies; listed because the ticket asks. Reference point: Masonry (Linebender) is a Rust widget toolkit built on AccessKit, using winit (`masonry_winit`) or any wgpu windowing; Android via `masonry_android_view` is "not yet generally usable." Its layout approach is not stated in its README. ([Masonry README](https://github.com/linebender/xilem/tree/main/masonry))

## 2. Windowing and shell layers

### winit (Rust, 0.30.13 stable; 0.31 beta)
- Platforms: Windows, macOS, X11, Wayland, Android, iOS, Web, Redox. Low-level: creates windows, delivers events, does not draw. Scope statement: common features only; no native menus exposed, APIs for higher-level crates to build them. MSRV 1.88. ([README](https://github.com/rust-windowing/winit), [FEATURES.md](https://github.com/rust-windowing/winit/blob/v0.30.13/FEATURES.md))
- High-DPI: `ScaleFactorChanged` is the recommended signal. `Window::scale_factor` on Android "is currently unimplemented, and this function always returns 1.0" per Window docs, although FEATURES.md ticks HiDPI for Android (discrepancy). ([Window](https://docs.rs/winit/latest/winit/window/struct.Window.html))
- IME: `Ime::{Enabled,Preedit,Commit,Disabled}` after `set_ime_allowed`/`set_ime_cursor_area`. `WindowEvent::Ime` docs: unsupported on iOS, Android, Web, Orbital. FEATURES.md ticks keyboard-with-IME for Android (discrepancy). 0.31 beta adds `Ime::DeleteSurrounding`, `request_ime_update`, `ImeHints`. ([WindowEvent](https://docs.rs/winit/latest/winit/event/enum.WindowEvent.html), [releases](https://github.com/rust-windowing/winit/releases))
- Input: mouse wheel with phase; touch not supported on macOS; pinch/rotation gestures macOS and iOS only; double-tap gesture macOS and iOS; touch pressure only Windows/iOS/Web; multitouch Windows, Linux, Android, iOS. Drag and drop events exist (`HoveredFile`, `DroppedFile`; FEATURES.md marks Windows/macOS partial). Theme-change event unsupported on iOS, Android, X11, Wayland.
- Multi-window: windows created from the event loop, closed on drop; `Window` is `Send + Sync` but macOS/Web/iOS run UI calls on the main thread. Popup windows: not supported on macOS or Android in 0.30 FEATURES; 0.31 beta.3 adds native popups on Wayland, Windows, macOS.
- macOS: Retina via scale factor; winit "doesn't register an `NSApplicationDelegate`" (you can supply your own); `OptionAsAlt` setting; `ActivationPolicy`; 0.31 beta adds a `standard_key_binding` hook for text-editing shortcuts. Default menu uses bundle or process name; a menu bar needs an extra crate. ([macOS docs](https://docs.rs/winit/latest/winit/platform/macos/index.html), releases)
- Android: via `android-activity` (0.6 for winit 0.30); feature picks `android-native-activity` or `android-game-activity`; `crate-type = ["cdylib"]`. `inner_position`/`outer_position` return `NotSupportedError`. ([android module](https://docs.rs/winit/latest/winit/platform/android/index.html))
- Menus companion: `muda` (Tauri) supports Windows, macOS, Linux (needs GTK 3 or 4); on macOS `init_for_nsapp()` sets the app menu; integrates with winit via an event-loop proxy; README does not describe Cmd accelerator mapping. ([muda](https://github.com/tauri-apps/muda))

### SDL3 (C)
- High-DPI: separate window size, pixel size and pixel density. Windows/Android use physical pixels with a content scale; macOS/iOS use window units and need `SDL_WINDOW_HIGH_PIXEL_DENSITY` for Retina pixels; X11 behaves like Windows, Wayland like macOS. ([high-DPI](https://wiki.libsdl.org/SDL3/README-highdpi))
- Text input/IME: `SDL_StartTextInput`, `SDL_SetTextInputArea`, optional custom IME UI via `SDL_HINT_IME_IMPLEMENTED_UI` with `SDL_EVENT_TEXT_EDITING` and `..._CANDIDATES`; screen keyboard queries. ([best practices](https://wiki.libsdl.org/SDL3/BestKeyboardPractices), [keyboard](https://wiki.libsdl.org/SDL3/CategoryKeyboard))
- Windows: multi-window listing, parent windows, `SDL_CreatePopupWindow`, safe area, system theme; no menu bar API in the video category list. ([video](https://wiki.libsdl.org/SDL3/CategoryVideo))
- Android: official, via a Java `SDLActivity` shim plus JNI; Gradle/NDK build (SDK 36+, NDK r28c+, min API 21); lifecycle events `WILL/DID_ENTER_BACKGROUND/FOREGROUND`, `TERMINATING`, `LOW_MEMORY`, `RENDER_DEVICE_RESET`; paused loop blocks by default; back button is `SDLK_AC_BACK`; Android 15 edge-to-edge needs `SDL_GetWindowSafeArea()`. ([README-android](https://github.com/libsdl-org/SDL/blob/main/docs/README-android.md))
- Rust use via bindings: not covered by sources read.

### GLFW (C, 3.4)
- Desktop only: Windows, macOS, Unix with X11 or Wayland; Android/iOS not addressed in the FAQ. "No menus, no buttons"; pop-up menus will not be added; GLFW creates a default macOS main menu at init (`GLFW_COCOA_MENUBAR` disables). ([FAQ](https://www.glfw.org/faq.html), [3.4 news](https://www.glfw.org/docs/3.4/news.html))
- 3.4 adds runtime platform selection, Wayland libdecor, mouse passthrough, `GLFW_SCALE_FRAMEBUFFER` (Retina). IME/composition: not mentioned in the FAQ or 3.4 notes read. Multi-window: FAQ says "create top-level windows", not explicit.

### Android activity layers
- NativeActivity: ships with Android, no Java/Kotlin needed; no built-in IME support (only ASCII via soft keys that send key events, "unlikely to be sufficient for production"); uses `InputQueue`. ([android-activity README](https://github.com/rust-mobile/android-activity))
- GameActivity: Jetpack library, descends from `AppCompatActivity`, renders into a `SurfaceView`, new `android_input_buffer` input path, GameTextInput for IME, requires `androidx.games:games-activity` and Java/Kotlin build tooling. Google "strongly recommend[s] using GameActivity for new games and other C/C++ intensive applications." ([AGDK](https://developer.android.com/games/agdk/game-activity))
- android-activity lifecycle: `android_main` can run multiple times; after `MainEvent::Destroy` the app must return from `android_main`; optional `android_on_create` runs on the Java main thread. README: NativeActivity "may be more convenient to start with", GameActivity likely the better long-term choice.

### Direct platform code
- Not researched per API (Win32, AppKit/NSMenu, X11/Wayland, JNI/View). Indirect evidence only: winit does not register an NSApplicationDelegate; muda uses AppKit for menus; SDLActivity is a Java shim. Open gap.

## 3. Comparison (facts as stated above)

| Aspect | Taffy | Yoga | winit | SDL3 | GLFW |
|---|---|---|---|---|---|
| Kind | layout | layout | windowing | windowing+ | windowing |
| Flexbox | yes | yes | n/a | n/a | n/a |
| Grid | yes | not in docs | n/a | n/a | n/a |
| Block/float | yes | not in docs | n/a | n/a | n/a |
| Intrinsic keywords | min/max/fit-content | not stated | n/a | n/a | n/a |
| Text measure hook | yes | not in pages read | n/a | n/a | n/a |
| Scroll/hit test | geometry only | not stated | wheel events | wheel events | wheel events |
| Win/macOS/Linux | n/a | n/a | yes | yes | yes |
| Android | n/a | n/a | yes (android-activity) | yes (Java shim) | no |
| IME | n/a | n/a | desktop yes; Android conflicting | yes, incl. custom UI | not stated |
| macOS menu bar | n/a | n/a | not native; muda | default menu only | default menu, disable flag |
| Multi-window | n/a | n/a | yes | yes | likely |

## 4. Open gaps
- Yoga measure/baseline/scroll docs and Rust bindings not verified.
- winit Android IME and scale factor status conflict between FEATURES.md and the API docs; verify against source for the chosen version.
- Cmd-key and macOS menu behavior in SDL3 not documented in pages read.
- Direct platform code per OS not surveyed.
- Documentation-level only; nothing was run.
