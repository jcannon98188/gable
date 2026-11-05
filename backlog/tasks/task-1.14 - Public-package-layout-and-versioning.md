---
id: TASK-1.14
title: Public package layout and versioning
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 06:13'
updated_date: '2026-11-05 07:02'
labels:
  - 'wayfinder:grilling'
dependencies: []
parent_task_id: TASK-1
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What are gable's public packages and their boundaries (core, renderer-dom, router, test renderer, @gable/vite, language service, CLI, VS Code extension, Prettier plugin), what each exports, which are peer dependencies (RxJS, the signals polyfill), and how versions are coordinated and breaking changes signalled while the TC39 Signals proposal is still Stage 1?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 06:44
---
Amendment from Testing story: @gable/testing is a dev-only entry containing the harness and the test renderer, with a sub-entry exporting the test renderer alone (Renderer-contract conformance tests). Vitest is an optional peer for documentation/adapters only; RxJS stays the required peer. The test renderer's platform services (in-memory Location/History) ship with it.
---

created: 2026-11-05 06:58
---
Resolved with the user.

**Layout**: @gable/core is one package with entry points: root (signals, component fields, html, lazy, createComponent, bootstrap, InjectionToken, ErrorHandler, toSignal/toObservable, hotState), /router (router, Route, guards, abstract Location/History Tokens), /forms, /http, /renderer (Renderer contract types), /hmr (dev runtime, internal, no semver promise, imported only by @gable/vite). Separate packages: @gable/renderer-dom (DOM renderer plus real Location/History), @gable/testing (dev-only; mount/mountApp/createTestInjector/hotReplace/fakes; /renderer sub-entry for the test renderer and Renderer-contract conformance tests), @gable/vite (plugin only), @gable/language-service (analyzer, tsserver plugin, formatTemplate, gable-check bin), @gable/prettier-plugin (thin wrapper). The VS Code extension ships via the marketplace, not npm, versioned separately and declaring its supported @gable/language-service range. User code imports only from @gable/core* and the chosen renderer.
**Dependencies**: the signals polyfill is a pinned exact-version regular dependency of core, wrapped, never re-exported or visible in public types. RxJS is the one required peer. renderer-dom, testing, vite and language-service peer-depend on @gable/core at ~ the same minor; bootstrap warns in dev on a core/renderer version mismatch; @gable/vite sets resolve.dedupe for @gable/core.
**Versioning**: lockstep release of all npm packages via Changesets in one monorepo. Stay on 0.x: a minor may break, a patch never does; breaking changes marked in the changelog; pre-releases on the next dist-tag. 1.0 is gated on gable's own stability, not TC39 Stage 3: two minors without an API break, the Renderer contract validated by a second implementation (test renderer conformance counts), and HMR used on real apps. Swapping the polyfill for native signals is never a breaking change.
**Format**: ESM only, ES2022, .d.ts shipped, sideEffects false, exports map per package, TypeScript latest stable plus previous minor, Node LTS for tooling packages only.
**Amendments**: HTTP becomes @gable/core/http (was @gable/http) and forms becomes @gable/core/forms. Glossary terms added: Entry point, Lockstep release.
---

created: 2026-11-05 07:02
---
From Project scaffolding and starter template: add create-gable to the package list (lockstep, unscoped initializer that copies the project template).
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Package layout and versioning decided: one core package with entry points plus renderer-dom, testing, vite, language-service and prettier-plugin; lockstep 0.x releases; pinned polyfill dependency, RxJS peer; ESM-only. Agreed with the user in a grilling session.
<!-- SECTION:FINAL_SUMMARY:END -->
