---
id: TASK-1
title: Gable v0 design map
status: To Do
assignee: []
created_date: '2026-11-05 04:19'
updated_date: '2026-11-05 04:20'
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

## Not yet specified

- Forms
- HTTP client
- Testing story
- Project scaffolding
- Devtools and error overlay
- Performance targets
- Public package layout and versioning

## Out of scope

- SSR and hydration
- Building a native renderer (gable.native) or any mobile target; only the renderer seam is in scope
- A CLI with schematics
- A component library
<!-- SECTION:DESCRIPTION:END -->
