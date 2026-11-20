---
kind: ticket
title: "TC39 Signals polyfill: maturity and gaps"
status: resolved
type: research
tags:
  - parent-1
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-1.1 - TC39-Signals-polyfill-maturity-and-gaps.md
ordinal: 2000
---

## Question

How mature is the TC39 Signals polyfill? Cover API stability, performance, effect/scheduling gaps (the proposal has no built-in effect), glitch-freedom, and what gable must build on top. Does anything here threaten fine-grained DOM updates or HMR state preservation?

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:23
---
Findings: branch research/tc39-signals-polyfill @ 772bfaa, file research/tc39-signals-polyfill.md. Proposal is Stage 1, polyfill says not for production (last release 0.2.2, Jan 2025). Glitch-free graph, but gable must build effect, owner-ordered scheduler and scope disposal; unwatch scales poorly and live edges are strong refs. No blocker for fine-grained DOM or HMR; keep the signals module a singleton outside the HMR graph. Wrap behind gable's own module and pin the version.
---
<!-- COMMENTS:END -->
