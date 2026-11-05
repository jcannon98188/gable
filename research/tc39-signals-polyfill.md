# TC39 Signals polyfill: maturity and gaps (TASK-1.1)

Researched 2026-11-04. Primary sources only: the proposal repo and README, the polyfill repo and source, the polyfill's CHANGELOG and npm registry metadata, and maintainer statements in GitHub issues. Nothing here was benchmarked locally.

Sources:
- Proposal README: https://github.com/tc39/proposal-signals (raw: https://raw.githubusercontent.com/tc39/proposal-signals/main/README.md)
- Polyfill repo: https://github.com/proposal-signals/signal-polyfill (README, `src/`, `CHANGELOG.md`)
- TC39 Stage 1 list: https://github.com/tc39/proposals/blob/main/stage-1-proposals.md
- npm registry: https://registry.npmjs.org/signal-polyfill
- Issues cited inline by number.

## Verdict

Usable as a foundation for the signal graph, not as an unwrapped dependency. The core algorithm (State, Computed, Watcher, glitch-free pull with push invalidation) is sound and derives from Angular's signal graph. The package is a preview with no release since January 2025. Gable should wrap it behind its own module so the API, the polyfill's bugs, or a future native implementation can change underneath without touching gable code. Nothing found threatens fine-grained DOM updates or HMR state preservation, provided gable builds its own effect, scheduler and ownership layer.

## 1. Maturity and API stability

- Stage 1. The README says it "can currently be thought of as 'Stage 0'" and that the authors want to be "especially conservative" about advancing. It is listed in the Stage 1 table (champions include Daniel Ehrenberg, Yehuda Katz, Dominic Gannaway, Milo M). Sources: README; stage-1-proposals.md (both read 2026-11-04).
- The proposal README says: "it's best to not rely on its stability, as this API evolves during its review process." It expects native availability to take "at least 2-3 years" from its 2024 writing, and plans production-grade polyfills and framework integrations before Stage 2.
- The polyfill README says: "This polyfill is a preview of an in-progress proposal and could change at any time." and "Do not use this in production."
- Release cadence of `signal-polyfill` on npm (registry `time` field): 0.1.0 2024-03-31, 0.1.1 2024-05-14, 0.1.2 2024-07-23, 0.2.0 2024-10-01, 0.2.1 2024-10-11, 0.2.2 2025-01-17 (latest dist-tag). No release since. The last commit on `main` is 2025-02-13 (a benchmark PR comment workflow and ported tests). Open issues on the repo: roughly 15 (31 per the GitHub API count including PRs, 2026-11-04). Issues #60 and #62 were opened in April 2026, so people still use it and the repo is not archived.
- The proposal repo itself is still active (pushed 2026-01-25, 114 open issues). Open design questions as of 2026 include writable computeds (#277), renaming `Signal` (#272), async (#30, #269, #281), and weak references throughout the graph (#265).
- Public surface (README, `src/wrapper.ts`): `Signal.State` (`get`, `set`), `Signal.Computed` (`get`), `Signal.subtle` with `untrack`, `currentComputed`, `introspectSources`, `introspectSinks`, `hasSinks`, `hasSources`, `Watcher` (`watch`, `unwatch`, `getPending`) and the `watched`/`unwatched` option symbols. The polyfill README adds type guards `isState`, `isComputed`, `isWatcher` (0.2.1 changelog). These names have been stable since 0.1 but the README explicitly leaves them open to change.
- Implication: pin an exact version, import it only from one gable module, and expose gable's own `signal()`/`computed()`/`effect()` names.

## 2. Glitch-freedom and semantics

- README: computation is glitch-free ("no unnecessary calculations are ever performed"). Computeds are lazy and cached. Dependencies are tracked dynamically, so a branch not read last time does not trigger recomputation. Staleness is tracked by graph coloring (clean, checked, dirty, computing).
- Polyfill source (`src/graph.ts`): a `dirty` flag plus per-edge `version` numbers. A write marks live consumers dirty (push), reads call `producerUpdateValueVersion` and `consumerPollProducersForChange` to recompute only if a producer's version actually changed (pull). The `ngDevMode` identifier in the source reveals its Angular lineage (the proposal repo's #174 asks to remove it).
- Equality: default `Object.is`, overridable per State or Computed. A throwing comparator caches its error (README).
- Everything is synchronous. Writes apply immediately, there is no built-in batching, and reads always return a current value (README).
- Constraints during the notification phase: `Watcher` notify callbacks may not read or write signals. The polyfill throws "Writes to signals not permitted during Watcher callback" (`src/wrapper.ts`). `untrack` does not lift this (README).
- Writes inside a Computed are not forbidden by the polyfill and can produce unpredictable results (polyfill issue #51, open; proposal #150, #226). Gable should treat this as a lint or dev-mode error in its own layer.
- Known polyfill bugs (all open):
  - #27: a computed breaks if a dependency is set after the computed was unwatched by a Watcher, then re-watched (stale value).
  - #57: an exception thrown in a `watched`/`unwatched` callback interrupts the graph algorithm and can leave the graph inconsistent. Gable must not throw from those callbacks.
  - #56: `introspectSources(watcher)` returns duplicates.
  - tc39 #192, #201, #208, #209: edge cases around watchers added during notification, cycle-detection false positives, and inconsistent watcher state inside `watched` callbacks.

## 3. Performance

- No published benchmark numbers exist in the primary sources. The polyfill has a benchmark harness (`tests/benchmarks/benchmarks.ts`, built on `divdavem/js-reactivity-benchmark`) and a CI step that comments benchmark output on PRs (commit 2025-02-13), but it runs only the polyfill itself. Polyfill issue #33 ("Performance benchmark comparison with other reactive TS libs") is open. The README makes no performance claims. Gable should run js-reactivity-benchmark itself before committing (follow-up spike).
- Reported problems:
  - `unwatch` is slow: tc39 #215 reports 10x degradation on cleanup against a glimmer-style reactive runtime (reporter: lifeart, 2024-04/05; Dan Ehrenberg replied "PRs welcome"); #169 is a duplicate-style report. In `src/wrapper.ts`, `unwatch` loops over every producer and calls `signals.includes(...)`, which is O(producers x signals) per call. This matters for gable because component teardown and HMR swaps do mass unwatching.
  - Duplicate `watch` of the same signal is not de-duplicated (tc39 #157).
- Mitigation: gable should use one Watcher per scheduler, or per component root, rather than one per effect, and keep watched sets small. Verify with a benchmark of mount/unmount of 10k nodes.

## 4. Memory and ownership

- Live consumer edges are strong references. polyfill #43 (open, reported with Chrome and Firefox repros) says a dropped Computed stays alive as long as any source it reads is alive, because the source's `liveConsumerNode` array holds it. The reporter states the leak can "prevent this 'polyfill' becoming truly usable" for large graphs. The README says unwatched signals are collected normally, which conflicts with #43; the likely distinction is that #43 concerns computeds that were read while live. Treat the leak as real until reproduced and disproved.
- Related design issues: tc39 #252, #254, #265 (hold consumers weakly; a dirty computed keeps references to dependencies it would drop on recompute). Native engines may fix these. The polyfill cannot use `WeakRef` easily.
- The README says a Watcher keeps watched signals alive and that effects must be cleaned up by calling `unwatch`. It also says explicit disposal of computeds may be added if collection proves too expensive. So the official stance is: ownership is the framework's problem.

## 5. What gable must build (no built-in effect)

- The README: "The Signal API does not include any built-in function like `effect`." Its example (Watcher plus microtask queue plus `getPending()` re-read) is flagged "too basic to be useful. Do not copy/paste." The polyfill README says "To batch effect updates, library authors are expected to implement their own schedulers."
- Maintainer rationale (tc39 #242, 2024-10-07, justinfagnani): effects require an ownership model, and ownership matters because "the scheduler uses it to order effects", for example running component effects in tree order so parents render first and a child that takes data from its parent renders once. Gable's component tree and hierarchical DI line up with this directly.
- Required pieces:
  1. `effect(fn)`: a Computed wrapper whose Watcher notify callback only enqueues. Per the notify constraint, it cannot read or write signals itself.
  2. Scheduler: a queue flushed on a microtask or animation frame, which sorts or runs by owner-tree order, calls `watcher.getPending()`, re-reads each pending computed, then re-arms with `watcher.watch()` (calling `watch()` with no arguments resets the notified state, per `src/wrapper.ts`).
  3. Ownership and cleanup: a scope/owner tree so that disposing a component unwatches its effects and runs registered teardown callbacks. This is also where the `unwatch` cost (section 3) and the leak risk (section 4) are handled.
  4. Batching: signal writes are immediate; gable needs a `batch()` (or relies on the scheduler coalescing) so several writes produce one flush (cf. tc39 #239).
  5. Untracked helpers: `untracked(fn)` over `Signal.subtle.untrack`, which is documented as unsound if misused, and a guard against writes inside Computed (section 2).
  6. Errors: effects must catch and report exceptions so one failing effect does not stall the queue; `watched`/`unwatched` callbacks must never throw (#57).
  7. Async: signals are synchronous, and async is deliberately omitted (README, tc39 #30). Gable's RxJS interop (TASK-1.6) covers async sources; bridge into a State via `set` from a subscription, outside any Computed.
  8. Dev-mode checks: cycle detection exists in the polyfill (a Computed that reads itself throws), but not write-in-computed detection.

## 6. Does anything threaten fine-grained DOM updates?

No. The model fits well:
- Each binding becomes a small effect (or a Computed read inside one effect) over exactly the signals it reads. Dynamic dependency tracking and glitch-free pull mean a binding runs once per flush with consistent inputs.
- Risks are cost, not correctness: per-binding Watcher creation/teardown cost (use one Watcher per scheduler) and `unwatch` scaling (section 3). Per-node effects require a cheap owner/cleanup list in gable's own code.
- Notification-phase restrictions only forbid reading and writing during notify; deferring to the scheduler avoids them. Synchronous "immediate" effects are not possible on top of Watcher (tc39 #184, #263 discuss this, both open), so DOM updates will be at least microtask-deferred. Tests that expect synchronous DOM after `set` need a `flush()` helper.

## 7. Does anything threaten HMR state preservation?

No blocker found. Relevant facts:
- Signal state lives in `Signal.State` objects, which are plain heap objects that can be held across module reloads. HMR can keep the State instances and re-bind new component code to them. There is no global registry or hidden identity in the polyfill that prevents this; the polyfill adds no globals (tc39 polyfill #115 asked for clarification) and tracking is a module-level `activeConsumer` in `src/graph.ts`.
- Single-copy hazard: the graph's tracking state (`activeConsumer`, notification-phase flag) is module-scoped. If HMR (or a bundler) ends up with two copies of `signal-polyfill`, a Computed from one copy read inside an effect from the other will not track. Gable must make the signals module non-reloadable (HMR boundary excluded, deduped in the bundler) or hold the module on a `globalThis` symbol. Cross-realm signals are a known open concern (tc39 #219).
- Teardown on swap: the old component's effects must be unwatched or the old closures keep updating detached DOM (leak, section 4). This is gable's ownership layer, so HMR depends on getting scope disposal right, not on the polyfill.
- Computeds are derived and cheap to discard; State must be preserved. The gable HMR design (TASK-1.7) should decide the rule for State identity across edits to the declaring class (for example key by component path and field name). The polyfill offers no serialization (README lists SSR serialization as a TODO) and none is needed for in-memory HMR.
- Transactions and forked graphs are explicitly undesigned (README, tc39 #73), so atomic "swap everything or roll back" cannot be built on signals alone.

## 8. Recommendations for downstream tickets

- TASK-1.6 (Signals and RxJS interop): wrap `Signal.State`/`Computed`/`Watcher` in gable's own minimal API; do not re-export `Signal` directly. Interop writes go through `State.set` outside any Computed or Watcher callback.
- TASK-1.7 (HMR): treat the signals module as a singleton outside the HMR graph; require disposal scopes for each component instance.
- Add a follow-up spike: benchmark mount/unmount and many-binding updates on the polyfill (sections 3 and 4) and re-check polyfill issues #43 and #27 against the latest polyfill build before committing to the polyfill as a hard dependency. The alternative is to vendor and patch the graph code (Apache-2.0, as stated in the polyfill repo).
- Re-check at implementation time: `signal-polyfill` has had no release since 2025-01-17; if it is still untouched, plan to pin or vendor.

## Open uncertainties

- No performance numbers were verified; claims in section 3 are from issue reports and source inspection.
- Whether #43 reproduces on `0.2.2` was not tested.
- The polyfill's last-commit date was read from the GitHub API on 2026-11-04 and may lag behind unreleased work on branches.
