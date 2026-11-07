---
id: TASK-56.7
title: 'Designer: page mode, route tree and HTTP mocking'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T03:58:00Z'
updated_date: '2026-11-07T05:53:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.3
parent_task_id: TASK-56
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Whole pages need the real app running with routing and data, without requiring a live backend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Page mode runs the app with the router, shows a route tree and URL bar, and navigates by route
- [x] #2 HTTP calls can be mocked per scenario through the HTTP backend token
- [x] #3 Routes can be added and edited, written back to the route config
- [x] #4 Scenarios can be shared between page mode and component mode
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. core: add mockHttp(rules) + HttpMock type to @gable/core/http (a HttpBackend that answers from declarative rules; shared by Designer and @gable/testing); extend Scene (tooling) backwards-compatibly with http?: HttpMock[] and url?: string; DesignerHook.rootProviders read by bootstrap (DEV only) so a page-mode scenario's providers reach the real app's root injector.
2. testing: mountScene applies scene.http. Tests.
3. designer vite plugin: page scenario injected through the page URL (?__gable_scenario=scenes|name) as a 3rd head script that statically imports the scenes file, sets hook.rootProviders and logs HTTP; component-mode host also applies scene.http. Agent: httpLog + pageScenario methods.
4. server/route-config.ts (own module, small interface: locate/plan edits/apply): TS-AST locates the Route[] config, plans minimal text patches for add route (path/title/redirectTo/component+import) and edit route props; HTTP endpoints /api/routes, /api/routes/edit.
5. shell (new files only + small hooks in DesignerState/shell): page bar (URL bar, scenario picker), route tree panel with add/edit, HTTP panel; navigation via devtools routers/navigate.
6. examples: todomvc page scenario file + an HTTP-backed demo; ui-gallery scenes with http; docs (router/designer README, glossary Scenario).
7. Verify: vitest for core/testing/designer, tsc, gable-check, driven headless Edge run for page mode, mocks, route add/edit write-back.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design: page-mode scenarios ride a ?__gable_scenario=<scenes>|<name> frame param; the Designer Vite plugin injects a module (after install and agent) that statically imports the scenes file and sets __GABLE_DESIGNER_HOOK__.rootProviders (mockHttp + scene.providers); core bootstrap appends them after the app providers, DEV only. Scene gained http?: HttpMock[] and url?: string (backwards compatible); mockHttp() in @gable/core/http is shared by component-mode host, page mode and @gable/testing mountScene. Route write-back: packages/designer/src/server/route-config.ts, TypeScript-API minimal text patches behind RouteConfigHost {read,write}, server chooses the file, result must still parse. Shell: new PageBar/RoutesPanel/HttpPanel in page-mode.ts, state in page-state.ts; shell.ts/designer-state.ts edits kept small. TODO(gable-ui): Tree for the route tree (flat indented list for now); native <select> in the route form. Known limits: scene inputs ignored in page mode; routes cannot be deleted or reordered; unsetting a component leaves its import; scenario param stays in the page URL. Evidence: vitest core/testing/designer/language-service 541 pass; examples todomvc (10) and ui-gallery (26) tests, tsc and gable-check clean for new files (ui-gallery transitions-demo has pre-existing gable-check errors). Driven in headless Edge over CDP: todomvc route tree/active marker, tree click and URL bar navigation, scenario pick (opens /active with 2 todos), add route and rename written to routes.ts (reverted); ui-gallery /http.html with Loaded, Empty, Server error, Offline, Slow scenarios, HTTP panel request log; component mode on the same scenes file showed HTTP 500.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T05:22:00Z

---

From TASK-56.3 (merged): diagnostics are placed through nodeAt and need a rendered node, so anything behind a false @if shows only in the Problems list.

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Page mode now runs the real app with the router: URL bar, route tree with active markers, click-to-navigate, scenario picker, HTTP tab. Scenes gained http mocks (mockHttp over the HttpBackend token) and a start url, shared by page mode, component mode and @gable/testing. Routes can be added and edited from the shell and are written back to the route config as minimal text patches (route-config.ts, separate from the 56.4 engine). Verified by tests (541 pass) and driven runs in headless Edge on todomvc and ui-gallery. Follow-ups: delete/reorder routes, drop unused import on unset component, adopt gable-ui Tree, scene inputs in page mode, routing-dependent scenes in component mode, undo via 56.4 engine, strip scenario param from the page URL, re-verify in the Tauri window.
<!-- SECTION:FINAL_SUMMARY:END -->
