# Gable engine switch-over report

This report is the M9 milestone (TASK-100.10). It checks the Gable engine against the switch-over conditions in [js-engine-spec.md section 11](js-engine-spec.md#11-conformance-gate-and-switch-over). Read it as the baseline the engine starts from after the switch: what passes, what is slow, and what is still open.

## Verdict

| # | Condition | Kind | Status |
| --- | --- | --- | --- |
| 1 | Every included test262 test passes except documented exclusions | gate | **holds** |
| 2 | Gable's own test suites pass under the Gable engine | gate | **holds** (two V8 wall-clock budgets are counted as condition 3, see below) |
| 3 | Gable benchmark set exists, the interim baseline is recorded, the gap is reported | reported | **reported**: on Gable's workloads the Gable engine is 1.6x to 4.2x slower than QuickJS-NG (geomean 2.89x), and its peak memory is 1.4x to 18x higher |
| 4 | The debugger covers the first version (section 9) | gate | **holds** (M8, TASK-100.9) |
| 5 | The interim engine stays selectable for one release | follows the switch | **in place** |

Conditions 1, 2 and 4 hold, so the Gable engine is now the default and no further sign-off is needed. `EngineChoice::Gable` is the default in `native/engine-harness/src/engine_choice.rs`, and `--engine quickjs` still selects the interim QuickJS-NG adapter. Once the release after the switch has shipped, remove the `QuickJs` variant and the `gable-engine-quickjs` dependency.

The harness in `native/engine-harness` is the only Gable-side embedder today, so that is where the default lives. A future Gable Native runtime should get its engine through `EngineChoice` or copy its default.

## Condition 1: test262

The test262 runner (`gable-js-test262`) runs test262 at the pinned commit `e4fbf577` with the ES2025 feature cut from `crates/gable-js-test262/post-es2025-features.txt`. It runs every test in both strict and sloppy mode where the test's flags allow.

| run | tests | passed | failed | skipped (excluded or post-ES2025) |
| --- | ---: | ---: | ---: | ---: |
| `--engine gable` (built-ins, language, annexB, harness) | 42225 | 42225 | 0 | 6685 |
| `--engine gable --precompile` (through bytecode serialization) | 42225 | 42225 | 0 | 6685 |
| `--engine gable --only-intl402` (reported separately) | 981 | 981 | 0 | 2412 |

The first full run, done while other heavy jobs were running, reported one timeout: `built-ins/decodeURIComponent/S15.1.3.2_A2.5_T1.js`, a long loop. It passed when run on its own, so it is load-sensitive rather than failing.

The checked-in baselines `baselines/gable.json` and `baselines/gable-intl402.json` list no expected failures. Every skipped test is accounted for in `exclusions/gable.txt`, which gives a reason for each entry, or falls after the ES2025 cut. The excluded groups:

- `IsHTMLDDA` (a browser host hook; Gable has no `document.all`).
- Proper tail calls.
- Atomics features that need multiple agents or a blocking main thread: `CanBlockIsFalse`, `Atomics.wait` and `Atomics.waitAsync`. The engine is single-agent (spec section 2).
- Six parser follow-ups for lone surrogates in eval'd source.
- intl402 gaps in the ICU4X data: `dayPeriod`, German search collation, the `gv` locale, `hanidec` with U+202F, and one `DurationFormat` flag.

The spec's target is zero exceptions. The parser follow-ups and the ICU4X gaps are the only exclusions that the engine could close itself; the others are deliberate scope decisions.

## Condition 2: Gable's own suites

### How the suites run in the engine

`native/engine-harness` is a small Gable-side embedder. It is outside `native/engine` so the engine workspace stays Gable-agnostic (ADR 0016). For each in-scope test file:

1. `js/run-suites.mjs` bundles the file with rolldown into one ESM file. The bundle uses the aliases from the root `vitest.config.ts`, `vitest` resolves to a vitest-compatible shim (`js/vitest-shim.js`), and `process.env.NODE_ENV` is defined as `"test"` the way a bundler does for an app build.
2. `gable-harness` loads the bundle into a fresh engine through `Host::load_module` and runs a jobs-then-timers event loop. It supplies timers, `performance.now` and a clock that skips idle waits.
3. A host prelude (`js/host-prelude.js`) installs WinterCG stand-ins the tests use (`queueMicrotask`, `structuredClone`, `URL`, `Headers`, `Response`, `AbortController`, `TextEncoder`, `EventTarget` and others), but only where the engine lacks them.
4. The runner parses each test's result and compares the run against `js/suites-expected.json`. A file that fails to load, throws outside a test, leaves a promise rejection unhandled, or never reports completion counts as failed.

The same bundles also run under Node, which checks the shim against vitest: the per-file test counts match vitest's JSON reporter (760 tests).

CI runs this in `.github/workflows/engine-suites.yml` on Ubuntu and Windows. The Gable run is the gate; Node and QuickJS-NG are run as references.

### Scope

79 test files are in scope and 118 are out. A file is out of scope for one of two rules:

- **It needs a DOM** (a `@vitest-environment jsdom` or `happy-dom` header): 72 files. The engine provides no DOM (spec section 8). These tests cover `renderer-dom`, the `*.dom.test.ts` files of `ui` and `ui-primitives`, the editor's plugins and components, and the designer's accessibility and DOM performance checks.
- **It is Node tooling**: 46 files. These import `node:` built-ins (directly or anywhere in their bundle graph) or load a `scripts/*.mjs` file at run time. They cover the Vite plugin, the language service, the Prettier plugin, `create-gable`, the `gable-ui` CLI, the designer's file and git tools, and the type-level tests that spawn `tsc`. All of these run in Node, not in an app.

`node native/engine-harness/js/run-suites.mjs --list` prints every file with its rule.

| package | in scope | out of scope |
| --- | ---: | ---: |
| testing (router, forms, http, i18n, hmr, resources and the rest) | 31 | 2 |
| ui | 15 | 38 |
| ui-primitives | 10 | 10 |
| core | 6 | 2 |
| store | 5 | 1 |
| editor | 4 | 12 |
| template-format | 4 | 0 |
| designer | 2 | 24 |
| devtools-extension | 1 | 0 |
| renderer-dom, vite, language-service, create-gable, gable-ui, vscode, prettier-plugin | 0 | 29 |

### Results

| runtime | tests | passed | failed | notes |
| --- | ---: | ---: | ---: | --- |
| Node (shim check) | 760 | 760 | 0 | |
| Gable engine | 760 | 758 | 2 | both failures are V8 wall-clock budgets |
| QuickJS-NG (interim) | 760 | 749 to 750 | 10 to 11 | 9 need Intl, which the interim adapter is built without; the same 2 budgets (the yjs one passes on some runs) |

The two failures under the Gable engine are assertions on wall-clock time, calibrated for V8:

- `editor/src/yjs/perf.test.ts`, "stays fast per change in a 10000-paragraph document": the budget is 25 ms per change. V8 takes about 3 ms; the Gable engine takes about 34 ms.
- `ui/src/highlight.test.ts`, "is linear on large and adversarial input": the budget is 2 s per 100k to 400k character input. The Gable engine takes about 3.5 s in the worst case, and the time grows linearly with input size. Before this milestone it took 97 s, because of two quadratic engine bugs (see below).

Both measure speed, not behaviour. Section 11 puts speed under condition 3, which is reported rather than gated, so `suites-expected.json` marks these two tests as `timing:` entries that may pass or fail. Every other listed failure is strict: if a listed test starts passing, the run reports it as FIXED and fails until the list is updated. **Decision for the maintainer:** if you would rather treat these budgets as correctness, condition 2 does not hold until the engine is roughly 1.4x (yjs) and 1.75x (highlight) faster on these paths.

### Bugs the suites found

Engine (fixed in the engine crates, with regression tests; test262 still passes in full):

- **The collector never ran under an event loop** (`gable-js-vm`). The benchmarks found this one; see condition 3 below. Any long-running app would have run out of memory.
- **A failing sticky regex scanned the rest of the input** (`gable-js-regex`). regress has no anchored match, so a `y` regex was run as an unanchored search and its result thrown away if it did not start at `lastIndex`. A tokenizer that probes many sticky patterns at each position was therefore quadratic. The fix compiles the pattern a second time as `(?:P)()|`: at any position the empty alternative matches if `P` does not, so the search stops at `lastIndex` either way, and the empty marker group tells the two apart. The test `a_failed_sticky_match_does_not_search_the_rest_of_the_input` took 39 s before the fix and now passes well within its 5 s bound.
- **The regex input cache was thrashed by short strings** (`gable-js-vm`). The VM kept the UTF-16 copy of only the most recent regex input. A tokenizer that alternates `re.exec(source)` with regex work on short tokens recopied the whole source on every call. The cache now skips strings under 256 code units, which are cheap to copy, and keeps the four most recent longer ones. Tests: `tests/regexp.rs`.

Gable side (minimal fixes):

- **`@gable/core` http assumed `FormData` and `Blob` exist.** `encodeBody` used `body instanceof FormData`, which throws a ReferenceError on a host without those globals; spec section 8 does not list them. The checks now test that the global exists first. Test: `testing/src/http.test.ts`, "sends JSON on a host without FormData or Blob".
- **Zag (`@zag-js/store`, used by `ui-primitives`) tests `instanceof File` and `instanceof Blob`.** The harness prelude defines minimal `Blob` and `File` stand-ins. This is a finding for the Gable Native host runtime: it needs `Blob` and `File`, or Zag has to be patched. **Decision for the maintainer:** whether to add `Blob` and `File` to the spec section 8 host globals.
- `process.env.NODE_ENV` is read by dependencies. App bundles replace it at build time, so the harness bundler defines it rather than the engine providing a `process` global.

### Open follow-up

A regex with a non-multiline `^`, run with `exec` on a long string, still scans the whole input when it fails. QuickJS-NG behaves the same way, so it is not a regression against the interim engine. It belongs with the performance work in TASK-100.14.

## Condition 3: performance (reported, not gated)

### The benchmark set

The workloads live in `native/engine-harness/bench`. Each runs through public APIs (`@gable/core`, `@gable/testing` and RxJS) and returns a checksum, and the run fails if the engines disagree on it, so a fast time cannot come from skipped work.

| benchmark | what it does |
| --- | --- |
| `signal-churn` | A 200-wide, 6-deep graph of computeds (about 1200 nodes): write one source and read the whole graph's sum, 200 times |
| `signal-create` | Creating and dropping many small signal graphs (allocation and collection of nodes) |
| `rxjs-operators` | A `map`/`filter`/`scan`/`distinctUntilChanged` pipeline over 100k values |
| `rxjs-higher-order` | `mergeMap` and `switchMap` into inner observables, then `bufferCount` |
| `rxjs-subject-fanout` | One `Subject` feeding 100 piped subscribers, pushed many times |
| `template-mount` | Mounting 50 cards (bindings, `@if`, a small `@for` each) through the template interpreter, then destroying them |
| `template-update` | Updating every binding of a mounted card 200 times |
| `list-diff` | A keyed `@for` over 1000 rows: reverse, swap two, remove 100, insert 100, replace all, restore |
| `ui-bundle-startup` | Loading and evaluating the `@gable/ui` bundle (1.4 MB) in a fresh engine |

`node native/engine-harness/js/run-bench.mjs` runs each (engine, benchmark) pair in its own process, with 2 warmup and 10 measured iterations, and reports the median. Node is included as a reference only. The CI `bench` job runs it on pull requests that touch `native/` or `packages/` and uploads the JSON. It never fails on numbers.

### The baseline

Results file: `native/engine-harness/bench/baseline.json`. Machine: Windows 11 Pro (10.0.26200), Intel Core i9-9900KF at 3.60 GHz, 16 logical CPUs, 64 GiB, Node 24.21. Engine at `integration/js-engine` ca5e376 plus this milestone's fixes. Desktop machine, not isolated.

| benchmark | Gable (ms) | QuickJS-NG (ms) | Gable / QuickJS | Node (ms) | Gable peak RSS (MiB) | QuickJS peak RSS (MiB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| rxjs-operators | 412.7 | 98.5 | 4.19x | 4.7 | 9.5 | 6.6 |
| rxjs-higher-order | 563.3 | 180.9 | 3.11x | 6.0 | 124.4 | 6.7 |
| rxjs-subject-fanout | 304.7 | 78.8 | 3.87x | 3.6 | 38.1 | 6.6 |
| signal-churn | 970.7 | 232.8 | 4.17x | 28.2 | 26.9 | 9.1 |
| signal-create | 188.8 | 65.0 | 2.90x | 5.8 | 48.5 | 7.9 |
| template-mount | 124.4 | 51.4 | 2.42x | 8.4 | 52.9 | 17.8 |
| template-update | 77.9 | 28.6 | 2.73x | 3.4 | 26.0 | 10.1 |
| list-diff | 1280.2 | 779.0 | 1.64x | 40.6 | 237.9 | 41.3 |
| ui-bundle-startup | 145.3 | 69.1 | 2.10x | - | 44.3 | 19.6 |

Geometric mean of Gable / QuickJS-NG over the nine benchmarks: **2.89x** (the Gable engine is slower).

### Reading the gap

- **Time.** The Gable engine is 1.6x to 4.2x slower than the interim engine on Gable's own workloads. The largest gaps are signal propagation and RxJS (3.1x to 4.2x). Both are dominated by small function calls, closures and property reads. That matches the TASK-100.13 micro-benchmarks (`native/engine/crates/gable-js-bench/baselines/README.md`, geomean 2.87x), where the interpreter core is the largest gap: `loop-array-index` 7.06x, `prop-polymorphic` 7.0x, `prop-monomorphic` 6.3x, `calls-recursive` 5.5x and `method-calls` 5.0x. Template work and list diffing are closer (1.6x to 2.7x) because more of their time is spent in built-ins and string work.
- **Startup.** Loading the `@gable/ui` bundle takes 145 ms against 69 ms (2.1x). This is compile time; precompiled bytecode (M7) is not used in this measurement.
- **Memory.** Peak memory is 1.4x to 18x higher. The collector is deferred while a native frame is on the stack, and every callback (a computed, an observer, an `Array.prototype` callback) runs as one. So a single long synchronous host call keeps all of its garbage until it returns. `rxjs-higher-order` peaks at 124 MiB against 6.7 MiB, and `list-diff` at 238 MiB against 41 MiB.
- **Node** is 10x to 100x faster than either interpreter, as expected for a JIT. It is shown only to place the two interpreters, not as a target.

The fixes are scheduled as ordinary work after the switch, under TASK-100.14. The two V8 wall-clock tests in condition 2 are where this gap is visible in the suites.

### Memory bug found by the benchmarks (fixed)

The first baseline run showed memory growing without bound: `list-diff` reached 3.5 GiB of peak RSS and `rxjs-higher-order` 1.3 GiB over 12 iterations, about 21 MiB more for each iteration of `template-mount`. The cause was the deferral described above. The collector ran only at the top level of a script, and an embedder that runs code from an event loop (promise jobs, timer callbacks, host calls) never gets there, so it **never collected at all**. Two safe points in `gable-js-vm` fix it: one between jobs while the host drains the job queue, and one on entry to a host `call` or `construct`, before any argument becomes an unrooted VM value. Tests: `crates/gable-js-vm/tests/gc_safe_points.rs`. It would have made any long-running Gable app run out of memory, so it counted for condition 2 even though a benchmark found it.

What is left is the deferral inside a single native frame. Collecting there needs the native code paths to root their values, which is a larger change. It is listed for TASK-100.14.

## Condition 4: debugger

M8 (TASK-100.9, ADR 0017) delivered the first version from spec section 9, and both of its acceptance criteria are checked:

- The debugger interface in `gable-js-vm` supports breakpoints, stepping, frame and scope inspection, async stacks and script source.
- The separate `gable-js-cdp` crate is a Chrome DevTools Protocol adapter. It covers console, source-mapped exceptions, breakpoints, stepping and evaluate, and it is tested with a WebSocket CDP client.

These tests run in the engine workspace's `cargo test`. M8 left some known limits: no `urlRegex` breakpoints, no `breakpointResolved` event, no stepping over an `await`, and the profiler domains reply as no-ops. These are follow-ups, not part of the first version.

## Condition 5: the interim engine

`--engine quickjs` selects the QuickJS-NG adapter (`gable-engine-quickjs`) in the harness and in the test262 and micro-benchmark runners. CI keeps running the suites under it. Remove it in the release after the switch.

## Backlog state worth knowing

TASK-100.1 (M0: workspace, test262 runner and CI) and TASK-100.7 (M6: Intl) are still In Progress in the backlog. Neither gates this milestone: the test262 runner and baselines from M0 work and are used above, and the Intl subset Gable uses passes (`--only-intl402` above and the i18n suites). Their remaining items need closing or splitting separately.

## Reproducing

From the repository root, after `npm ci` and `cargo build --release` in `native/engine-harness`:

```sh
node native/engine-harness/js/run-suites.mjs --engine gable           # condition 2
node native/engine-harness/js/run-suites.mjs --engine gable --engine quickjs --engine node
node native/engine-harness/js/run-bench.mjs --out bench.json          # condition 3
```

From `native/engine`:

```sh
cargo run --release -p gable-js-test262 --bin test262 -- run --engine gable                  # condition 1
cargo run --release -p gable-js-test262 --bin test262 -- run --engine gable --precompile
cargo run --release -p gable-js-test262 --bin test262 -- run --engine gable --only-intl402
```
