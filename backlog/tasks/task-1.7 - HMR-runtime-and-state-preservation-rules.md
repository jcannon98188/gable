---
id: TASK-1.7
title: HMR runtime and state-preservation rules
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 05:28'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-1.2
  - TASK-1.4
  - TASK-1.5
  - TASK-1.12
parent_task_id: TASK-1
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What is the HMR runtime model: component registry and in-place swap, DI/service patching, the update protocol, which state survives, and when it falls back to re-creating a subtree? Never a full reload unless the entry module changes.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:46
---
From Template syntax: parsed templates are cached per call site (strings-array identity); a changed module yields new strings arrays, so HMR invalidates templates by identity.
---

created: 2026-11-05 05:06
---
From Renderer abstraction: HMR needs no special renderer view operation (core disposes the view scope and re-inserts the new template at the same anchor via insert/remove). Styles use registerStyles(componentId, css), replaceable in place by id. Preserving DOM-level state (focus, scroll, input text) across a template swap is yours to decide; v0 baseline is the DOM is rebuilt.
---

created: 2026-11-05 05:28
---
Resolved with the user.

**Identity**: the first-defined class stays canonical for its id (module URL + export name). A re-evaluated module's new prototype members, accessors, statics and `static meta` are copied onto it in place, so DI tokens, instanceof and importers that did not re-run keep working. Registry and live-instance tracking live in import.meta.hot.data.
**Boundaries**: every module exporting a registered component or service is a self-accepting boundary; registering marks it hot. Who writes import.meta.hot.accept is TASK-1.8's call. A plain utility module bubbles to its importers, which re-evaluate and swap. Only a change reaching the entry module is a full reload.
**No constructors**: component and service classes have no constructor. Setup is field initialisers only (signal, computed, input, output, model, inject, effect), so it is safe to re-run. The language service flags constructors. This amends the component model (no lifecycle, injection-context setup).
**Class change = re-setup with state transfer** (React's model without a compiler signature): methods and meta swap in place; for a changed class, build a new instance (fresh closures), transfer matching fields by name and kind (writable signals, model, plain data), new fields initialise, removed fields drop, dispose the old scope (effects, onDestroy), rebuild the view against the new instance. Computed fields and effect bodies pick up edits. Renamed field = value lost. `static hmr = 'reset'` forces fresh state. No probe instantiation.
**Services**: same rule, with a cascade. A changed service is re-set-up with state transfer, then every instance that injected it (edges recorded in the dev registry) is re-set-up the same way, up the graph. A rebuilt component's child injector is rebuilt and its provided services are re-created with state carried over, keyed by injector path and token. Untouched classes are never touched. Router state survives (route injectors rebuilt the same way). The signal API makes the set that needs rebinding easy to identify.
**Module-level state** (top-level signals, subjects) resets when its module is edited. Rule: long-lived state belongs in a service; the language service warns on top-level signals/subjects.
**Update protocol**: a Vite batch is one atomic transaction: re-evaluate and stage, classify (patch only, view rebuild, re-setup), apply in one scheduler flush parents before children so a view rebuilds at most once, roll back the whole transaction on failure. Style-only changes use registerStyles in place, no view rebuild.
**DOM state is in scope**: two optional renderer ops, captureViewState(rootNodes) -> token before a rebuild and restoreViewState(newRootNodes, token) after. DOM renderer saves focus, selection, scroll offsets and form-control values, matching by structural path in the view and only where the tag is unchanged; best-effort. Test and native renderers may omit them.
**Failure policy**: a module that throws or has a syntax error leaves the app untouched and reports to the overlay; a view rebuild failure retries as re-setup of that subtree, then rolls back to the previous definition; an unrecoverable state calls import.meta.hot.invalidate() (full reload).
**Production**: all HMR bookkeeping (registry, instance and injection tracking, id registration, runtime) is behind a dev-only gate; production output contains no HMR code and instance creation is unchanged.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
HMR model decided: canonical-class patching, re-setup with state transfer and service cascade, atomic transactions, optional renderer ops for DOM state, dev-only gating. See resolution comment.
<!-- SECTION:FINAL_SUMMARY:END -->
