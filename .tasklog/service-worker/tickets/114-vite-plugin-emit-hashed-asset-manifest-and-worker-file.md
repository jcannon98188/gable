---
kind: ticket
title: "Vite plugin: emit hashed asset manifest and worker file"
status: resolved
blocked_by: [112]
tags:
  - parent-106
created: 2026-11-13
updated: 2026-11-14
imported_from: backlog/tasks/task-106.7 - Vite-plugin-emit-hashed-asset-manifest-and-worker-file.md
assignee:
  - '@claude'
ordinal: 268000
---

## Question

The precache needs a build-time list of hashed assets, and both the default and custom workers use it. This stays in @gable/vite and needs no template awareness.

## Acceptance criteria

- [x] #1 Production build emits the manifest with content hashes and the worker file
- [x] #2 A custom worker built on core receives the manifest and keeps atomic versioned updates
- [x] #3 Nothing is emitted or registered in dev

## Implementation plan

1. Separate exported plugin gableServiceWorker({ config, entry, fileName, manifestFileName }) in @gable/vite (apply: build, client environment only); gable() and apps without a worker are unchanged. @gable/vite never imports @gable/service-worker statically (optional peer dependency); the bundled worker imports it at the app's build, and the default worker's config is checked through a dynamic import.
2. At generateBundle (order post): collect every emitted file (bundle plus publicDir), source maps left out; SHA-256 (16 hex) per file, paths from the origin root with base.
3. Bundle the worker with a nested Vite build (IIFE, one file, inherits resolve.alias/define/minify/target). Default worker generated from gable.sw.json (defineWorker({ config })); a custom entry default-exports (self, manifest) => void or a defineWorker() result; a generated wrapper calls it with the manifest. Manifest injected after bundling via a placeholder; version = hash over the worker code and every file hash.
4. Emit sw.js (unhashed) and sw-manifest.json ({ version, files, hashes }).
5. Tests with real Vite builds of the fixture, the emitted worker run on the in-memory worker scope/browser, and the dev server.
6. TSDoc, short docs in docs/packages/vite.md and service-worker.md, ADR 0022 consequence note; verify build/typecheck:tests/test/api:strict.

## Implementation notes

Seams tested (packages/vite/src/service-worker.test.ts, 12 tests): (a) gableServiceWorker() through real vite build() of the sample fixture (write: false), asserting the emitted files; (b) the emitted sw.js evaluated as a classic script over the in-memory worker scope and in-memory browser from packages/service-worker/src/testing (imported by relative path), with SwUpdates/SwRegistration from the app side; (c) a vite dev server (createServer) with the plugin.
Decisions: separate plugin gableServiceWorker() (like gableI18n) rather than a gable() option, so apps without a worker pay nothing; @gable/service-worker is an optional peer of @gable/vite and never a static import (no cycle, no build-order dependency: vite builds before service-worker). Worker bundled by a nested Vite build into one IIFE classic script (module service workers are not universal), named sw.js (unhashed, fixed URL; register with provideServiceWorker({ url: '/sw.js' }), base prefixed). The manifest reaches any worker as the second argument of its module's default export, (self, manifest) => void or a defineWorker() result, called by a generated wrapper; no virtual module or global, so custom workers need no ambient types. The manifest is built into sw.js (so each release is new bytes at /sw.js, which is how the browser detects an update) and also written as sw-manifest.json. Content hashes: hashes[path] = first 16 hex of SHA-256 of the file's bytes; version = same hash over the bundled worker code (placeholder in place of the manifest, so config and worker code count) plus every path/hash pair; deterministic for an unchanged build. Files: bundle chunks and assets plus publicDir files (Vite copies them), source maps excluded; paths are base + fileName. The default worker's gable.sw.json is validated at build time with validateConfig and validateManifest (shell must be prefetched) via a dynamic import of @gable/service-worker/runtime, failing the build with the runtime's ServiceWorkerConfigError. Build fails clearly for: missing config, missing entry, a non-absolute base, a build that already emits sw.js/sw-manifest.json (e.g. public/sw.js). ADR 0022 amended with a consequence note (separate plugin, optional peer, manifest built into the worker, the custom worker default-export contract). Runtime AssetManifest is unchanged; the emitted manifest adds hashes (typed as EmittedAssetManifest in @gable/vite).
Dev (AC3): the plugin is apply: 'build', so the dev server serves no worker or manifest (Vite's SPA fallback answers /sw.js with index.html as text/html, which a browser rejects as a worker script); __GABLE_DEV__ stays undefined in dev so SwRegistration does not register (service-worker/113 tests cover the registration side).
Mutation check: 9 planted mutations (version ignoring worker code, hash of name not content, public dir skipped, manifest files emptied in worker, consumer check inverted, build-time validation removed, .map exclusion removed, plus two earlier) turned tests red; one equivalent survivor: format iife -> es (the bundled worker has no imports/exports either way).
Limits / not done: base must be an absolute path (no CDN or relative base); gableI18n bake's per-locale outputs are not covered (the worker describes the top-level build only); user Vite plugins are not applied to the worker bundle (only resolve.alias, define, mode, minify, target are inherited); no per-file carry-over between releases (hashes are emitted but the runtime does not read them yet); the docs beyond the vite.md section and the service-worker.md paragraph, create-gable option and browser e2e are service-worker/115.
Verification (2026-11-14, under heavy.mjs): npm run build exit 0 (packages/vite/dist/service-worker.js has no static @gable/service-worker import; a Node import of the built runtime from packages/vite works); npm run typecheck:tests exit 0; npm test 218 files / 2041 tests passed; npm run api:strict -w site exit 0 (@gable/vite 16 symbols, 0 undocumented). No test files added in packages/service-worker, so its engine suites were not rerun.

Correction to the mutation count above: 7 planted mutations were killed (the seven listed; there were no 'two earlier'), plus the one equivalent survivor.

## Answer

Added gableServiceWorker() to @gable/vite: at vite build it emits sw-manifest.json and sw.js for @gable/service-worker.
- The manifest ({ version, files, hashes }) lists every emitted file, the public directory included and source maps left out, as base-prefixed paths. Each file has a content hash (SHA-256, 16 hex). The version hashes the worker's code and every file hash, so any change to a file, gable.sw.json or the worker makes a new release, and an unchanged build keeps its version.
- sw.js is one classic IIFE script, bundled by a nested Vite build, with the manifest built in, so each release is new bytes at a fixed URL (/sw.js). The worker is either the default worker, generated from gable.sw.json (validated against the manifest at build time), or a custom entry whose default export is (self, manifest) => void or a defineWorker() result. Either way it gets the same manifest.
- Dev: the plugin runs only in builds, so nothing is emitted, and __GABLE_DEV__ stays undefined, so the app side does not register.
- @gable/service-worker is an optional peer and never a static import of @gable/vite; gable() is unchanged. ADR 0022 has a consequence note; vite.md and service-worker.md have short sections.
Verified with 12 tests on real Vite builds of the fixture: the emitted default worker serves offline on the in-memory worker scope; a core-only custom worker goes through two releases on the in-memory browser with SwUpdates (v1 serves its own files while v2 waits, activateUpdate switches, v1's cache is removed); the dev server is covered too. 7 planted mutations were killed, with one equivalent survivor. Build, typecheck:tests, npm test (2041 passed) and site api:strict (0 undocumented) all pass.
Limits: only an absolute base is supported; gableI18n baked per-locale outputs are not covered; user Vite plugins are not applied to the worker bundle; per-file hashes are emitted, but the runtime does not use them yet to carry unchanged files over.
