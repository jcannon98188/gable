---
id: TASK-1.9
title: 'HMR spike: swap a component and keep signal state'
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 06:53'
labels:
  - 'wayfinder:prototype'
dependencies:
  - TASK-1.2
  - TASK-1.5
parent_task_id: TASK-1
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Prototype a minimal component swap that preserves signal state, to test whether the HMR model feels and behaves right before it is locked.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 05:28
---
From HMR runtime: the spike should validate re-setup with state transfer (new instance, fields transferred by name/kind, old scope disposed, view rebuilt), canonical-class patching, and the service cascade; also that computed and effect edits take effect and a template swap keeps signal state.
---

created: 2026-11-05 05:38
---
From Dev server and bundler: the spike should run on Vite with the @gable/vite plugin appending import.meta.hot?.accept(m => __gableHmr.update(import.meta.url, m)) to modules importing gable; ids come from the module namespace (module URL + export name).
---

created: 2026-11-05 06:53
---
Resolved with the user. Prototype: branch prototype/hmr-spike (pushed, never merged), file prototypes/hmr-spike/hmr-spike.html, a single-file logic demo of the HMR runtime model on made-up Counter/Cart/Badge classes (simulation, not a real Vite run).

Verdict: the model from HMR runtime and state-preservation rules behaves as intended; the user agreed with every behaviour probed. Confirmed: (1) template-only edit rebuilds the view on the same instance, state kept; (2) computed/field edit re-sets-up on a new instance with matching fields transferred by name and kind, computed picks up the edit; (3) method-only edit patches in place, live instance uses the new body; (4) rename loses the value (new field initialises, renaming back does not recover it), accepted cost of no compiler signature; (5) same name but changed kind is not transferred, accepted; (6) service edit cascades to every injector (both Badges) with its own state kept, unrelated Counter untouched; (7) one save touching a service and its dependent rebuilds the dependent once; (8) a failing module rolls back the whole transaction with nothing changed; (9) static hmr='reset' skips transfer. No rule changes needed. Not validated: a real Vite run with @gable/vite, real signals polyfill, DOM state capture/restore.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Prototype confirmed the HMR runtime model; user agreed with all probed behaviours, no spec changes. Verified by headless run of all 9 walkthroughs plus user click-through.
<!-- SECTION:FINAL_SUMMARY:END -->
