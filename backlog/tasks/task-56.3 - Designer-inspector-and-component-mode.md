---
id: TASK-56.3
title: 'Designer: inspector and component mode'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T03:57:00Z'
updated_date: '2026-11-07T05:01:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.1
parent_task_id: TASK-56
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Developers get value from the designer before any editing exists, and component mode (Storybook-style) needs the same agent. Scenarios let states like empty, loading and error be seen without a backend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Shell shows the component tree, injector tree with the Providers behind each Token, and live signal values
- [x] #2 Component mode mounts a single component in isolation with inputs and provider overrides taken from a scenario
- [x] #3 Scenarios are plain TypeScript files beside the component, loaded by the shell and runnable by @gable/testing
- [x] #4 Language-service diagnostics are shown on the canvas element they refer to
- [x] #5 HMR timeline shows whether each edit was a patch or a re-setup
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. core (DEV-gated, minimal): move design tooling off the devtools hook into its own slot + entry (@gable/core/designer: node->elements registry, templateSourceOf, listener muting at renderer listen); add provider info to injector entries; add per-class change kinds (patch/view/resetup) to HMR entries.
2. testing: MountOptions.inputs + mountScene() so scenes run under @gable/testing; scene types in @gable/core/tooling.
3. packages/designer (new workspace package): versioned protocol (nonce/origin checked), preview agent (TS -> dist JS), Vite plugin handed to the project's own Vite (agent injection, component-mode host page), Node backend (spawns project Vite, source resolve, scenes scan, language-service diagnostics, serves shell), shell as a Gable app (component tree, injector tree + providers, signal values, scenes, canvas diagnostics, HMR timeline), src-tauri moved from the spike.
4. Tests: unit tests for core/testing/designer pieces; driven run on examples/todomvc and examples/ui-gallery over CDP (browser and Tauri/WebView2).
5. Record decisions in notes (own core entry point, backend sidecar, protocol), final summary, Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions
- Design tooling has its OWN core entry point and slot (@gable/core/designer, `design` in dev-hooks.ts), not the devtools hook. Reason: the devtools hook is a public wire for the extension; per-element registry and listener muting are hot-path and design-only. templateSourceOf and the devtools `element` sink were removed; devtools gains only provider info on injector entries and per-class change kinds (patch/view/resetup) on HMR entries. All DEV-gated.
- Node backend sidecar (Rust stays thin: window + process lifetime). Needed because the language service runs on TypeScript in Node and template-format is reused. It spawns the PROJECT'S OWN Vite with a wrapper config (`--config`), nothing written to the project. The Tauri window loads the backend's URL, so desktop and browser run the same path. API needs a per-session bearer token, Host header must be loopback (anti DNS-rebinding), CORS only for own origins.
- Protocol: versioned (PROTOCOL_VERSION=1), `incompatible` reply on mismatch; shell and agent both check source window, origin, nonce. The session travels in a `?__gable_designer=nonce|origin` URL parameter that the agent consumes, strips and keeps in sessionStorage (reloads stay bound). window.name was tried first and does NOT work: Edge clears it on the cross-site iframe navigation.
- Node-to-source: runtime reports (template literal raw text, offsets inside it); the backend finds the literal in the file by content (templates have no ${} holes), CRLF folded to LF with offset maps. Caveats: elements only (no text/attr positions); templates containing escapes are flagged `exact: false` and not mapped (cooked vs raw offsets); identical literals in one file are ambiguous (first taken, flagged). Node ids go stale after an HMR template change (selection is cleared).
- Scenes: `*.scenes.ts` default-exports ComponentScenes<T> (types in @gable/core/tooling); @gable/testing gets mountScene(scenes, name) and MountOptions.inputs. Component mode loads /__gable-designer/component?scenes=... which generates a host module in the project's own module graph; switching scenes mounts in place.
- Shell is a Gable app built from gable-ui components (copied in with the gable-ui CLI): tabs, toggle-group, badge, button, tooltip, separator. Its Tailwind/theme is its own build and does not touch the iframe. Template expressions must be signal reads only (the language service enforces it), so panels build view models in computeds.
- Gaps (plain markup + TODO(gable-ui)): tree view (component tree is a flat indented list), resizable panels (fixed 3-column grid; TASK-53 pending).

Evidence (driven runs, Edge headless over CDP, and the real Tauri/WebView2 window)
- examples/todomvc and examples/ui-gallery in page mode: component tree, injector tree with provider kinds (class/value/factory) and live signal values (typing "milk" showed draft "milk"); click-to-pick resolved <input> to todo-app.ts:15:11.
- Component mode on todo-item.scenes.ts: Active/Completed/Long title; inputs applied, TodoStore stub shows as a `value` provider; scene switch without reload; ui-gallery gallery.scenes.ts mounts.
- Diagnostics: 5 language-service warnings listed, 2 placed on rendered elements; a deliberate `[title]="titel()"` produced a red error badge on the <h1> and 6 problems.
- HMR timeline: template edit = view swap, method edit = patch, class field added = re-setup.
- Tauri: window opened on todomvc, shell connected, pick worked; closing the process left no backend or Vite process.
- Tests: core designer (6) + devtools additions, testing scenes (3), todomvc scene test (2), designer package (8: protocol/session, CRLF source mapping, host module, scenes scan, token + Host checks). Full vitest run passes (one unreproducible failure in the first run; browser.test.ts is the known flaky one). tsc clean for core, testing, designer, todomvc, ui-gallery; gable-check clean for designer.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T04:24:00Z

---

Spike finding: needs a registry from template node to rendered elements (@for yields many, @if can yield none). Click muting currently stops events at document capture; muting at the renderer listen is more robust. Agent protocol is unversioned and accepts any origin: add a version and origin/nonce check. Decide whether design tooling gets its own core entry point rather than growing the devtools hook.

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built packages/designer: a versioned, nonce/origin-checked Preview agent; a Node backend that runs the project's own Vite, maps template nodes to source and runs the language service; a shell that is itself a Gable app on gable-ui; a thin Tauri host. Core got a DEV-gated design slot (@gable/core/designer), provider info and HMR change kinds; @gable/testing got mountScene and inputs. Verified by driven runs on todomvc and ui-gallery (browser and WebView2) plus unit tests. Pending: resizable panels (TASK-53) and a tree view in gable-ui, both worked around with plain markup and TODO(gable-ui).
<!-- SECTION:FINAL_SUMMARY:END -->
