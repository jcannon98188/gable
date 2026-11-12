---
id: TASK-105.17
title: Frame-flush optimisation in four gated steps
status: To Do
assignee: []
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T22:28:00Z'
labels: []
dependencies:
  - TASK-105.19
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 255000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.14: the effect flush dominates frame cost at 5,000 entities (about 36% of samples in signal-polyfill internals; __privateIn alone 9.8%). Work in order, each step gated by a fresh profile, behaviour-preserving and with existing tests unchanged: (1) find why __privateIn appears and fix the build target if #x in obj is lowered unnecessarily, (2) cut flush overhead in Gable's own code (byDepthThenCreation, flushNow, evaluate, binding apply), (3) improve signal-polyfill notify and poll paths only if still dominant (upstream patch first, vendored copy last), (4) consider coalescing a node's bindings into one effect only after that.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each step is profiled before and after and kept only if it measurably helps
- [ ] #2 Flush time at 5,000 entities in the three-signal style drops by at least 30 percent overall, or the shortfall is explained with profile data
- [ ] #3 All existing tests pass unchanged
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T22:28:00Z

---

Finding while ticketing: step 1 as written is wrong. Gable's own target is already ES2022 (tsconfig.base.json, @gable/vite oxc target es2022), which supports #x in obj natively. The __privateIn helper (9.8% of samples) is baked into signal-polyfill 0.2.2's published dist/index.js (an esbuild-lowered build): State.get/set and Computed.get each run isState/isComputed/isWatcher brand checks through it (dist/index.js lines 11-14, 387-570). Step 1 therefore becomes a polyfill-level change, so it sits under step 3's rule: upstream patch first, vendored patched copy only if upstream cannot ship it. Next measurement: run docs/research/frame-cost-model (branch research/frame-cost-model) with dist/index.js patched so the brand check is member.has(obj) without the Object(obj) test, compare against baseline; queued behind the machine-wide heavy job lock.

---
<!-- COMMENTS:END -->
