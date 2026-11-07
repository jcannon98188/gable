---
id: TASK-99.11
title: Gable JS engine design
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T22:02:00Z'
updated_date: '2026-11-07T22:30:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-99.10
parent_task_id: TASK-99
ordinal: 197000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Decide the design of the Gable-owned JavaScript engine in Rust: the ES2025 target and the explicit exclusion list (Intl, Annex B and anything else), the execution model, garbage-collection strategy, performance goals, host-object bindings and hot-update (HMR) hooks, inspector support, the engine interface that the interim adopted engine must also satisfy, and the test262 gate and switch-over rule from the interim engine. Written so a later implementation effort can build from it.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T22:30:00Z

---

Resolved with the user. Language target: full ES2025 (ECMA-262 16th edition) plus Annex B except IsHTMLDDA; eval and new Function supported with a host switch (HostEnsureCanCompileStrings); later editions and Stage 4 features added by feature flag; Stage 3 proposals out. Intl: the engine implements ECMA-402 (DateTimeFormat, NumberFormat, PluralRules, Collator, Segmenter, ListFormat, RelativeTimeFormat, DisplayNames, Locale) and toLocale* on ICU4X (pure Rust, shared with Parley) behind a seam, locale data trimmed to the app locales; test262 intl402 is tracked separately and the first switch-over gate covers only the Intl subset Gable uses (Gable core uses DateTimeFormat, NumberFormat and PluralRules). Execution model: handwritten parser, single-pass compiler to register-based bytecode with an accumulator (Ignition and Hermes style), compile-time slot resolution, shapes with inline caches in the interpreter, compact instructions, no JIT in v1 (avoids macOS hardened-runtime JIT entitlements and Android restrictions; room left for a later tier), serializable bytecode so production bundles can ship precompiled code. Garbage collection: precise non-moving mark-sweep on a single thread with size-class allocation, embedder values rooted through a scoped root stack, incremental slices scheduled between Gable flushes, WeakRef and FinalizationRegistry supported, heap interface designed so generational or moving collection can follow. Engine interface (satisfied by the Gable engine and the interim adopted engine): evaluate scripts and modules with a module loader hook for static imports from the bundle and dynamic import(); a host-driven job queue so microtasks (Gable flush) run after every host task; a promise-rejection tracker routed to the Gable error handler; host-supplied timers; interrupt and memory limits; realm creation; bytecode load and save; host classes with trace hooks; Renderer node handles are plain integers. Host globals (host layer, not the engine): the WinterCG baseline (console, setTimeout, setInterval, queueMicrotask, URL, URLSearchParams, fetch, AbortController, AbortSignal, TextEncoder, TextDecoder, performance, structuredClone, crypto.getRandomValues) plus globalThis, self, EventTarget, Event, CustomEvent, MessageChannel and a small navigator (userAgent identifying Gable Native, language, languages, onLine, hardwareConcurrency); window, document and location are not defined by default (a second node tree behind the Renderer, DOM-scale size, and browser-detection false positives are the reasons; the engine never provides a DOM either way); an opt-in DOM-compat package is recorded as fog. HMR: no engine-level hot-update primitive, because the HMR logic lives in JavaScript and import.meta.hot; the engine needs module re-loading under a new specifier, garbage collection of unreachable module records, and a host hook for import.meta. Debugging: a debugger interface in the engine (source positions per bytecode offset, breakpoints, stepping, frame and scope inspection, async stacks, script source) and a separate Gable-owned adapter to the Chrome DevTools Protocol; the first version covers console, source-mapped exceptions, breakpoints, stepping and evaluate; profiler and heap profiler later; the interim engine has no inspector, so interim debugging falls to the dev-loop ticket. Conformance gate: a pinned test262 commit and a feature list derived from the ES2025 cut, strict mode run twice as the suite requires, built-ins, language and annexB included, staging excluded, intl402 reported separately; exclusions in a checked-in file with a reason per entry; CI on Windows, Linux and macOS (the engine is pure Rust); the pass rate may not regress. Switch-over rule: the Gable engine becomes the default only when every included test passes except documented exclusions (target zero), Gable own test suites (core, router, forms, store and the rest) pass under it, a Gable benchmark set (signal churn, RxJS pipelines, the template interpreter, list diffing, gable-ui bundle startup) is at parity with the interim engine within a tolerance set after measuring that baseline, and the debugger covers the first version; the interim engine stays selectable for one release. The implementation of the engine is a later effort. macOS: pure Rust with no JIT, so no hardened-runtime JIT entitlement and the same build everywhere.

---
<!-- COMMENTS:END -->
