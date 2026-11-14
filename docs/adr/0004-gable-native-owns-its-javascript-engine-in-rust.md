# Gable Native owns its JavaScript engine, written in Rust

Gable Native's host runtime is written in Rust, and Gable owns the JavaScript engine it embeds, also in Rust, behind an engine interface. Gable's value is true HMR, signals and native-feeling tooling, which no existing engine offers hooks for (hot update, host-object and garbage-collector integration with the retained node tree, an inspector shaped for Gable's tools), and one pure-Rust toolchain keeps macOS and Android builds free of C engine builds. The author cannot test on a Mac, so a pure-Rust engine that compiles anywhere also lowers that risk.

Until the Gable engine passes a test262 gate (the ES2025 edition minus an explicit exclusion list), the host runs an adopted engine (QuickJS-NG first, Boa as the pure-Rust alternative) behind the same engine interface, so the renderer, text, layout and dev loop never wait on it. The engine's implementation is a separate, later effort.

## Considered options

Adopting QuickJS-NG (tiny, near-full ES2025, no inspector, a C dependency), V8 (fast, but large and with no Android prebuilt) or Boa (pure Rust, 96% test262, still experimental) permanently. Owning the engine is the deliberate exception to Gable Native's rule of owning the seams and Gable-specific parts while adopting commodity layers (Skia, Parley, Taffy, AccessKit, winit) behind them.

## Consequences

A JavaScript engine is far larger than anything Gable has owned so far: apps run full TypeScript output and third-party code such as RxJS, so conformance, garbage collection and interpreter speed all have to be good enough, and reaching a high test262 pass rate is a long effort. The interim engine and the engine interface exist to keep that cost off the critical path. test262 does not measure performance, memory, the inspector or embedding behaviour, so those need their own gates.
