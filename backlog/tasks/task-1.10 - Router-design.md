---
id: TASK-1.10
title: Router design
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 05:56'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-1.5
  - TASK-1.6
parent_task_id: TASK-1
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What is the router model: route config shape, lazy loading, route state exposed as signals and observables, and how router state survives HMR?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:46
---
From Template syntax: @defer lazy-loads components via explicit lazy(() => import(...)); route-level lazy loading should share that loader mechanism.
---

created: 2026-11-05 05:06
---
From Renderer abstraction: the router depends only on abstract core Tokens (Location, History) implemented by the platform package alongside the renderer; it mounts routed components via createComponent with renderer-built hosts.
---

created: 2026-11-05 05:56
---
Resolved with the user.

**Config**: plain typed Route[] via provideRouter(routes); route has path, component, children, providers (creates route Injector), data, title, redirectTo. No decorators or modules.
**Matching**: static, :param, trailing ** wildcard; first match wins; redirects. No regex matchers, auxiliary routes or matrix params.
**Outlets**: built-in <router-outlet>, explicit import, one unnamed outlet per nesting level, mounts via createComponent({ injector, host }).
**State**: Router exposes url, params, queryParams, fragment, data, navigating as signals with $ Observable twins; inject(ActiveRoute) gives per-level signals; route params auto-bind to matching input()s.
**Lazy loading**: shares lazy() with @defer for component and children; load failure goes to the app error handler and cancels navigation; no preloading in v0.
**Guards**: canActivate, canDeactivate, canMatch as injection-context functions returning boolean, redirect, or Promise/Observable. No resolvers (components bind Observables and handle T | undefined).
**Navigation**: router.navigate(...) returns a Promise of the outcome; routerLink and routerLinkActive attribute directives (explicit imports); events$ with NavigationStart/End/Cancel/Error; route title via a Title platform token.
**Platform**: abstract Location and History Tokens; DOM package implements over window.history; path mode default with base option, hash mode is another Location impl; test renderer ships in-memory one.
**HMR**: Router state survives via service state transfer; edited route config is re-matched against the current URL; instances reused when route identity (tree position + component id) is unchanged; route injectors rebuilt keyed by injector path and token; guards do not re-run, no navigation event; if config no longer matches the URL, keep the old config and report to overlay.
**Language service**: no typed routes in v0; only checks routerLink is imported.
**Fog**: scroll restoration, preloading, named outlets/auxiliary routes, resolvers, typed links.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Router model decided: Route[] config, signals plus Observable twins, auto input binding, shared lazy(), function guards, platform Location tokens, HMR re-match preserving instances by route identity. See resolution comment.
<!-- SECTION:FINAL_SUMMARY:END -->
