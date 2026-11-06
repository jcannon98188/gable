# Gable reactivity benchmark

A Node-only (no DOM) benchmark of Gable's signal graph and its RxJS bridges, in the style of
[milomg/js-reactivity-benchmark](https://github.com/milomg/js-reactivity-benchmark): deep, wide, diamond and dynamic
dependency graphs, many effects, and the `toObservable` / `toSignal` bridges. Where the comparison is natural each
scenario also runs on the **raw TC39 `signal-polyfill`** (what Gable's `signal`/`computed` wrap) and on **RxJS**.

## Run it

`@gable/core` is installed from a tarball in the gitignored `vendor/`, like `examples/todomvc`:

```sh
# from the repo root: build, pack @gable/* into this example's vendor/ and point package.json at it
npm run pack:local -- examples/reactivity-benchmark
cd examples/reactivity-benchmark
npm install
npm run bench
```

Options (after `--` with npm, or directly: `node src/bench.mjs ...`):

| Flag | Meaning |
| --- | --- |
| `--filter text` | Only scenarios whose id or title contains `text` (e.g. `--filter toSignal`). |
| `--samples n` / `--warmup n` | Timed runs (default 21) and untimed warmup runs (default 3). |
| `--scale x` | Multiplies every graph size (default 1; `--quick` is scale 0.1 with 5 samples). |
| `--json` | Print machine-readable results instead of the table. |

Each variant builds its graph once, then times `run()` repeatedly on that steady-state graph. Every `run()` asserts the
values it computed and how many times effects ran, so a broken graph throws rather than producing a timing. The table
shows median and min milliseconds per run, `ns/op` (median divided by the operations per run, to compare across
different graph sizes), and the median relative to Gable (`x gable`, below 1 means faster than Gable).

Effects are flushed with `flushSync()` from `@gable/core/internal` so the timing is the scheduler, not the microtask hop
(`batched-writes` also has a `gable (microtask)` variant that awaits `whenFlushed()`). The raw polyfill "effect" is a
single `Watcher` plus a flush that pulls `getPending()`; it has no ordering, scopes or error reporting, so it is the
floor for what Gable's `effect` adds.

## Scenarios

| Id | What it measures |
| --- | --- |
| `deep-chain` | 1000 chained computeds; write the source, read the leaf. (RxJS uses 250 levels: a 1000-deep synchronous `pipe` overflows a cold stack and RxJS silently drops the error.) |
| `wide-fanout` | One source feeding 1000 computeds that a single computed sums. RxJS uses `combineLatest`, which emits once per branch per write (glitches). |
| `diamond` | 10 layers of 2 nodes, each reading both nodes of the previous layer, joined at the leaf. Signals visit each node once; RxJS emits exponentially many intermediate values. |
| `dynamic-deps` | 1000 `cond ? x : y` reads. Writes to the unread branch must not recompute, flipping every condition swaps all dependencies. Asserts the recompute count. Signals only (RxJS would need `switchMap`, not a like-for-like). |
| `effects-shared` | One signal read by 10000 effects; write and flush. |
| `effects-sparse` | 10000 signals with one effect each; write 1% and flush: the cost of finding the dirty effects among many. |
| `batched-writes` | 1000 writes to one signal feeding a computed and an effect, then one flush. Signals run the effect once; an RxJS subscriber runs 1000 times. |
| `create-dispose` | Create 1000 effects on one signal, then dispose them (Gable scope disposal vs polyfill `unwatch` vs RxJS `unsubscribe`). |
| `toObservable-emit` | signal, `toObservable`, one subscriber; 1000 x (write, flush). Baseline: `BehaviorSubject.next`. |
| `toObservable-subscribers` | One `toObservable` with 1000 subscribers (each is its own effect); write, flush. |
| `toObservable-subscribe` | Subscribe and unsubscribe 1000 times (initial emission plus effect setup/teardown). |
| `toSignal-chain` | Subject, `toSignal`, 10 computeds; 1000 x (emit, read leaf). Baselines: `State.set`; RxJS 10-map pipe. |
| `toSignal-fan-in` | 1000 subjects through `toSignal` into a sum read by one effect; emit on all. Gable runs the effect once, RxJS `combineLatest` 1000 times. |
| `round-trip` | signal, `toObservable`, `map`, `toSignal`, computed; 1000 x (write, flush, read). |

## Reading the numbers

- Compare a row to the same scenario's `polyfill` row to see what Gable adds on top of the polyfill, and to its `rxjs`
  row to see push-based streams on the same task. Absolute times vary a lot by machine and Node version; the ratios
  and the `ns/op` column are the useful part. Expect run-to-run noise of tens of percent on the sub-millisecond rows.
- RxJS wins whenever the work is one synchronous push to a subscriber, because it does no dependency tracking. Signals
  win when the graph has shared nodes (diamonds, fan-in, batched writes) because RxJS recomputes per emission.
