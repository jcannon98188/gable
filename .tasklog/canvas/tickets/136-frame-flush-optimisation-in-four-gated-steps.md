---
kind: ticket
title: Frame-flush optimisation in four gated steps
status: resolved
blocked_by: [138]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-13
imported_from: backlog/tasks/task-105.17 - Frame-flush-optimisation-in-four-gated-steps.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 255000
---

## Question

canvas/119: the effect flush dominates frame cost at 5,000 entities (about 36% of samples in signal-polyfill internals; __privateIn alone 9.8%). Work in order, each step gated by a fresh profile, behaviour-preserving and with existing tests unchanged: (1) find why __privateIn appears and fix the build target if #x in obj is lowered unnecessarily, (2) cut flush overhead in Gable's own code (byDepthThenCreation, flushNow, evaluate, binding apply), (3) improve signal-polyfill notify and poll paths only if still dominant (upstream patch first, vendored copy last), (4) consider coalescing a node's bindings into one effect only after that.

## Acceptance criteria

- [x] #1 Each step is profiled before and after and kept only if it measurably helps
- [x] #2 Flush time at 5,000 entities in the three-signal style drops by at least 30 percent overall, or the shortfall is explained with profile data
- [x] #3 All existing tests pass unchanged

## Answer

Flush time at 5,000 entities, three-signal style: 22.2 ms -> 15.9 ms p50 (-28%). The 30% target was missed by about 2 points; the shortfall is explained with profile data in docs/research/frame-flush-optimisation.md.

- Step 1 (`__privateIn`): the helper comes from the published signal-polyfill dist, not Gable's build. A one-line `target: 'es2022'` in the upstream signal-polyfill vite config measured -6.5% and would reach the 30% target, but it is NOT applied. Project decision needed: vendor the patched polyfill or wait for upstream.
- Step 2: Gable-side flush overhead cuts kept (core signals/view/expression/scope/read-phase, renderer-pixi renderer).
- Step 4 (one effect per node): not kept, not behaviour-preserving.
- Open: `shared` style hooks phase is 9.3 vs 8.6 ms, unexplained.

Verification after merging into integration/canvas-binding: rebuilt core, testing, renderer-pixi, language-service; vitest on core, renderer-pixi, testing, language-service: 963 passed, 2 skipped, 0 failed. Local canvas benchmark gate (previous integration head vs this, 5 reps, software GL, busy machine): flush -23% (signals/5000) and -31% (shared/5000), jsTotal down in every 5000 config, but the gate FAILED on renderMs at 5000 (signals 1.8->2.1 ms, shared 1.7->2.3 ms; sub-ms values). Possibly noise (a 3-rep run flagged different sub-ms phases), possibly a real small render-phase cost; should be re-checked on CI hardware.

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T22:28:00Z

---

Finding while ticketing: step 1 as written is wrong. Gable's own target is already ES2022 (tsconfig.base.json, @gable/vite oxc target es2022), which supports #x in obj natively. The __privateIn helper (9.8% of samples) is baked into signal-polyfill 0.2.2's published dist/index.js (an esbuild-lowered build): State.get/set and Computed.get each run isState/isComputed/isWatcher brand checks through it (dist/index.js lines 11-14, 387-570). Step 1 therefore becomes a polyfill-level change, so it sits under step 3's rule: upstream patch first, vendored patched copy only if upstream cannot ship it. Next measurement: run docs/research/frame-cost-model (branch research/frame-cost-model) with dist/index.js patched so the brand check is member.has(obj) without the Object(obj) test, compare against baseline; queued behind the machine-wide heavy job lock.

---
<!-- COMMENTS:END -->
