# Architecture decision records

Numbers are shared with the [agnijs repository](https://github.com/agnijs-rs/agnijs), where the engine lives. Engine-only ADRs moved there with their numbers kept (TASK-100.12); they are linked below.

## In this repository

- [Designer edits source files; it has no design model of its own](0001-source-files-are-the-design-source-of-truth.md)
- [Designer is a Tauri shell over the project's own Vite](0002-designer-is-a-tauri-shell-over-the-projects-own-vite.md)
- [Editor suggestions are marks recorded at dispatch](0003-editor-suggestions-are-marks-recorded-at-dispatch.md)
- [Gable Native owns its JavaScript engine, written in Rust](0004-gable-native-owns-its-javascript-engine-in-rust.md)
- [18. Gable adopts the AgniJS engine as a pinned git dependency](0018-gable-adopts-the-agnijs-engine-as-a-pinned-git-dependency.md)

## Moved to the agnijs repository

- [The engine interface is handle-based and host-driven](https://github.com/agnijs-rs/agnijs/blob/main/docs/adr/0006-engine-interface-is-handle-based-and-host-driven.md)
- [7. The engine parser is handwritten, produces a span-carrying ESTree-shaped AST, and validates regex literals syntax-only](https://github.com/agnijs-rs/agnijs/blob/main/docs/adr/0007-handwritten-parser-with-span-ast-and-syntax-only-regex-validation.md)
- [8. The engine compiles to register bytecode with an accumulator and resolves scopes at compile time](https://github.com/agnijs-rs/agnijs/blob/main/docs/adr/0008-register-bytecode-with-accumulator-and-compile-time-scope-resolution.md)
- [9. The heap is a set of index arenas collected by precise mark-sweep at interpreter safe points](https://github.com/agnijs-rs/agnijs/blob/main/docs/adr/0009-heap-is-index-arenas-with-precise-mark-sweep-at-safe-points.md)
- [10. Precompiled code ships in a versioned container that is rejected on mismatch](https://github.com/agnijs-rs/agnijs/blob/main/docs/adr/0010-versioned-bytecode-container.md)
- [11. The engine has no JIT tier in v1 and is designed to run without one on every platform](https://github.com/agnijs-rs/agnijs/blob/main/docs/adr/0011-no-jit-tier-in-v1.md)
- [12. Named property access uses monomorphic, shape-based inline caches kept in a side table](https://github.com/agnijs-rs/agnijs/blob/main/docs/adr/0012-monomorphic-shape-based-inline-caches.md)
- [13. RegExp matching adopts the `regress` backtracking engine behind a seam that owns the ECMAScript semantics](https://github.com/agnijs-rs/agnijs/blob/main/docs/adr/0013-regexp-matching-adopts-regress-behind-a-seam.md)
- [14. Date takes its clock and time zone from the host; buffers and Atomics are single-agent plain memory](https://github.com/agnijs-rs/agnijs/blob/main/docs/adr/0014-date-takes-its-clock-and-time-zone-from-the-host.md)
- [15. Intl is ICU4X behind the agnijs-js-intl seam, with bundled CLDR tables and spec-shaped workarounds](https://github.com/agnijs-rs/agnijs/blob/main/docs/adr/0015-intl-on-icu4x-behind-the-agnijs-js-intl-seam.md)
- [16. The engine workspace stands alone: Gable reaches in only through the engine interface](https://github.com/agnijs-rs/agnijs/blob/main/docs/adr/0016-the-engine-workspace-stands-alone.md)
- [17. The debugger is a capability beside the engine interface, and CDP lives in its own crate](https://github.com/agnijs-rs/agnijs/blob/main/docs/adr/0017-debugger-is-a-capability-beside-the-engine-interface-with-cdp-in-its-own-crate.md)

Their records still say "the Gable engine" and use the `gable-*` crate names in places: that is the engine's former working name. The agnijs copies carry the current names.
