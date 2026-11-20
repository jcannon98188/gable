---
kind: ticket
title: "How do assets load and how do loading states show in templates?"
status: resolved
type: grilling
blocked_by: [108]
tags:
  - parent-104
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-104.9 - How-do-assets-load-and-how-do-loading-states-show-in-templates.md
assignee:
  - '@jason'
ordinal: 232000
---

## Question

Decide how textures, spritesheets, bitmap fonts and web fonts load through Pixi's Assets system in a declarative app: how a template refers to an asset (by alias, URL, import), where bundles and manifests are declared, how loading, error and ready states surface as signals and in templates (an @defer-like or @if over a loading signal), caching and lifetime (texture destroy when a node is removed), and the Vite story for hashed asset URLs.

## Answer

Assets: explicit loading through an app-level `Assets` service with bundle handles over Pixi's `Assets`; strings in templates resolve synchronously from Pixi's cache; loading state is signals plus existing template blocks.

1. **References:** `[texture]` (and the static attribute) on `sprite`, `tiling-sprite` and `nine-slice-sprite` accepts a cached alias or URL string, a spritesheet frame name, or a Pixi `Texture` built in code. Strings are looked up synchronously in Pixi's asset cache. If not loaded, the node shows an empty texture and the dev build warns naming the alias and the renderer. The renderer never starts a load by itself, so loading state lives in signals, not hidden promises.
2. **`Assets` service** (canvas package, app-level so hosts share Pixi's global cache), installed with `provideAssets({ bundles: { menu: [...], level1: [...] } })` using Pixi manifest entries. `inject(Assets).bundle("level1")` returns a handle with signals `status` (`idle`, `loading`, `ready`, `error`), `progress` (0 to 1) and `error`, and methods `load()` (idempotent) and `unload()`.
3. **Loading states** use existing template blocks over the handle's signals (`@if (level.ready()) {...} @else {...}`, `@if (level.error())`); `@defer (when level.ready())` defers scene components or their code. No new `@defer` triggers; `when`, `idle` and `timer` are core-owned. Note: `@error` today reports lazy-import failures, not asset failures, so asset errors go through the handle's `error` signal.
4. **Spritesheets, bitmap fonts, web fonts** are plain bundle entries. A loaded spritesheet's frame names resolve through the cache lookup in item 1 (`texture="hero/idle_0"`). `bitmap-text` takes `fontFamily` naming a loaded bitmap font. Text using a web font must be created only after its bundle is ready (guard with `@if`), a documented rule not machinery. The HUD's DOM text keeps using CSS `@font-face`.
5. **Lifetime:** `load()` increments a count; disposing the calling component's scope decrements it; at zero the service unloads the bundle (`Assets.unload`). Shared bundles stay while any scene uses them; `keepAlive` opts out for app-lifetime assets. Removing a node never destroys a bundle texture (a node destroys itself only; Pixi 8 `destroy({ children: true })` leaves textures alone by default); textures built in code belong to whoever built them. Uses the public scope-cleanup hook accepted in canvas/111.
6. **Vite:** single files are imported normally in the TypeScript that defines the manifest (`import shipUrl from "./ship.png"`), so Vite hashes the URL; this works because manifests live in `provideAssets(...)`, not in static templates. Spritesheet JSON and bitmap-font descriptors reference sibling files by relative path, which hashing breaks, so those families go in `public/` unhashed with cache busting by deploy. A Vite plugin that rewrites sibling references is deferred and can be added without changing the manifest API.

Facts relied on: Pixi 8 `Assets` is a global singleton with a cache keyed by alias or URL; loaded spritesheet frames register in it by frame name; Pixi does not ref-count textures per node. Core exports no resource/fromPromise primitive; `@defer` supports `when`, `@placeholder` and `@error` for failed lazy loads. canvas/115 must give the `Assets` service a test double (instantly ready or scripted states).

---
<!-- COMMENTS:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T17:44:00Z

---
