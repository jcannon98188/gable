# Native renderer spike report (TASK-99.22, PROTOTYPE)

Throwaway vertical slice for the owned hybrid renderer stack (ADR 0005). Code: `native/prototype/renderer-spike` on branch `prototype/native-renderer-spike`. Nothing here is production code. Images: `docs/research/native-renderer-spike-assets/`.

Machine: Windows 11, RTX 2060 SUPER (Vulkan, driver 610.88), rustc 1.99.0. Android: NDK 27.1.12297006, cargo-ndk 4.1.2.

## Pass criteria (defined before the numbers below were written up)

The P1-P11 set comes from the task directive. Numeric thresholds marked (T) were chosen by me when drafting this report, after the first runs existed, so treat them as my judgement and not as a pre-registered bar.

| # | Criterion |
|---|---|
| P1 | Text vs Chromium for the same strings at 1x and 2x: quantified diff plus side-by-side images; pass = no gross defect (missing glyphs, wrong metrics, baseline error above 1 px) |
| P2 | Blur and backdrop blur at 1080p hold at least 60 fps (<= 16.7 ms) on the RTX 2060 SUPER; frame time measured on the Android emulator against the same 16.7 ms budget, with emulator GPU mode recorded |
| P3 | rotateY/rotateX perspective with correct picking incl. nested clips, by a table of points; hit-test tree built from the same transform/clip trees |
| P4 | Mask layer, non-normal blend and opacity group via the owned compositor, no vello panics |
| P5 | Path seam: same scene through vello_gpu, vello_cpu and lyon with a pixel diff; (T) pass if vello_cpu vs vello_gpu mean abs diff <= 1/255 and lyon differs on under 1% of pixels by more than 32 |
| P6 | Stylo builds on Windows: build time, build dependencies, binary size delta |
| P7 | Binary size, cold build time, MPL-2.0 crate list |
| P8 | aarch64-linux-android build via NDK 27, GameActivity via winit/android-activity, run on the emulator, Vulkan vs GLES behaviour |
| P9 | AccessKit live-region and focus update reach the Windows platform adapter; say what needs a screen reader |
| P10 | winit Android IME and HiDPI state from source and issues; winit version recorded |
| P11 | macOS workflow file (`workflow_dispatch` only, `macos-latest`); not triggered; Metal NOT MEASURED unless CI ran |

## Results

| # | Verdict | Evidence |
|---|---|---|
| P1 | PASS (with a 1 px caveat) | Mean abs diff vs headless Edge (Arial, same strings, 5 lines 12-24 px): 1x 5.44/255 aligned, 3.38/255 after a 1 px vertical shift; 2x 2.10/255 aligned, 1.91/255 after shift. 7.0% (1x) and 3.3% (2x) of pixels differ by more than 32. Edge draws ClearType (coloured fringes) with hinting, we draw unhinted grayscale, which accounts for most of the diff. The best alignment is dy = -1 px at 1x, so our first-line baseline is about 1 px lower than Chromium at 1x (baseline rounding, not fixed). Images: `sheet-sbs-1x.png`, `sheet-sbs-2x.png` (top Gable, middle Chromium, bottom diff). No subpixel (LCD) AA path was built. |
| P2 | PASS desktop; emulator NOT MEASURED on a device | Desktop, 1920x1080, offscreen compositor, GPU work waited with `device.poll(Wait)`, 200 frames: full scene (7 layers, blur 4 px, backdrop blur 8 px, 462 instances, 35 passes) avg 1.70 ms, p50 1.77, p95 1.83, p99 1.88, max 2.07 (about 590 fps). Same scene without blur/backdrop: avg 1.31 ms. This excludes present/vsync and path/glyph rasterization (cached after warm-up). Emulator (1080x607 root, 300 frames, compositor only): Vulkan 45.8 ms avg (p95 56.3), GLES 3.0 38.1 ms avg (p95 42.8). Both are over the 16.7 ms budget, but the emulator GPU is software (see P8), so the number says nothing about Mali/Adreno. |
| P3 | PASS | 13 point cases, 0 failures (`hit-table.md`): button inside the perspective card, empty card area, list rows inside and outside the inner scroller clip, row-0 split across the inner clip edge, a point inside the outer clip's rounded corner, and points outside the projected quad. Projected edges 386 px vs 450 px (real foreshortening). Hit testing uses the inverse 3x3 homography of each entry's world transform (from the same transform tree the compositor draws with) and then each clip on the item's chain. Expected values were derived from the scene geometry on the test side, not from `hit_test`. |
| P4 | PASS | `scene.png`: opacity-0.6 group, multiply blend, difference blend, mask layers (rounded-rect and linear-alpha), blur and backdrop blur, all through the owned compositor. No panics. vello is only used for glyph and path rasterization here, so "no vello panics" is trivially satisfied for the compositor. Identical output (mean abs diff 0.000/255) on Vulkan and OpenGL (desktop GL 4.x via wgpu GLES backend), 0.003/255 on DX12. |
| P5 | PASS | 160x160 star scene (fills, a rounded shape, a curve): vello_cpu vs vello_gpu mean abs diff 0.010/255, 0% of pixels over 32, max 2. vello_cpu vs lyon 0.234/255, 0.148% of pixels over 32, max 50. Times: vello_cpu 0.23 ms, lyon 0.68 ms (software 4x4 supersampled triangle fill, so it approximates a GPU triangle path), vello_gpu 287 ms including renderer setup. Images `paths-*.png`. |
| P6 | PASS (build); size delta NOT MEASURED | `stylo` 0.23.0 builds on Windows with MSVC. First build of the probe with its ~147 crates: about 49 s. Stylo itself rebuilt after `cargo clean -p stylo`: 39 s. Build dependencies: a system Python 3 (found on PATH; Mako is vendored in a zip, nothing was pip-installed). No libclang/bindgen was needed (servo build, not gecko). The probe binary is 186 KB, which is not a real delta: it only calls the property-name lookup and LTO drops the rest. Two of eight property names (`grid-template-columns`, `mask-image`) were rejected by `parse_enabled_for_all_content` because Servo's prefs are off by default, so a real integration has to set prefs. |
| P7 | PASS | Windows release (thin LTO, 16 CGUs) `gable-renderer-spike.exe`: 11.4 MB. Cold build (`cargo clean`, registry already downloaded) 95 s for 357 transitive crates. Android release `.so`: 13.4 MB (aarch64). No MPL-2.0 crate in the spike graph (`licences.txt`). The only copyleft-family string is `r-efi` (MIT OR Apache-2.0 OR LGPL-2.1-or-later, UEFI only, offered under MIT). The Stylo probe graph (147 crates) does contain MPL-2.0 crates: stylo, app_units, cssparser, cssparser-macros, selectors, stylo_atoms, stylo_derive, stylo_dom, stylo_static_prefs, stylo_traits, to_shmem, to_shmem_derive, uluru, dtoa-short. Scan used `cargo metadata` license fields (not file-level), unfiltered by target. |
| P8 | PASS on Vulkan; GLES present FAILED | aarch64-linux-android built via cargo-ndk, NDK 27.1.12297006, platform 29, 1m16s, first try. Packaged with Gradle 9.3.1 + AGP 9.0.0 as a GameActivity app (`androidx.games:games-activity:4.4.0`, which extends AppCompatActivity, so appcompat 1.7.1 is required). The emulator is x86_64, so the run used an x86_64-linux-android build of the same source; the aarch64 `.so` is packaged in the APK but was NOT executed (NOT MEASURED). Vulkan: adapter "Goldfish GFXStream (llvmpipe)", rendered correctly, `android-vulkan.png`. GLES: the same shaders initialised on OpenGL ES 3.0 (SwiftShader) and ran 300 frames with no validation errors, but the screen stayed black (`android-gles.png`); I did not find the cause. Desktop GLES gives pixel-identical offscreen output, so the compositor shaders are not the suspect; the presentation/blit path on the emulator's EGL is. |
| P9 | PASS (partial) | `ax-probe` (winit 0.31 window + `accesskit_windows` SubclassingAdapter, Window > Button + live-region Status). A real UIA client (PowerShell `System.Windows.Automation`) found the window (Framework=AccessKit), the Button and the Status node, saw the status text change on every update (`status 0` ... `status 7`) and saw `FocusedElement` alternate between "Spike button" and the window root, matching the focus given in each `TreeUpdate`. Not observed: the `LiveRegionChanged` UIA event itself (PowerShell delegates cannot receive UIA callbacks off-runspace); the adapter source queues it on a name change of a node with live != Off and the probe calls `QueuedEvents::raise`. Not measured: any spoken announcement, which needs Narrator or NVDA. `accesskit_winit` 0.34.2 depends on winit 0.30, so it cannot be used with winit 0.31 beta; use `accesskit_windows`/`accesskit_macos`/`accesskit_unix` directly or wait for a winit-0.31 adapter. |
| P10 | PASS (source only); issues and runtime NOT MEASURED | winit 0.31.0-beta.4 (winit-android 0.31.0-beta.4, android-activity 0.6.1, GameActivity). Source findings: `request_ime_update(Enable)` only stores capabilities and calls `show_soft_input(true)`; `set_ime_cursor_area` and `set_ime_purpose` are no-ops; there is no `Ime::Preedit`/`Commit` emission anywhere in the Android backend, so composition and commit text must be read through android-activity's GameTextInput API directly. Scale factor is `density / 160` (verified at runtime: 2.625 at 420 dpi, surface 1080x2400). The `ConfigChanged` handler computes the old and new scale factor back to back and sends `ScaleFactorChanged` when they are equal (`< EPSILON`), which looks inverted. I did not read winit's GitHub issues and did not exercise IME at runtime (the spike has no text field). |
| P11 | PASS (file written, not run); macOS Metal NOT MEASURED | `.github/workflows/native-renderer-spike-macos.yml`: `workflow_dispatch` only, `macos-latest`, builds the spike, runs the picking table and path seam, then a `continue-on-error` Metal render and bench. Not triggered, and pushing the branch does not trigger it (the other workflows run on `main` and pull requests only). |

## Android emulator disclosure

- Not a physical Mali or Adreno device. The emulator GPU is software: Vulkan goes through gfxstream to host llvmpipe, GLES through SwiftShader. Its frame times are CPU-rasterizer times.
- The maintainer's AVD `Medium_Phone_API_37.0` has a lock credential. After a reboot it stayed on the keyguard and Android hides third-party launcher activities from a locked user, so launching failed with START_CLASS_NOT_FOUND. I did not try to bypass the lock. I rebooted that AVD once with `adb reboot`, installed the spike APK on it (package `dev.gable.spike` is still installed in its data) and shut it down. All measured runs used a scratch AVD `gable_spike_scratch` made from the same system image (Android 17, API 37, google_apis_playstore x86_64, `hw.gpu.mode=auto`, `hw.gpu.enabled=yes`, 1080x2400 at 420 dpi), which I deleted afterwards. Both emulators are stopped.
- Debug APK, 47 MB, includes both ABIs and appcompat.

## What the spike is (and is not)

- Flat display list (transform, clip, effect trees by id, plus a hit tree) serialised as canonical JSON with floats quantised to 1/64; compositor in wgpu with a data-texture instance fetch (no storage buffers, no compute) and fragment-only effects, built to stay GLES 3.0-compatible; Taffy flex/grid layout; Parley shaping; Skrifa outlines rasterized by vello_cpu into an R8 glyph atlas (4 subpixel x bins); paths behind a `PathRasterizer` seam (vello_cpu, vello_gpu, lyon).
- Deviations: the compositor itself always runs on the GPU (headless PNGs are wgpu offscreen renders; there is no pure software compositor), blending is in gamma space on Rgba8Unorm, preserve-3d depth sorting is not implemented, at most 2 nested clips per item, the scene layout has visual quirks (effect cells overflow their labels), no damage tracking, no scrolling, no subpixel text AA.
- Engine stub (call QuickJS-NG from the host): not done.
- Not committed: `target/`, Gradle outputs, local intermediates.

## Versions

wgpu 30.0.1, winit 0.31.0-beta.4 (winit-android same, android-activity 0.6.1), taffy 0.15.1, parley 0.12, skrifa 0.49, lyon 1, vello_cpu/vello_gpu/vello_common git rev c161b8ae415c750d8a50e17f80977d26ea8b6822, accesskit 0.25.2, accesskit_windows 0.35.2, stylo 0.23.0, games-activity 4.4.0, AGP 9.0.0, Gradle 9.3.1.

## Reproduce

```
cd native/prototype/renderer-spike
cargo build --release -p gable-renderer-spike
target/release/gable-renderer-spike render out/scene.png 1   # also: sheet, diff, sbs, hit, paths, bench, window
cargo ndk -t x86_64 -t arm64-v8a --platform 29 build --release -p gable-renderer-spike --lib   # ANDROID_NDK_HOME=<ndk 27>
# then copy the .so files into android/app/src/main/jniLibs/<abi>/ and run gradle assembleDebug in android/
```
