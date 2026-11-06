// Scenarios in the style of milomg/js-reactivity-benchmark, run on Gable (`gable`), the raw TC39 polyfill
// (`polyfill`) and RxJS (`rxjs`) where the comparison is natural. Every run asserts its result, so a broken graph
// can never produce a timing.
import { Signal } from "signal-polyfill";
import { BehaviorSubject, Subject, combineLatest, map } from "rxjs";
import { signal, computed, effect } from "@gable/core";
import { createScope, runInScope, flushSync, whenFlushed } from "@gable/core/internal";
import { toObservable, toSignal } from "@gable/core/rxjs";
import { assert } from "./harness.mjs";

// --- helpers ----------------------------------------------------------------------------------

/** A Gable scope that owns everything created through `own`. */
function gableScope() {
  const scope = createScope(null);
  return { own: (fn) => runInScope(scope, fn), dispose: () => scope.dispose() };
}

/** Effects over the raw polyfill: one Watcher, flushed by pulling the pending computeds (no ordering, no scopes). */
function rawEffects() {
  const watcher = new Signal.subtle.Watcher(() => {});
  const nodes = [];
  return {
    effect(fn) {
      const node = new Signal.Computed(fn);
      node.get();
      watcher.watch(node);
      nodes.push(node);
    },
    flush() {
      for (const node of watcher.getPending()) node.get();
      watcher.watch();
    },
    dispose() {
      for (const node of nodes) watcher.unwatch(node);
    },
  };
}

const listen = (observable, fn) => observable.subscribe({ next: fn });

export function scenarios(scale) {
  const n = (base) => Math.max(4, Math.round(base * scale));
  const DEPTH = n(1000);
  const WIDTH = n(1000);
  const LAYERS = scale < 0.5 ? 6 : 10;
  const EFFECTS = n(10000);
  const WRITES = n(1000);
  const REPS = 10;
  // RxJS propagates synchronously through nested subscribers; a 1000-deep pipe overflows a cold stack (and RxJS then
  // swallows the RangeError), so its chain is shorter. The ns/op column normalises per node.
  const RX_DEPTH = Math.min(DEPTH, 250);

  // --- 1. deep chain: src -> c1 -> c2 ... -> cN, write the source, read the leaf -------------
  const deepChain = {
    id: "deep-chain",
    title: `chain of ${DEPTH} computeds (RxJS: ${RX_DEPTH}, see README); ${REPS} x (write source, read leaf)`,
    ops: REPS * DEPTH,
    variants: {
      gable: {
        setup() {
          const src = signal(0);
          let prev = src;
          for (let i = 0; i < DEPTH; i++) { const p = prev; prev = computed(() => p() + 1); }
          const leaf = prev;
          let v = 0;
          return { run() { for (let r = 0; r < REPS; r++) { src.set(++v); assert(leaf() === v + DEPTH, "deep leaf"); } } };
        },
      },
      polyfill: {
        setup() {
          const src = new Signal.State(0);
          let prev = src;
          for (let i = 0; i < DEPTH; i++) { const p = prev; prev = new Signal.Computed(() => p.get() + 1); }
          const leaf = prev;
          let v = 0;
          return { run() { for (let r = 0; r < REPS; r++) { src.set(++v); assert(leaf.get() === v + DEPTH, "deep leaf"); } } };
        },
      },
      rxjs: {
        ops: REPS * RX_DEPTH,
        setup() {
          const src = new BehaviorSubject(0);
          let o = src;
          for (let i = 0; i < RX_DEPTH; i++) o = o.pipe(map((x) => x + 1));
          let last = -1;
          const sub = listen(o, (x) => (last = x));
          let v = 0;
          return { run() { for (let r = 0; r < REPS; r++) { src.next(++v); assert(last === v + RX_DEPTH, "deep leaf"); } }, dispose: () => sub.unsubscribe() };
        },
      },
    },
  };

  // --- 2. wide fan-out: src -> N computeds -> one sum --------------------------------------------
  const sumOf = (v) => WIDTH * v + (WIDTH * (WIDTH - 1)) / 2;
  const wide = {
    id: "wide-fanout",
    title: `1 source -> ${WIDTH} computeds -> sum; ${REPS} x (write, read sum). RxJS combineLatest emits ${WIDTH}x per write (glitches)`,
    ops: REPS * WIDTH,
    variants: {
      gable: {
        setup() {
          const src = signal(0);
          const mids = Array.from({ length: WIDTH }, (_, i) => computed(() => src() + i));
          const sum = computed(() => { let s = 0; for (const m of mids) s += m(); return s; });
          let v = 0;
          return { run() { for (let r = 0; r < REPS; r++) { src.set(++v); assert(sum() === sumOf(v), "wide sum"); } } };
        },
      },
      polyfill: {
        setup() {
          const src = new Signal.State(0);
          const mids = Array.from({ length: WIDTH }, (_, i) => new Signal.Computed(() => src.get() + i));
          const sum = new Signal.Computed(() => { let s = 0; for (const m of mids) s += m.get(); return s; });
          let v = 0;
          return { run() { for (let r = 0; r < REPS; r++) { src.set(++v); assert(sum.get() === sumOf(v), "wide sum"); } } };
        },
      },
      rxjs: {
        setup() {
          const src = new BehaviorSubject(0);
          const mids = Array.from({ length: WIDTH }, (_, i) => src.pipe(map((x) => x + i)));
          let last = -1;
          const sub = listen(combineLatest(mids).pipe(map((xs) => { let s = 0; for (const x of xs) s += x; return s; })), (x) => (last = x));
          let v = 0;
          return { run() { for (let r = 0; r < REPS; r++) { src.next(++v); assert(last === sumOf(v), "wide sum"); } }, dispose: () => sub.unsubscribe() };
        },
      },
    },
  };

  // --- 3. diamonds: LAYERS layers of 2 nodes, each reading both nodes of the previous layer ---
  const refDiamond = (v) => {
    let a = v, b = v;
    for (let l = 0; l < LAYERS; l++) [a, b] = [a + b, a - b];
    return a + b;
  };
  const diamond = {
    id: "diamond",
    title: `${LAYERS} layers x 2 nodes, each reading both previous nodes, joined at the leaf; RxJS glitches grow as 2^${LAYERS}`,
    ops: REPS * LAYERS * 2,
    variants: {
      gable: {
        setup() {
          const src = signal(0);
          let a = src, b = src;
          for (let l = 0; l < LAYERS; l++) { const [pa, pb] = [a, b]; a = computed(() => pa() + pb()); b = computed(() => pa() - pb()); }
          const [la, lb] = [a, b];
          const leaf = computed(() => la() + lb());
          let v = 0;
          return { run() { for (let r = 0; r < REPS; r++) { src.set(++v); assert(leaf() === refDiamond(v), "diamond"); } } };
        },
      },
      polyfill: {
        setup() {
          const src = new Signal.State(0);
          let a = src, b = src;
          for (let l = 0; l < LAYERS; l++) { const [pa, pb] = [a, b]; a = new Signal.Computed(() => pa.get() + pb.get()); b = new Signal.Computed(() => pa.get() - pb.get()); }
          const [la, lb] = [a, b];
          const leaf = new Signal.Computed(() => la.get() + lb.get());
          let v = 0;
          return { run() { for (let r = 0; r < REPS; r++) { src.set(++v); assert(leaf.get() === refDiamond(v), "diamond"); } } };
        },
      },
      rxjs: {
        setup() {
          // Each node is a BehaviorSubject fed by combineLatest of its two parents, so it is shared like a signal.
          const src = new BehaviorSubject(0);
          const subs = [];
          let a = src, b = src;
          for (let l = 0; l < LAYERS; l++) {
            const [pa, pb] = [a, b];
            const na = new BehaviorSubject(0), nb = new BehaviorSubject(0);
            subs.push(combineLatest([pa, pb]).subscribe(([x, y]) => na.next(x + y)));
            subs.push(combineLatest([pa, pb]).subscribe(([x, y]) => nb.next(x - y)));
            [a, b] = [na, nb];
          }
          let last = NaN;
          subs.push(combineLatest([a, b]).subscribe(([x, y]) => (last = x + y)));
          let v = 0;
          return { run() { for (let r = 0; r < REPS; r++) { src.next(++v); assert(last === refDiamond(v), "diamond"); } }, dispose: () => subs.forEach((s) => s.unsubscribe()) };
        },
      },
    },
  };

  // --- 4. dynamic dependencies: sum of (cond_i ? x_i : y_i) -----------------------------------------
  // Per run: (1) write every inactive source (must not recompute), (2) flip every condition (full dependency swap),
  // (3) write every now-active source.
  function dynamicVariant({ newState, newComputed, get, set }) {
    return {
      setup() {
        const conds = [], xs = [], ys = [];
        for (let i = 0; i < WIDTH; i++) { conds.push(newState(true)); xs.push(newState(1)); ys.push(newState(2)); }
        let evals = 0;
        const total = newComputed(() => {
          evals++;
          let s = 0;
          for (let i = 0; i < WIDTH; i++) s += get(conds[i]) ? get(xs[i]) : get(ys[i]);
          return s;
        });
        get(total);
        let active = true; // true: x side is read
        let v = 10;
        return {
          run() {
            const before = evals;
            // 1. write the inactive side: nothing the total read changed
            v++;
            for (let i = 0; i < WIDTH; i++) set(active ? ys[i] : xs[i], v);
            get(total);
            assert(evals === before, "writes to untracked branches must not recompute");
            // 2. flip all conditions: the side just written (value v) becomes the one read
            active = !active;
            for (let i = 0; i < WIDTH; i++) set(conds[i], active);
            assert(get(total) === WIDTH * v, "after flip");
            // 3. write the now-active side
            v++;
            for (let i = 0; i < WIDTH; i++) set(active ? xs[i] : ys[i], v);
            assert(get(total) === WIDTH * v, "after active write");
            assert(evals === before + 2, "exactly two recomputes");
          },
        };
      },
    };
  }
  const dynamic = {
    id: "dynamic-deps",
    title: `${WIDTH} conditional reads (cond ? x : y); write inactive branches, flip all, write active; asserts no stale recompute`,
    ops: 3 * WIDTH,
    variants: {
      gable: dynamicVariant({ newState: (v) => signal(v), newComputed: (f) => computed(f), get: (s) => s(), set: (s, v) => s.set(v) }),
      polyfill: dynamicVariant({ newState: (v) => new Signal.State(v), newComputed: (f) => new Signal.Computed(f), get: (s) => s.get(), set: (s, v) => s.set(v) }),
    },
  };

  // --- 5. many effects ------------------------------------------------------------------------------
  const effectsShared = {
    id: "effects-shared",
    title: `1 signal read by ${EFFECTS} effects; write, flush`,
    ops: EFFECTS,
    variants: {
      gable: {
        setup() {
          const src = signal(0), g = gableScope();
          let runs = 0;
          g.own(() => { for (let i = 0; i < EFFECTS; i++) effect(() => { src(); runs++; }); });
          let v = 0;
          return { run() { const b = runs; src.set(++v); flushSync(); assert(runs - b === EFFECTS, "shared effects ran"); }, dispose: g.dispose };
        },
      },
      polyfill: {
        setup() {
          const src = new Signal.State(0), e = rawEffects();
          let runs = 0;
          for (let i = 0; i < EFFECTS; i++) e.effect(() => { src.get(); runs++; });
          let v = 0;
          return { run() { const b = runs; src.set(++v); e.flush(); assert(runs - b === EFFECTS, "shared effects ran"); }, dispose: e.dispose };
        },
      },
      rxjs: {
        setup() {
          const src = new BehaviorSubject(0);
          let runs = 0;
          const subs = Array.from({ length: EFFECTS }, () => listen(src, () => runs++));
          let v = 0;
          return { run() { const b = runs; src.next(++v); assert(runs - b === EFFECTS, "shared subscribers ran"); }, dispose: () => subs.forEach((s) => s.unsubscribe()) };
        },
      },
    },
  };
  const SPARSE = Math.max(1, Math.floor(EFFECTS / 100));
  const pick = (at) => (at * 97) % EFFECTS; // 97 is coprime with 10000, so picks do not repeat within a run
  const effectsSparse = {
    id: "effects-sparse",
    title: `${EFFECTS} signals, one effect each; write ${SPARSE} of them (1%), flush`,
    ops: SPARSE,
    variants: {
      gable: {
        setup() {
          const sigs = Array.from({ length: EFFECTS }, () => signal(0)), g = gableScope();
          let runs = 0;
          g.own(() => { for (const s of sigs) effect(() => { s(); runs++; }); });
          let v = 0, at = 0;
          return { run() { const b = runs; v++; for (let i = 0; i < SPARSE; i++) sigs[pick(at++)].set(v); flushSync(); assert(runs - b === SPARSE, "sparse effects ran"); }, dispose: g.dispose };
        },
      },
      polyfill: {
        setup() {
          const sigs = Array.from({ length: EFFECTS }, () => new Signal.State(0)), e = rawEffects();
          let runs = 0;
          for (const s of sigs) e.effect(() => { s.get(); runs++; });
          let v = 0, at = 0;
          return { run() { const b = runs; v++; for (let i = 0; i < SPARSE; i++) sigs[pick(at++)].set(v); e.flush(); assert(runs - b === SPARSE, "sparse effects ran"); }, dispose: e.dispose };
        },
      },
      rxjs: {
        setup() {
          const subjects = Array.from({ length: EFFECTS }, () => new BehaviorSubject(0));
          let runs = 0;
          const subs = subjects.map((s) => listen(s, () => runs++));
          let v = 0, at = 0;
          return { run() { const b = runs; v++; for (let i = 0; i < SPARSE; i++) subjects[pick(at++)].next(v); assert(runs - b === SPARSE, "sparse subscribers ran"); }, dispose: () => subs.forEach((s) => s.unsubscribe()) };
        },
      },
    },
  };

  // --- 6. repeated writes, batched flush --------------------------------------------------------------
  const batched = {
    id: "batched-writes",
    title: `${WRITES} writes to one signal feeding computed -> effect, then one flush (Gable/polyfill: 1 effect run; RxJS: ${WRITES})`,
    ops: WRITES,
    variants: {
      gable: {
        setup() {
          const src = signal(0), g = gableScope();
          let runs = 0, seen = -1;
          g.own(() => { const d = computed(() => src() * 2); effect(() => { seen = d(); runs++; }); });
          let v = 0;
          return { run() { const b = runs; for (let i = 0; i < WRITES; i++) src.set(++v); flushSync(); assert(runs - b === 1 && seen === v * 2, "batched effect"); }, dispose: g.dispose };
        },
      },
      "gable (microtask)": {
        setup() {
          const src = signal(0), g = gableScope();
          let runs = 0, seen = -1;
          g.own(() => { const d = computed(() => src() * 2); effect(() => { seen = d(); runs++; }); });
          let v = 0;
          return { async run() { const b = runs; for (let i = 0; i < WRITES; i++) src.set(++v); await whenFlushed(); assert(runs - b === 1 && seen === v * 2, "batched effect"); }, dispose: g.dispose };
        },
      },
      polyfill: {
        setup() {
          const src = new Signal.State(0), e = rawEffects();
          let runs = 0, seen = -1;
          const d = new Signal.Computed(() => src.get() * 2);
          e.effect(() => { seen = d.get(); runs++; });
          let v = 0;
          return { run() { const b = runs; for (let i = 0; i < WRITES; i++) src.set(++v); e.flush(); assert(runs - b === 1 && seen === v * 2, "batched effect"); }, dispose: e.dispose };
        },
      },
      rxjs: {
        setup() {
          const src = new BehaviorSubject(0);
          let runs = 0, seen = -1;
          const sub = listen(src.pipe(map((x) => x * 2)), (x) => { seen = x; runs++; });
          let v = 0;
          return { run() { const b = runs; for (let i = 0; i < WRITES; i++) src.next(++v); assert(runs - b === WRITES && seen === v * 2, "unbatched subscriber"); }, dispose: () => sub.unsubscribe() };
        },
      },
    },
  };

  // --- 7. create / dispose ------------------------------------------------------------------------------
  const CHURN = n(1000);
  const churn = {
    id: "create-dispose",
    title: `create ${CHURN} effects reading one signal, then dispose them`,
    ops: CHURN,
    variants: {
      gable: {
        setup() {
          const src = signal(1);
          return { run() { const g = gableScope(); let runs = 0; g.own(() => { for (let i = 0; i < CHURN; i++) effect(() => { runs += src(); }); }); g.dispose(); assert(runs === CHURN, "created"); } };
        },
      },
      polyfill: {
        setup() {
          const src = new Signal.State(1);
          return { run() { const e = rawEffects(); let runs = 0; for (let i = 0; i < CHURN; i++) e.effect(() => { runs += src.get(); }); e.dispose(); assert(runs === CHURN, "created"); } };
        },
      },
      rxjs: {
        setup() {
          const src = new BehaviorSubject(1);
          return { run() { let runs = 0; const subs = []; for (let i = 0; i < CHURN; i++) subs.push(listen(src, (x) => { runs += x; })); subs.forEach((s) => s.unsubscribe()); assert(runs === CHURN, "created"); } };
        },
      },
    },
  };

  // --- 8. toObservable ------------------------------------------------------------------------------------
  const toObsEmit = {
    id: "toObservable-emit",
    title: `signal -> toObservable -> 1 subscriber; ${WRITES} x (write, flush); each flush emits once`,
    ops: WRITES,
    variants: {
      gable: {
        setup() {
          const src = signal(0), g = gableScope();
          let count = 0, last = -1;
          const sub = g.own(() => toObservable(src)).subscribe((x) => { count++; last = x; });
          let v = 0;
          return { run() { const b = count; for (let i = 0; i < WRITES; i++) { src.set(++v); flushSync(); } assert(count - b === WRITES && last === v, "toObservable emissions"); }, dispose() { sub.unsubscribe(); g.dispose(); } };
        },
      },
      "rxjs (BehaviorSubject)": {
        setup() {
          const src = new BehaviorSubject(0);
          let count = 0, last = -1;
          const sub = src.subscribe((x) => { count++; last = x; });
          let v = 0;
          return { run() { const b = count; for (let i = 0; i < WRITES; i++) src.next(++v); assert(count - b === WRITES && last === v, "emissions"); }, dispose: () => sub.unsubscribe() };
        },
      },
    },
  };
  const SUBS = n(1000);
  const toObsMany = {
    id: "toObservable-subscribers",
    title: `1 toObservable() with ${SUBS} subscribers (an effect each); write, flush`,
    ops: SUBS,
    variants: {
      gable: {
        setup() {
          const src = signal(0), g = gableScope();
          let count = 0;
          const obs = g.own(() => toObservable(src));
          const subs = Array.from({ length: SUBS }, () => obs.subscribe(() => count++));
          let v = 0;
          return { run() { const b = count; src.set(++v); flushSync(); assert(count - b === SUBS, "all subscribers notified"); }, dispose() { subs.forEach((s) => s.unsubscribe()); g.dispose(); } };
        },
      },
      "rxjs (BehaviorSubject)": {
        setup() {
          const src = new BehaviorSubject(0);
          let count = 0;
          const subs = Array.from({ length: SUBS }, () => src.subscribe(() => count++));
          let v = 0;
          return { run() { const b = count; src.next(++v); assert(count - b === SUBS, "all notified"); }, dispose: () => subs.forEach((s) => s.unsubscribe()) };
        },
      },
    },
  };
  const toObsChurn = {
    id: "toObservable-subscribe",
    title: `subscribe + unsubscribe ${SUBS} times to a toObservable()`,
    ops: SUBS,
    variants: {
      gable: {
        setup() {
          const src = signal(0), g = gableScope();
          const obs = g.own(() => toObservable(src));
          return { run() { let count = 0; for (let i = 0; i < SUBS; i++) obs.subscribe(() => count++).unsubscribe(); assert(count === SUBS, "initial emissions"); }, dispose: g.dispose };
        },
      },
      "rxjs (BehaviorSubject)": {
        setup() {
          const src = new BehaviorSubject(0);
          return { run() { let count = 0; for (let i = 0; i < SUBS; i++) src.subscribe(() => count++).unsubscribe(); assert(count === SUBS, "initial emissions"); } };
        },
      },
    },
  };

  // --- 9. toSignal ----------------------------------------------------------------------------------------
  const toSigChain = {
    id: "toSignal-chain",
    title: `subject -> toSignal -> 10 computeds; ${WRITES} x (emit, read leaf). Baselines: State.set; BehaviorSubject piped through 10 maps`,
    ops: WRITES,
    variants: {
      gable: {
        setup() {
          const subject = new BehaviorSubject(0), g = gableScope();
          let leaf;
          g.own(() => { let prev = toSignal(subject, { initialValue: 0 }); for (let i = 0; i < 10; i++) { const p = prev; prev = computed(() => p() + 1); } leaf = prev; });
          let v = 0;
          return { run() { for (let i = 0; i < WRITES; i++) { subject.next(++v); assert(leaf() === v + 10, "toSignal leaf"); } }, dispose: g.dispose };
        },
      },
      polyfill: {
        setup() {
          const src = new Signal.State(0);
          let prev = src;
          for (let i = 0; i < 10; i++) { const p = prev; prev = new Signal.Computed(() => p.get() + 1); }
          const leaf = prev;
          let v = 0;
          return { run() { for (let i = 0; i < WRITES; i++) { src.set(++v); assert(leaf.get() === v + 10, "leaf"); } } };
        },
      },
      rxjs: {
        setup() {
          const subject = new BehaviorSubject(0);
          let o = subject;
          for (let i = 0; i < 10; i++) o = o.pipe(map((x) => x + 1));
          let last = -1;
          const sub = listen(o, (x) => (last = x));
          let v = 0;
          return { run() { for (let i = 0; i < WRITES; i++) { subject.next(++v); assert(last === v + 10, "leaf"); } }, dispose: () => sub.unsubscribe() };
        },
      },
    },
  };
  const FAN = n(1000);
  const toSigFanIn = {
    id: "toSignal-fan-in",
    title: `${FAN} subjects -> ${FAN} toSignals -> sum -> 1 effect; emit on all, flush (Gable: 1 effect run; RxJS combineLatest: ${FAN})`,
    ops: FAN,
    variants: {
      gable: {
        setup() {
          const subjects = Array.from({ length: FAN }, () => new Subject()), g = gableScope();
          let runs = 0, total = -1;
          g.own(() => {
            const sigs = subjects.map((s) => toSignal(s, { initialValue: 0 }));
            const sum = computed(() => { let t = 0; for (const s of sigs) t += s(); return t; });
            effect(() => { total = sum(); runs++; });
          });
          let v = 0;
          return { run() { const b = runs; v++; for (const s of subjects) s.next(v); flushSync(); assert(runs - b === 1 && total === FAN * v, "fan-in effect"); }, dispose: g.dispose };
        },
      },
      rxjs: {
        setup() {
          const subjects = Array.from({ length: FAN }, () => new BehaviorSubject(0));
          let runs = 0, total = -1;
          const sub = listen(combineLatest(subjects).pipe(map((xs) => { let t = 0; for (const x of xs) t += x; return t; })), (t) => { total = t; runs++; });
          let v = 0;
          return { run() { const b = runs; v++; for (const s of subjects) s.next(v); assert(runs - b === FAN && total === FAN * v, "combineLatest"); }, dispose: () => sub.unsubscribe() };
        },
      },
    },
  };
  const roundTrip = {
    id: "round-trip",
    title: `signal -> toObservable -> map -> toSignal -> computed; ${WRITES} x (write, flush, read)`,
    ops: WRITES,
    variants: {
      gable: {
        setup() {
          const src = signal(0), g = gableScope();
          let leaf;
          g.own(() => { const back = toSignal(toObservable(src).pipe(map((x) => x + 1)), { initialValue: 0 }); leaf = computed(() => back() * 2); });
          let v = 0;
          return { run() { for (let i = 0; i < WRITES; i++) { src.set(++v); flushSync(); assert(leaf() === (v + 1) * 2, "round trip"); } }, dispose: g.dispose };
        },
      },
      rxjs: {
        setup() {
          const subject = new BehaviorSubject(0);
          let last = -1;
          const sub = listen(subject.pipe(map((x) => x + 1), map((x) => x * 2)), (x) => (last = x));
          let v = 0;
          return { run() { for (let i = 0; i < WRITES; i++) { subject.next(++v); assert(last === (v + 1) * 2, "round trip"); } }, dispose: () => sub.unsubscribe() };
        },
      },
    },
  };

  return [deepChain, wide, diamond, dynamic, effectsShared, effectsSparse, batched, churn, toObsEmit, toObsMany, toObsChurn, toSigChain, toSigFanIn, roundTrip];
}
