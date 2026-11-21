---
kind: ticket
title: Public package layout and versioning
status: resolved
type: grilling
tags:
  - parent-1
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-1.14 - Public-package-layout-and-versioning.md
assignee:
  - '@jason'
ordinal: 15000
---

## Question

What are gable's public packages and their boundaries (core, renderer-dom, router, test renderer, @gablejs/vite, language service, CLI, VS Code extension, Prettier plugin), what each exports, which are peer dependencies (RxJS, the signals polyfill), and how versions are coordinated and breaking changes signalled while the TC39 Signals proposal is still Stage 1?

## Answer

Package layout and versioning decided: one core package with entry points plus renderer-dom, testing, vite, language-service and prettier-plugin; lockstep 0.x releases; pinned polyfill dependency, RxJS peer; ESM-only. Agreed with the user in a grilling session.

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 06:44
---
Amendment from Testing story: @gablejs/testing is a dev-only entry containing the harness and the test renderer, with a sub-entry exporting the test renderer alone (Renderer-contract conformance tests). Vitest is an optional peer for documentation/adapters only; RxJS stays the required peer. The test renderer's platform services (in-memory Location/History) ship with it.
---

created: 2026-11-05 06:58
---
Resolved with the user.

**Layout**: @gablejs/core is one package with entry points: root (signals, component fields, html, lazy, createComponent, bootstrap, InjectionToken, ErrorHandler, toSignal/toObservable, hotState), /router (router, Route, guards, abstract Location/History Tokens), /forms, /http, /renderer (Renderer contract types), /hmr (dev runtime, internal, no semver promise, imported only by @gablejs/vite). Separate packages: @gablejs/renderer-dom (DOM renderer plus real Location/History), @gablejs/testing (dev-only; mount/mountApp/createTestInjector/hotReplace/fakes; /renderer sub-entry for the test renderer and Renderer-contract conformance tests), @gablejs/vite (plugin only), @gablejs/language-service (analyzer, tsserver plugin, formatTemplate, gable-check bin), @gablejs/prettier-plugin (thin wrapper). The VS Code extension ships via the marketplace, not npm, versioned separately and declaring its supported @gablejs/language-service range. User code imports only from @gablejs/core* and the chosen renderer.
**Dependencies**: the signals polyfill is a pinned exact-version regular dependency of core, wrapped, never re-exported or visible in public types. RxJS is the one required peer. renderer-dom, testing, vite and language-service peer-depend on @gablejs/core at ~ the same minor; bootstrap warns in dev on a core/renderer version mismatch; @gablejs/vite sets resolve.dedupe for @gablejs/core.
**Versioning**: lockstep release of all npm packages via Changesets in one monorepo. Stay on 0.x: a minor may break, a patch never does; breaking changes marked in the changelog; pre-releases on the next dist-tag. 1.0 is gated on gable's own stability, not TC39 Stage 3: two minors without an API break, the Renderer contract validated by a second implementation (test renderer conformance counts), and HMR used on real apps. Swapping the polyfill for native signals is never a breaking change.
**Format**: ESM only, ES2022, .d.ts shipped, sideEffects false, exports map per package, TypeScript latest stable plus previous minor, Node LTS for tooling packages only.
**Amendments**: HTTP becomes @gablejs/core/http (was @gablejs/http) and forms becomes @gablejs/core/forms. Glossary terms added: Entry point, Lockstep release.
---

created: 2026-11-05 07:02
---
From Project scaffolding and starter template: add create-gable to the package list (lockstep, unscoped initializer that copies the project template).
---
<!-- COMMENTS:END -->
