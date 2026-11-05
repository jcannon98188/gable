---
id: TASK-1
title: Gable v0 design map
status: To Do
assignee: []
created_date: '2026-11-05 04:19'
updated_date: '2026-11-05 04:34'
labels:
  - 'wayfinder:map'
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Destination

A v0 design spec for gable: the client-side runtime (components, DI, signals and RxJS interop, templates, router), the renderer seam (DOM is one renderer, leaving room for a future gable.native), the HMR model, the dev server and bundler strategy, and the template language service. Ready to hand to implementation sessions.

## Notes

Consult GLOSSARY.md. No framework-specific compiler (ngc/Ivy style): TypeScript transpile and general-purpose bundlers are allowed, but nothing may need to understand gable's templates or metadata. Signals follow TC39 Signals semantics via the polyfill. RxJS is a required peer dependency and first-class, with explicit signal/observable bridges. True HMR (state preserved, no reload) is a core requirement. Template language service (TS language-service plugin) is in v0. The DOM renderer is one renderer behind a seam; "gable.native" is assumed to be the name of the future native renderer.

## Decisions so far

- [TC39 Signals polyfill: maturity and gaps](backlog/tasks/task-1.1%20-%20TC39-Signals-polyfill-maturity-and-gaps.md): Stage 1 and not production-ready; wrap and pin it, and build effect, scheduler and scope disposal ourselves. No blocker for fine-grained DOM or HMR. Findings on branch `research/tc39-signals-polyfill`.
- [HMR prior art](backlog/tasks/task-1.2%20-%20HMR-prior-art.md): Vite only transports updates; class registry, prototype re-pointing and a field signature are the transferable ideas. Findings on branch `research/hmr-prior-art`.
- [Language-service plugins for template literals](backlog/tasks/task-1.3%20-%20Language-service-plugins-for-template-literals.md): tsserver plugin works but never affects tsc; use a shared analyzer core plus a CLI for CI. Findings on branch `research/template-language-services`.
- [Component model and hierarchical DI](backlog/tasks/task-1.5%20-%20Component-model-and-hierarchical-DI.md): plain classes with `static meta`, signal-based input/output/model, no lifecycle hooks, a single injector tree, explicit imports, signals plus RxJS scheduling on one microtask flush, public `createComponent` and `bootstrap(Root, { renderer, providers })`.

## Not yet specified

- Forms
- HTTP client
- Testing story
- Project scaffolding
- Devtools and error overlay
- Error handling
- Performance targets
- Public package layout and versioning

## Out of scope

- SSR and hydration
- Building a native renderer (gable.native) or any mobile target; only the renderer seam is in scope
- A CLI with schematics
- A component library
<!-- SECTION:DESCRIPTION:END -->
