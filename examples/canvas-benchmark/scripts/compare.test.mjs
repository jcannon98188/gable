import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregate, compare } from "./compare.mjs";

const row = (style, n, rep, p50, extra = {}) => ({
  style,
  n,
  rep,
  errors: [],
  result: {
    hooksMs: { p50: p50.hooks ?? 1 },
    flushMs: { p50: p50.flush ?? 1 },
    renderMs: { p50: p50.render ?? 1 },
    jsTotalMs: { p50: (p50.hooks ?? 1) + (p50.flush ?? 1) + (p50.render ?? 1) },
  },
  ...extra,
});
const file = (...results) => ({ results });

test("aggregate takes the median p50 across repetitions", () => {
  const agg = aggregate(file(row("signals", 500, 0, { flush: 10 }), row("signals", 500, 1, { flush: 30 }), row("signals", 500, 2, { flush: 12 })));
  assert.equal(agg.get("signals/500").flushMs, 12);
});

test("a phase more than 15 percent worse than the baseline is a regression", () => {
  const base = file(row("signals", 500, 0, { flush: 10 }));
  const head = file(row("signals", 500, 0, { flush: 11.6 }));
  const { regressions } = compare(base, head);
  assert.equal(regressions.length, 1);
  assert.equal(regressions[0].phase, "flushMs");
  assert.equal(regressions[0].config, "signals/500");
});

test("a phase exactly at or under the threshold passes", () => {
  const base = file(row("signals", 500, 0, { flush: 10 }));
  assert.equal(compare(base, file(row("signals", 500, 0, { flush: 11.5 }))).regressions.length, 0);
  assert.equal(compare(base, file(row("signals", 500, 0, { flush: 5 }))).regressions.length, 0);
});

test("a tiny absolute change is noise, however large relatively", () => {
  const base = file(row("ref", 500, 0, { hooks: 0.02, flush: 0.02, render: 0.02 }));
  const head = file(row("ref", 500, 0, { hooks: 0.05, flush: 0.05, render: 0.05 }));
  assert.equal(compare(base, head).regressions.length, 0);
});

test("the threshold and the floor are configurable", () => {
  const base = file(row("ref", 500, 0, { flush: 10 }));
  const head = file(row("ref", 500, 0, { flush: 10.6 }));
  assert.equal(compare(base, head).regressions.length, 0);
  assert.equal(compare(base, head, { threshold: 0.05 }).regressions.length, 1);
  assert.equal(compare(base, head, { threshold: 0.05, floorMs: 1 }).regressions.length, 0);
});

test("a run that errored or timed out in the head fails the gate", () => {
  const base = file(row("signals", 500, 0, { flush: 10 }));
  const head = file({ style: "signals", n: 500, rep: 0, errors: ["timeout"], result: null });
  const out = compare(base, head);
  assert.equal(out.failures.length, 1);
});

test("configurations missing from the baseline are reported, not gated", () => {
  const out = compare(file(row("signals", 500, 0, {})), file(row("signals", 500, 0, {}), row("ref", 500, 0, {})));
  assert.equal(out.regressions.length, 0);
  assert.deepEqual(out.unmatched, ["ref/500"]);
});
