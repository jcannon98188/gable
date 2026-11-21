---
kind: ticket
title: "Build the Gable canvas binding (@gablejs/renderer-pixi)"
status: resolved
created: 2026-11-12
updated: 2026-11-13
imported_from: backlog/tasks/task-105 - Build-the-Gable-canvas-binding-gable-renderer-pixi.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 238000
---

## Question

Build task tree for the decisions of the Gable Canvas design map (canvas/104): a declarative Pixi 8 binding for signal-driven 2D games. Phase A is the core path, Phase B the items earlier tickets deferred, and further tickets cover HMR, performance and release measurements. Release gate: nothing ships until every child is Done (canvas/117). Prototype and measurements: branch prototype/pixi-renderer-spike, docs/research/pixi-renderer-spike.md.

## Acceptance criteria

- [x] #1 Every child task is Done (the hardware and OS measurement ticket was dropped)

## Answer

All 21 build tickets are Done and merged on integration/canvas-binding (105.21, hardware measurement, dropped). Code review (Standards + Spec) was run and its findings fixed in one pass (impl/fix-review): lazy pixi, per-timer raw-timer warning, a11y activation, lint narrowing, frame-loop error isolation, custom tags in the language service, ?family typing, keyed orphan adoption, loud scene test failures, changeset, glossary, ADR 0021. Known open items: (1) 105.14 goldens are not committed; bootstrap the golden-images CI job via workflow_dispatch update_goldens (its AC #1 stays unchecked). (2) Projected content under <gable-canvas> cannot inject boundary services (ADR 0019 as written); scene components belong in a host component's own template; amend the ADR if that is not wanted. (3) 105.17 reached -28% flush time vs the 30% target; the __privateIn signal-polyfill fix (-6.5%, not applied) would reach it; vendor vs wait upstream is undecided. (4) CI jobs (benchmark gate, browser smoke, golden-images) have never run on GitHub. (5) Reference-machine GPU numbers must be recorded manually. (6) Core changes beyond the original five are recorded in ADR 0021.
