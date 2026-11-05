---
id: TASK-1.17
title: Testing story
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 06:13'
updated_date: '2026-11-05 06:44'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-1.13
parent_task_id: TASK-1
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

How are components, services and routes unit-tested: the test renderer's public API, a component harness (`createComponent` with providers, querying and interacting with the node tree), controlling the coalesced microtask flush, faking time and Observables, testing router navigation, and which test runners are supported out of the box?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 06:25
---
Amendment from Forms: Forms are model-first signals plus RxJS async validation; tests need deterministic flushing of validateAsync (debounce via the test scheduler) and a way to drive [field] bindings in the test renderer.
---

created: 2026-11-05 06:38
---
Amendment from HTTP client: the harness must ship a recording HttpBackend fake (provideTestHttp: expectOne(url).respond(...), verify()) that fails the test on unmatched or unexpected requests, and must flush Observables bound in templates deterministically.
---

created: 2026-11-05 06:44
---
Resolved with the user.

**Harness**: dev-only `@gable/testing` entry (harness plus the test renderer; the renderer also has its own sub-entry for Renderer-contract conformance tests). No TestBed-style global configure/reset. Runner-agnostic, no globals, no jsdom; Vitest is the documented and CI-tested runner, others expected to work. Auto-cleanup via `afterEach` when present, otherwise `destroy()`/`using`.
**mount**: `mount(Component, { providers, inputs, injector, overrides, renderer, http })` wraps `createComponent` and returns a Fixture: instance, root node, `query`/`queryAll`, `text()`, `html()` (stable pretty-printed snapshot), `setInput()`, interaction helpers (`click`, `type`, `check`, `select`, `blur`, `trigger(node, name, payload)`), `destroy()`. `renderer` defaults to the test renderer; passing `dom()` works in Vitest browser mode or a user-supplied jsdom (query then uses `querySelector` semantics). No jsdom shipped.
**mountApp(Root, { routes, url, providers })**: root injector with in-memory `Location`/`History` Tokens (test renderer's platform services); the Fixture plus `navigate(url)`, which awaits guards, lazy routes and the flush, and `location.url`/`history` for assertions.
**createTestInjector(providers)**: injector with `run(fn)` and no renderer, for services, guards and interceptors; recording HTTP fake and collecting ErrorHandler by default. Providers passed to any of the three override any Token.
**Flush control**: never auto-flushes. Helpers trigger synchronously; `fixture.flush()` (next microtask flush), `settle()` (flush until nothing is scheduled, covering bound Promises/Observables, then rethrow collected error reports), `flushSync()`.
**Time**: gable owns no clock. Runner fake timers drive `debounceTime`, `validateAsync`, `@defer` timers; `fixture.advance(ms)` advances the faked clock then settles. RxJS `TestScheduler` works via the injectable `renderScheduler`.
**Test renderer**: public plain node shape (`kind` element|text|anchor, tag, props, attrs, classes, styles, children, listeners), read-only snapshot-friendly. `query` takes a CSS subset (tag, `.class`, `#id`, `[attr]`, `[attr=value]`, descendant and child combinators). `trigger` dispatches through registered `listen` handlers with `$event` as given; no bubbling or default actions.
**Forms**: the test renderer ships the `[field]` directive equivalent (value mapping by type, write-back on simulated `input`, touched on `blur`, disabled and `aria-invalid`); `type`/`check`/`select`/`blur` read like a user session. No forms-specific testing API; async validation via `settle()`/`advance()`.
**Errors**: harness handler collects ErrorHandler reports and rethrows the first from `flush`/`settle`; `fixture.errors.expect(source?)` returns and clears expected reports; leftover reports fail the test at teardown with their `ErrorContext`; a test may supply its own ErrorHandler.
**HTTP**: `provideTestHttp()` installed by default, exposed as `fixture.http` (`expectOne`, `expectNone`, `match`, `verify`, `respond(body | HttpError)`); `verify()` and unmatched-request failures run at teardown; real fetch unreachable unless provided. Option `http: 'network'` skips the fake and uses the default fetch backend so a user's MSW (Node) handlers apply; MSW is documented, not depended on or wrapped.
**Isolation and defer**: `overrides: [[Child, Stub]]` replaces an imported component or `lazy()` entry for one test. `fixture.defer` exposes each deferred block: `trigger()`, `state` (placeholder|loading|complete|error), `settle()`.
**HMR**: `fixture.hotReplace(NewClass)` runs the real state-transfer path (dev-only) so apps and gable's own tests can assert state survival.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Testing story resolved; see resolution comment.
<!-- SECTION:FINAL_SUMMARY:END -->
