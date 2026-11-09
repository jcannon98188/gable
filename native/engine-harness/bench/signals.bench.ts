// Signal churn: a wide graph of signals and computeds, written and read
// back many times. Pure @gable/core, no renderer.
import { computed, signal, untracked } from "@gable/core";

const WIDTH = 200;
const DEPTH = 6;
const ROUNDS = 200;

function graph() {
  const sources = Array.from({ length: WIDTH }, (_, i) => signal(i));
  let layer = sources.map((s) => () => s());
  for (let d = 0; d < DEPTH; d++) {
    const prev = layer;
    // Each node reads two neighbours of the layer below: diamonds everywhere.
    layer = prev.map((_, i) => {
      const a = prev[i]!;
      const b = prev[(i + 1) % WIDTH]!;
      const c = computed(() => (a() + b()) % 1_000_003);
      return () => c();
    });
  }
  const top = layer;
  const sum = computed(() => top.reduce((acc, f) => acc + f(), 0));
  return { sources, sum };
}

export const benchmarks = {
  /** Write one source, read the whole graph's sum: 200 x 1200 nodes. */
  "signal-churn": {
    setup: () => graph(),
    run(state: ReturnType<typeof graph>) {
      let check = 0;
      for (let r = 0; r < ROUNDS; r++) {
        const s = state.sources[r % WIDTH]!;
        s.set(untracked(() => s()) + 1);
        check = (check + state.sum()) % 1_000_003;
      }
      return String(check);
    },
  },
  /** Create and drop many small graphs: allocation and GC of nodes. */
  "signal-create": {
    run() {
      let check = 0;
      for (let r = 0; r < 20; r++) {
        const a = signal(r);
        const cs = Array.from({ length: 500 }, (_, i) => computed(() => a() * i));
        a.set(r + 1);
        for (const c of cs) check = (check + c()) % 1_000_003;
      }
      return String(check);
    },
  },
};
