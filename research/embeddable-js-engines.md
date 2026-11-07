# Embeddable JS engines for desktop and Android (TASK-99.2)

Question: which JS engines can run Gable apps (TS-transpiled app, TC39 Signals polyfill, RxJS, the no-eval template interpreter) embedded in a native host on Windows, macOS, Linux and Android? For each: ES coverage, performance, binary size, debugging/inspector, hot-update hooks, embedding API, licensing, macOS and Android availability. Facts and comparison only; no decision.

All sources fetched 2026-11-07. Sources marked "(summary)" were read through a summarising fetch and should be re-verified before becoming a spec rule. Sources marked "(repo file)" were read as raw files from the engine's own repository. Facts not found in a primary source are listed under "Gaps".

MacOS constraint from TASK-99: the author cannot test on a Mac, so cross-platform engines or engines with a macOS implementation are what matter, and macOS-specific behaviour (code signing, hardened runtime) needs designing in.

## Summary table

| Engine | Language / form | Execution | License | ES coverage (primary claim) | Windows | macOS | Linux | Android |
|---|---|---|---|---|---|---|---|---|
| V8 via rusty_v8 | C++ engine, Rust bindings | Interpreter + baseline + optimizing JIT; `--jitless` available | MIT (rusty_v8) | Tracks Chrome (V8 15.2.124.1) | Prebuilt MSVC x64 + arm64 | Prebuilt x64 + arm64 | Prebuilt x64, arm64, musl, riscv64 | No prebuilt; source cross-build documented |
| QuickJS (Bellard) | C | Bytecode interpreter | MIT | "Almost complete ES2025", ~100% test262 for ES2025 features | C, portable | C, portable | C, portable | C, portable (no official statement) |
| QuickJS-NG | C fork | Bytecode interpreter | MIT | Latest spec; no Intl | VS >= 2022 / Clang | macOS >= 11 | glibc, musl | NDK >= 26, "limited testing" |
| Hermes | C++ | AOT bytecode + interpreter; optional arm64/x86-64 JIT; `shermes` native | MIT | See section; no ES modules, no Intl by default, no Temporal | CLI builds exist | CLI builds; JIT on macOS | CLI builds | Shipped via React Native |
| JavaScriptCore | C++ | LLInt, Baseline, DFG, FTL JITs | BSD-style headers; `COPYING.LIB` (LGPL) also present | Tracks WebKit | JSCOnly/Win CMake in tree | System framework | JSCOnly, WPE, GTK | Only old community build |
| Boa | Rust | Bytecode VM | MIT | test262 ~96.0% passed (latest data) | Cargo | Cargo | Cargo | Cargo (not documented) |
| SpiderMonkey (mozjs) | C++/Rust | Interpreter + Baseline + Warp JIT | MPL-2.0 | Tracks Firefox ESR (153) | Documented build | Not documented in mozjs | Documented build | Not documented in mozjs |

## V8 (rusty_v8, deno_core)

- Source: https://github.com/denoland/rusty_v8 README (repo file), GitHub releases API for v152.2.0 (published 2026-08-20), https://v8.dev/docs/embed, https://v8.dev/docs/inspector, https://v8.dev/blog/jitless.
- Version: README states "V8 Version: 15.2.124.1"; crate majors track Chrome. License MIT (crate); V8 sample code is BSD-style per v8.dev. deno_core latest release tag 0.197.0.
- Prebuilt static libraries on the v152.2.0 release: Windows `x86_64-pc-windows-msvc` (38.1 MB gz) and `aarch64-pc-windows-msvc` (37.1 MB gz); macOS `x86_64` and `aarch64` (about 38.6 and 38.8 MB gz); Linux `x86_64`/`aarch64` gnu and musl (about 36.7 to 38.2 MB gz), `riscv64gc` (67 MB gz); iOS device and simulator (about 19 MB gz). Debug archives are 77 to 100 MB gz. `ptrcomp_*` (pointer compression) archives exist for macOS and Linux only, not Windows. No Android archive was published.
- Compressed archive sizes are not shipped-binary sizes; the README only calls the artifact "large" and no linked-binary-size figure was found.
- Android: README documents source cross-builds from an x86_64 host to `aarch64-linux-android` or `x86_64-linux-android` using `V8_FROM_SOURCE=1` (cargo or `cross`). The README says a V8 source build "often takes 30 minutes to compile".
- JIT: on by default. iOS device target is built jitless because iOS denies the JIT entitlement to non-WebKit apps; the simulator keeps the JIT; WebAssembly is also disabled there (README).
- Jitless (v8.dev blog, summary): `--jitless` runs Ignition only, no executable memory. Reported costs at the time of that post: about 40% slower on Speedometer 2.0, 80% regression on Web Tooling Benchmark, 6% slower JS in a YouTube-browsing scenario; median heap change -1.7%.
- Embedding API: isolates (own heap), contexts, handles, snapshots (v8.dev/docs/embed). rusty_v8 `src/` contains modules for `inspector`, `module`, `snapshot`, `script_compiler` (code cache), `isolate_group`, `platform`, `value_serializer`, `wasm` and others. rusty_v8 also exposes build options for the V8 sandbox (about 1 TB virtual memory reserved) and pointer compression.
- Inspector: V8 provides the Inspector Protocol (CDP-style JSON messages). The embedder supplies a channel: messages in via `session->dispatchProtocolMessage`, responses and notifications out via `sendResponse`/`sendNotification` (v8.dev/docs/inspector, summary). The embedder must supply the transport (for example WebSocket) itself.
- Hot update: no built-in HMR API. Available primitives are the module API (`module.rs`), script compilation with code cache (`script_compiler.rs`), contexts and isolates, and snapshots.
- Not primary-verified: Windows build instructions beyond "64-bit toolchain, `tools/win` populated manually".

## QuickJS (Bellard) and QuickJS-NG

- Sources: https://bellard.org/quickjs/ (summary), https://github.com/quickjs-ng/quickjs docs `diff.md`, `es_features.md`, `supported_platforms.md`, `projects.md` (repo files), `quickjs.h` on master (repo file), releases API.
- Bellard: release 2026-06-04. Page claims "Almost complete ES2025 support including modules, asynchronous generators and full Annex B", nearly 100% of test262 with ES2025 features selected, about 367 KiB x86 code for hello world, reference counting with cycle removal, MIT, 42% faster than the previous release on the bench-v8 score. It can compile scripts to executables.
- QuickJS-NG: fork of the original after it "went dormant" (README summary). Latest release v0.18.0 on 2026-11-01 (previous v0.17.0 on 2026-09-18). MIT. Docs state about one release every 2 months, test262 run on every change, CMake build, MSVC supported, opcode fusion and polymorphic inline caching (performance claims, no figures given). ES additions listed: resizable ArrayBuffer, Float16Array, WeakRef, FinalizationRegistry, Iterator Helpers, Promise.try, Error.isError, Set operations; plus V8 stack-trace API (`Error.captureStackTrace`, `prepareStackTrace`, `stackTraceLimit`). `es_features.md`: "Due to size constraints it is unlikely QuickJS will ever support the Intl APIs." test262 progress is tracked at https://test262.fyi/#|qjs_ng (numbers not extractable via text fetch).
- QuickJS-NG supported platforms table: Linux (glibc, musl), macOS >= 11, Windows >= 7 (VS >= 2022 and Clang), FreeBSD/OpenBSD/NetBSD (limited testing), Android NDK >= 26.0.10792818 (limited testing), iOS (limited testing), MinGW.
- Embedding API (`quickjs.h`): `JS_NewRuntime`, `JS_SetMemoryLimit`, `JS_SetMaxStackSize`, `JS_SetInterruptHandler` (now passes a `JSContext`), `JS_SetHostPromiseRejectionTracker`, `JS_SetModuleLoaderFunc`/`JS_SetModuleLoaderFunc2` (import attributes), `JS_LoadModule`, `JS_ExecutePendingJob`, `JS_WriteObject`/`JS_ReadObject` (bytecode serialize/load), `JS_EvalFunction`, `JS_NewClass`. NG docs say "the entire API is not yet documented."
- Debugging: no inspector or CDP support found in the NG docs or header. `JS_SetInterruptHandler` and `JS_SetDumpFlags` exist; neither is a debugger. (Absence in the pages read, not a positive statement from the project.)
- Hot update: module loader hook plus bytecode read/write; no HMR API.
- Ecosystem bindings listed in `projects.md`: rquickjs (Rust), quickjs-go, txiki.js, react-native-quickjs ("JSI runtime for React Native using QuickJS-NG. Replaces Hermes / JSC"), GodotJS.
- rquickjs (https://github.com/DelSkayn/rquickjs, summary): wraps QuickJS-NG, MIT. Async/Promise-to-Future integration, user-defined module resolvers and loaders, bytecode bundling macro. Shipped bindings: x86_64 Windows GNU/MSVC (MSVC QuickJS support marked experimental), aarch64 MSVC untested; macOS x86_64 tested, aarch64 supported but untested; Android not listed in shipped bindings (the `bindgen` feature is suggested for other targets).

## Hermes

- Sources: https://github.com/facebook/hermes branch `static_h` docs `Features.md`, `JIT.md`, `Modules.md`, `ReactNativeIntegration.md`, `BuildingAndRunning.md` (repo files), `API/hermes/` listing, releases API, https://reactnative.dev/docs/hermes (summary).
- License MIT (GitHub license metadata and README summary).
- Model: AOT compile JS to bytecode (`.hbc`, memory-mapped), run by interpreter. `shermes` compiles to native executables. "Static Hermes" is the main development line (README summary). `Function.prototype.toString` returns a `[bytecode]` placeholder unless `'show source'` is used.
- Distribution: standalone release tags stop at v0.13.0 (2024-08-16, CLI archives for darwin ~10.7 MB, linux ~48 MB, windows ~18 MB). Since React Native 0.69 Hermes ships bundled with React Native (`ReactNativeIntegration.md`). Building standalone: Linux and macOS via CMake + Ninja, Windows via Visual Studio CMake generator (`BuildingAndRunning.md`); Android build path is via React Native, the doc does not cover it. A standalone embedding guide was not found; the embedding API is JSI (`API/jsi/jsi/jsi.h`: `evaluateJavaScript`, `prepareJavaScript`/`evaluatePreparedJavaScript`, `drainMicrotasks`, `isInspectable`).
- ES coverage per `Features.md` (current doc): ES2015 language fully including classes, let/const, destructuring, generators; async/await; optional chaining; nullish; BigInt; class fields, private members, static blocks; Proxy and Reflect; Promise (polyfill-based, includes `try`, `withResolvers`); WeakRef; Iterator helpers, Set methods, `RegExp.escape`, `Float16Array`; TextEncoder/TextDecoder.
- Missing or deviating (same doc):
  - ES modules: no runtime module loader, `import`/`export` rejected, dynamic `import()` unsupported; a module system is "planned". Hermes expects a bundler (Metro in React Native). A CommonJS-style `-commonjs` module mode with `metadata.json` exists (`Modules.md`).
  - Async generators only behind `-Xasync-generators`, off by default.
  - `Intl` not built by default (`HERMES_ENABLE_INTL` OFF); partial Android/Apple-platform implementations; docs recommend a polyfill such as FormatJS.
  - `Temporal`, `SharedArrayBuffer`/`Atomics`, `Array.fromAsync`, `using`/`Symbol.dispose`, RegExp `/v`, resizable ArrayBuffer absent.
  - Local `eval()` cannot see local variables; `with` unsupported; `Symbol.species` unsupported (subclassed Array methods return plain Array).
  - TDZ checks and per-iteration `let` bindings in loops are off by default (flags `-Xenable-tdz`, `-Xes6-block-scoping`), which changes closure-in-loop behaviour unless flags are set.
- JIT: `JIT.md` describes a baseline arm64 JIT, with x86-64 SysV (non-Windows) in progress; enabled on macOS and Mac Catalyst but disabled on other Apple platforms. Windows x86-64 is not covered by the JIT.
- Debugging: `API/hermes/` contains `cdp/`, `DebuggerAPI.*` and `AsyncDebuggerAPI.*`, so a CDP implementation exists in-tree. A usage guide for embedders was not found.
- Size: no figure in the docs read. README says AOT compilation is designed to help startup, memory and binary size. Old release assets (v0.11.0) list `hermes-runtime-android` ~210 MB and `hermes-runtime-darwin` ~462 MB, which are SDK archives, not runtime size.
- Hot update: bytecode loading and `prepareJavaScript` allow precompiled units; no HMR API.

## JavaScriptCore

- Sources: https://docs.webkit.org/Deep%20Dive/JSC/JavaScriptCore.html (summary), WebKit repo `Source/JavaScriptCore` and `Source/cmake` listings and files (repo files), https://github.com/react-native-community/javascriptcore (summary), web search results on community Android status (third-party, treated as opinion).
- Tiers: LLInt interpreter, Baseline JIT, DFG JIT, FTL JIT (docs.webkit.org). Thresholds quoted there are approximate.
- Embedding APIs in tree (`Source/JavaScriptCore/API`): C API (`JSContextRef.h`, `JSObjectRef.h`, `JSValueRef.h`, `JSStringRef.h`, `JSTypedArray.h`), Objective-C API (`JSContext.h`, `JSValue.h`, `JSScript.h` for module and cached-script loading), and a GLib API.
- Platforms in tree: `PlatformCocoa.cmake`, `PlatformWin.cmake`, `PlatformJSCOnly.cmake`, `PlatformGTK.cmake`, `PlatformWPE.cmake`, `PlatformPlayStation.cmake`. `Source/cmake/OptionsJSCOnly.cmake` has a JSCOnly port that builds JSC without WebCore, with a Windows branch, an option for static JSC (`ENABLE_STATIC_JSC`, default OFF) and `ENABLE_REMOTE_INSPECTOR` defaulting OFF for that port. Whether JSCOnly on Windows is a supported, maintained configuration was not confirmed in a primary doc; older wiki pages (archived, ~2018) do not mention Windows.
- macOS: JavaScriptCore is a system framework on Apple platforms (Cocoa port). Using it needs no engine bundling. Remote inspection API files (`JSRemoteInspector.h`) exist in tree.
- Android: no official Android port in the cmake platform list. The React Native route uses `jsc-android` via the community package `@react-native-community/javascriptcore` (RN 0.79+, new architecture only; Callstack and Expo maintainers; JSC extracted from RN core). A third-party issue (BabylonJS JsRuntimeHost #186) describes `org.webkit:android-jsc` as WebKit from 2019 and effectively abandoned; this is an opinion, not an official statement. RN removal-from-core version is reported inconsistently by secondary sources (0.80 to 0.82).
- License: `Source/JavaScriptCore/COPYING.LIB` (LGPL text, referring to KDE libraries) is present; sampled source files (`JSBase.h`, `JSGlobalObject.cpp`) carry a BSD-style (2- and 3-clause) Apple header. The overall effective licence for a distributed build was not resolved from a primary statement.
- Hot update: `JSScript` (Obj-C) supports module scripts and cached bytecode; no HMR API.

## Boa

- Sources: https://boajs.dev/ (summary), https://github.com/boa-dev/boa README (repo file), `boa-dev/data` `test262/refs/heads/main/latest.json` (repo file), releases API.
- Rust, MIT, v0.22 released 2026-08-28 (previous v0.21.1 2026-03-29). Embed via `boa_engine` crate (`Context::eval`). Companion crates: `boa_runtime` (Web APIs), `boa_icu_provider` (ICU4X data). Temporal via `temporal_rs` (boajs.dev blog titles, Sept 2025).
- Conformance: README says "more than 90%". `latest.json` at fetch time: 53,578 tests, 51,450 passed (96.0%), 1,648 ignored, 0 panics. ES2017 to ES2025 buckets are in the same file. Which Boa commit that data corresponds to was not verified.
- README calls Boa "experimental". Performance: a Benchmarks page is linked on boajs.dev; no figures retrieved. Docs folder includes `vm.md`, `bytecompiler.md`, `debugging.md`, `profiling.md`. No inspector/CDP documentation found; the CLI offers `--debug-object`, `--trace`, `--flowgraph`.
- Module support: CLI has `-m/--module` with a module resolver root. WASM target supported.

## Other engines

- SpiderMonkey (https://spidermonkey.dev/, https://github.com/servo/mozjs, `js/src/jsapi.h` in the Mozilla repo): embeddable in C++ and Rust, shell, or WASI. `mozjs` crates track `mozilla-esr153` (153.0). `jsapi.h` header is MPL-2.0. mozjs documents Linux and Windows builds (Windows needs Visual Studio, LLVM 14+, MozTools 4.0, Python 3.11) and prebuilt archives via `MOZJS_ARCHIVE`; macOS and Android are not documented on the mozjs README. spidermonkey.dev links to Debugger internals but no embedder summary was extracted.
- JerryScript (https://github.com/jerryscript-project/jerryscript, summary): C99, Apache-2.0, aimed at microcontrollers (under 64 KB RAM, under 200 KB flash, 258 KB binary on ARM Thumb-2). ES5.1 full; README states ES2025 compliance is 70%. Has a debugger and a transport interface.
- Duktape (https://duktape.org/, summary): MIT, ES5/5.1 with partial ES2015/2016, 160 kB flash and 64 kB RAM class footprint, built-in debugger, listed "Stable".
- Not researched: Nova, Kiesel (Zig), goja/Sobek (Go), engines hosted as WASM, Android WebView or system web views (a WebView is a browser surface, not an embeddable engine, and would not be an own-drawn host).

## Cross-cutting facts relevant to Gable

- Gable's runtime inputs per the task: TS transpiled to JS, TC39 Signals polyfill, RxJS, no-eval template interpreter. The no-eval requirement means engines that restrict `eval` or `new Function` (Hermes, local eval only) are not a constraint for template evaluation, though Hermes `with` and local-`eval` limits apply to any dependency that uses them.
- Module delivery: V8, QuickJS(-NG), Boa, JSC, SpiderMonkey provide native ES module loading hooks. Hermes does not; code must be bundled to a single script or its CommonJS mode.
- Intl: the QuickJS-NG docs say it is unlikely ever to be supported; Hermes does not build it by default; Boa ships an ICU4X data provider crate. Intl status for V8 (rusty_v8 has `icu.rs`), JSC and SpiderMonkey embeddings was not verified from primary docs. No data was collected on Intl binary-size cost beyond Hermes docs stating bundling ICU4C "would cost tens of megabytes".
- JIT and macOS: V8 and JSC JIT need executable memory. Apple's `com.apple.security.cs.allow-jit` hardened-runtime entitlement is the mechanism; the Apple page fetched returned only a title, so the entitlement's behaviour here is unverified against Apple text. rusty_v8 has a jitless iOS build; V8 itself documents `--jitless`.
- Inspector availability: V8 (Inspector Protocol, embedder-supplied transport), Hermes (in-tree CDP code), JSC (remote inspector API in tree, OFF by default in JSCOnly), SpiderMonkey (Debugger API, not verified); QuickJS, Boa: none found.
- Hot update: no engine offers an HMR API. All offer script/module evaluate, plus some form of precompiled-code load (V8 code cache and snapshots, QuickJS `JS_ReadObject`, Hermes bytecode, JSC `JSScript` cache). V8, QuickJS and JSC support multiple independent contexts/runtimes within one process.

## Gaps (not established from primary sources)

- Independent performance comparison across engines on a workload like Gable's; only vendor claims were found (QuickJS 42% improvement, V8 jitless costs). test262.fyi is a JS-rendered page and returned no numbers; QuickJS-NG, Hermes, V8 and JSC pass rates need a browser read.
- Shipped binary size per engine and platform (only QuickJS ~367 KiB hello world, JerryScript, Duktape footprints, and rusty_v8 compressed archive sizes were found).
- Hermes standalone embedding and CDP usage outside React Native.
- JSC on Windows and Android: current supported status and a maintained prebuilt.
- SpiderMonkey on macOS and Android via mozjs.
- V8 Android prebuilts (none published by rusty_v8; other projects not examined).
- Memory use and startup time numbers for any engine.
