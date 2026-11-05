---
id: TASK-1
title: Gable v0 design map
status: Done
assignee: []
created_date: '2026-11-05 04:19'
updated_date: '2026-11-05 13:47'
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
- [Template syntax and expression evaluation without a compiler](backlog/tasks/task-1.4%20-%20Template-syntax-and-expression-evaluation-without-a-compiler.md): `html` tagged templates parsed once per call site; own parser and interpreter (no eval, CSP-safe); value expressions are property reads, zero-arg signal reads, literals, `!`, `??` only (no method calls or pipes; compute lives in computed view-model signals, and the language service refactors toward them); block control flow; bare Observable and Promise references bind directly (no async pipe); `@defer` in v0 with explicit `lazy()` imports.
- [Renderer abstraction](backlog/tasks/task-1.12%20-%20Renderer-abstraction.md): low-level node-op seam (core owns interpreter, bindings and control flow; renderer owns nodes, events, styles, hosts, `@defer` triggers); platform services (location/history) are DI tokens shipped with the renderer; in-memory test renderer in v0; no HMR-specific renderer op, only id-keyed `registerStyles`.
- [HMR runtime and state-preservation rules](backlog/tasks/task-1.7%20-%20HMR-runtime-and-state-preservation-rules.md): canonical classes patched in place; a changed class is re-set-up on a new instance with state transferred by field name and kind (no constructors, setup is field initialisers); services cascade to their dependents; one atomic transaction per update; optional renderer ops preserve focus, scroll and input state; module-level state resets; all HMR code dev-only; rollback then `invalidate()` on failure.
- [Dev server and bundler strategy](backlog/tasks/task-1.8%20-%20Dev-server-and-bundler-strategy.md): Vite-only via a thin `@gable/vite` plugin that appends a dev-only `import.meta.hot` accept line (ids from the module namespace) and parses nothing; zero gable transforms in production; esbuild forced to native class fields; Tailwind v4 is a separate first-class plugin, scoped Tailwind styles use `?inline` CSS files.

- [Signals and RxJS interop API](backlog/tasks/task-1.6%20-%20Signals-and-RxJS-interop-API.md): `toSignal`/`toObservable` bridges, scope-owned (setup only, torn down on destroy, HMR resubscribes); errors go to the app error handler and signals never throw; `toObservable` is flush-aligned; opt-in `renderScheduler`; dual-shape convention: state is a Signal, events/async are Observables, `$` marks the Observable twin; template Observable/Promise binding reuses `toSignal`, typed `T | undefined`.
- [Router design](backlog/tasks/task-1.10%20-%20Router-design.md): `Route[]` config with nested outlets, route injectors and `redirectTo`; router state as signals with `$` Observable twins and auto input binding; lazy routes share `lazy()`; function guards, no resolvers; `Location`/`History` platform Tokens; HMR re-matches the current URL and reuses instances by route identity.
- [Template language service v0 design](backlog/tasks/task-1.11%20-%20Template-language-service-v0-design.md): one analyzer core (parser, type-check blocks, one rule catalogue, formatter) behind a tsserver plugin, `gable-check` CLI, `gable-vscode` extension and thin Prettier plugin; metadata derived from types and `meta.imports`, renderer metadata via a tsconfig `renderer` option; always strict with per-rule severity; quick fixes extract computed view-model signals; TextMate injection grammar for highlighting; opinionated formatter exposed as a pure `formatTemplate` plus a template-only CLI, so any formatter can integrate.

- [Forms](backlog/tasks/task-1.15%20-%20Forms.md): separate optional entry point; model-first `form(model, schema)` where every node is a fine-grained WritableSignal (`form()`, `form.email()`, `[(model)]="form.email"`), model canonical; per-field state under a reserved `state` namespace; error objects `{ kind, ... }`; schema-function validation with typed paths; async validation as RxJS in/out; `submit(action)`; renderer-shipped `[field]` directive and structural custom-control convention; HMR transfers value, touched and baseline by path.
- [Error handling](backlog/tasks/task-1.13%20-%20Error-handling.md): root `ErrorHandler` Token (default logs and swallows) receiving `{ source, component?, injector }` contexts attributed via owning scope; no boundaries in v0; effects, events and bindings fail soft (report, keep going or last value); setup failure disposes scope and renders an empty host; overlay and Sentry-style tools decorate the one Token; test harness rethrows reports so tests fail by default.
- [HTTP client](backlog/tasks/task-1.16%20-%20HTTP-client.md): small optional `@gable/http` entry point; `Http` class returning cold Observables (abort on unsubscribe), function interceptors layered by injector depth, typed `HttpError` that flows to the `ErrorHandler`, swappable `HttpBackend` Token (default `fetch`) with a recording test fake; no caching, retry, progress or typed endpoints in v0.

- [Testing story](backlog/tasks/task-1.17%20-%20Testing-story.md): dev-only `@gable/testing` (harness plus test renderer), runner-agnostic with Vitest first-class; `mount`/`mountApp`/`createTestInjector` return a Fixture with CSS-subset queries, `html()` snapshots and user-level helpers; explicit `flush`/`settle`/`flushSync` and `advance(ms)` on the runner's fake timers; collected errors fail tests unless claimed; HTTP fake by default (`http: 'network'` for MSW); component `overrides`, `fixture.defer`, `hotReplace`.

- [Escape hatches for HMR](backlog/tasks/task-1.18%20-%20Escape-hatches-for-HMR.md): `static hmr` and a module `export const hmr` take `reset`/`reload`/`ignore` (class overrides module); `hotState(import.meta, key, init)` keeps module-level state across edits (old value wins, dev-only registry); language service validates and suppresses the top-level-signal warning for `hotState`; no global switch (use Vite `server.hmr: false`).

- [HMR spike: swap a component and keep signal state](backlog/tasks/task-1.9%20-%20HMR-spike-swap-a-component-and-keep-signal-state.md): simulated prototype confirmed the HMR runtime model (re-setup with state transfer, service cascade, atomic rollback, rename/kind-change data loss accepted); no spec changes. Prototype on branch `prototype/hmr-spike`; not validated against real Vite.

- [Public package layout and versioning](backlog/tasks/task-1.14%20-%20Public-package-layout-and-versioning.md): one `@gable/core` with entry points (router, forms, http, renderer, hmr) plus `renderer-dom`, `testing`, `vite`, `language-service`, `prettier-plugin`; lockstep 0.x releases; pinned polyfill dependency, RxJS peer, same-minor core peers; 1.0 gated on gable stability; ESM-only.

- [Project scaffolding and starter template](backlog/tasks/task-1.19%20-%20Project-scaffolding-and-starter-template.md): `create-gable` copies one template (Vite, TypeScript, Tailwind v4, Vitest, Prettier, sample Counter app) with the language service fully wired and versions pinned to the lockstep release; CI scaffolds it as an integration test; Getting started and manual-setup docs; DOM renderer is `@gable/renderer-dom` everywhere.

## Not yet specified

- Devtools and error overlay UI (the hook is decided: decorate `ErrorHandler`)
- Error boundaries (`@try`/`@catch`-style fallback rendering); the Token and attribution are the seam
- Performance targets
- Template language service extras: rename, find references, semantic tokens, a dprint WASM plugin
- HTTP extras: response caching and dedup, SSE/WebSocket Observables, a typed-endpoint layer (see [HTTP client](backlog/tasks/task-1.16%20-%20HTTP-client.md))
- Router extras: scroll restoration, route preloading, named outlets and auxiliary routes, resolvers, typed route links

## Out of scope

- Forms extras: template-driven forms, a form builder DSL, schema-from-JSON, built-in i18n of error messages, file inputs, wizard/multi-step orchestration (see [Forms](backlog/tasks/task-1.15%20-%20Forms.md))
- SSR and hydration
- Building a native renderer (gable.native) or any mobile target; only the renderer seam is in scope
- A CLI with schematics
- A component library
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 13:47
---
Closed: every child decision ticket is Done, and the user reports the product has been built from the resulting spec.
---
<!-- COMMENTS:END -->
