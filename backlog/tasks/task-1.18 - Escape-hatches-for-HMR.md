---
id: TASK-1.18
title: Escape hatches for HMR
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 06:13'
updated_date: '2026-11-05 06:48'
labels:
  - 'wayfinder:grilling'
dependencies: []
parent_task_id: TASK-1
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Beyond `static hmr = 'reset'`, what opt-out and override controls exist for hot updates: reload/skip pragmas per module or class, a `hotState` helper that lets module-level state survive an edit, and how each is declared, documented and flagged by the language service?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 06:48
---
Resolved with the user.

**Class modes**: `static hmr = 'reset' | 'reload' | 'ignore'`. Default is re-setup with state transfer. `reset` = fresh instance, no transfer; `reload` = an edit to the class calls import.meta.hot.invalidate() (full reload; for classes with external side effects such as sockets, workers, third-party widgets); `ignore` = hot updates skipped, old definition stays until manual reload.
**Module pragma**: `export const hmr = 'reset' | 'reload' | 'ignore'` read from the module namespace (no comment pragmas, no parsing). Applies to every class/service in the module; a class-level `static hmr` overrides it.
**hotState**: `hotState(import.meta, 'key', () => signal(0))` returns the stored value (same identity, subscribers kept) if present, else runs the initialiser. Store is the dev registry keyed by module id (query stripped) + key. Production: plain `init()`, no registry. Old value wins when the initialiser is edited; `{ reset: true }` option or renaming the key discards it. No disposal hook in v0 (long-lived resources are the author's responsibility).
**Language service**: error on invalid `hmr` value; the top-level signal/subject warning is suppressed when wrapped in `hotState`; hint when `hotState` is used outside module scope; no diagnostics for the opt-outs; one HMR docs page that diagnostics link to.
**Global switch**: none in v0; Vite's `server.hmr: false` covers it (documented).
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Escape hatches decided: class and module hmr modes (reset/reload/ignore), hotState helper for module-level state, language-service rules, no global switch.
<!-- SECTION:FINAL_SUMMARY:END -->
