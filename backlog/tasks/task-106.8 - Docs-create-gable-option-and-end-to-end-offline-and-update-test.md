---
id: TASK-106.8
title: Docs, create-gable option and end-to-end offline and update test
status: Done
assignee:
  - '@claude'
created_date: '2026-11-13T19:56:00Z'
updated_date: '2026-11-14T09:07:00Z'
labels: []
dependencies:
  - TASK-106.6
  - TASK-106.7
parent_task_id: TASK-106
ordinal: 269000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The feature is not finished until a starter app can be taken offline and updated. This is the end-to-end proof and the user-facing documentation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/packages/service-worker.md covers the three layers, gable.sw.json and the extend and replace paths
- [x] #2 create-gable offers a service worker option
- [x] #3 A browser test installs, goes offline, serves cached content, then applies an update through activateUpdate()
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. create-gable: --service-worker flag (scaffold option serviceWorker). Overlay directory template-service-worker/ (gable.sw.json, vite.config.ts with gableServiceWorker(), src/main.ts with provideServiceWorker, src/root.ts with the banner, src/update-banner.ts calling activateUpdate()) copied over the base template; @gable/service-worker added to dependencies only when on. Base template unchanged, so the off case pays nothing. CLI tests for the flag, help and --local tarballs.
2. End-to-end in scaffold.test.ts: pack @gable/service-worker too, scaffold a second starter with the option, install from tarballs, check/test/build; assert the off starter has no service worker dependency or sw.js. Browser test (skipped without Chromium, like the vite browser tests; reuses packages/vite/src/test-browser.ts): serve dist over HTTP on localhost, install, reload controlled, take the server offline (requests dropped), reload and see the app served from cache, rebuild with a changed heading, back online, browser update check, banner shows, click calls activateUpdate(), page reloads into v2, old precache removed.
3. Docs: rewrite docs/packages/service-worker.md (three layers, gable.sw.json, extend and replace paths, app services, Vite plugin, create-gable option, honest limits from TASK-106.1-106.7); getting-started.md and create-gable.md sections for the option with template markers kept in sync by docs.test.ts; site package grid and README package table.
4. Verify: npm run build, typecheck:tests, npm test, site api:strict, check, test, under heavy.mjs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Seams tested: create-gable main()/scaffold() (cli.test.ts), the scaffolded starters installed from tarballs and built, run in headless Chromium (scaffold.test.ts), and the docs sync (docs.test.ts).
create-gable: --service-worker flag (no prompt, so 'asks only for a project name' holds). Overlay directory template-service-worker/ (gable.sw.json, vite.config.ts, src/main.ts, src/root.ts, src/update-banner.ts) is copied over the base template; scaffold adds @gable/service-worker to dependencies (sorted) before --local localizes, so --local needs that tarball too. The base template is unchanged. Getting started shows the overlay files through <!-- template: ../template-service-worker/... --> markers, so sync-docs needed no change; docs.test.ts checks every overlay file is shown and in sync (planted change in the overlay main.ts turned it red).
E2E (scaffold.test.ts): packs @gable/service-worker as well, scaffolds and installs a second starter with the option. The off starter has no node_modules/@gable/service-worker, no dist/sw.js or sw-manifest.json and no serviceWorker or gable-sw@1 in its bundle. The on starter passes check, prettier, test and build, and emits sw.js with the manifest version built in. Browser test (reuses packages/vite/src/test-browser.ts, skipped without Chromium like the vite browser tests): static server on 127.0.0.1; first visit installs and activates (gable-precache:<v1>), reload is controlled; offline = the server destroys every request (fetch from the page fails), reload and a client-side route both render from cache; rebuild with a changed heading, back online, registration.update() from the page (browsers also check on navigation, on their own schedule), banner appears while v1 keeps serving and both precaches exist; clicking the banner calls activateUpdate() and reloads into v2, v1's precache is gone, banner gone; v2 then loads offline. Mutation: a banner that reloads without activateUpdate() turned the test red (v2 never shown). No core, runtime or vite bug surfaced; no product code outside create-gable changed.
Docs: service-worker.md rewritten (get started, three layers, releases and updates, gable.sw.json, extend, replace with core API, app services, Vite plugin, testing, limits collected from TASK-106.1-106.7 notes); getting-started.md section; create-gable.md usage, option row and section; README package table; site package grid card.
Verification (2026-11-14, under heavy.mjs): npm run build exit 0; npm run typecheck:tests exit 0; npm test 218 files / 2049 tests passed (scaffold.test.ts included, Edge found so the browser test ran; dedicated run 1 passed in 56s); npm run api:strict -w site exit 0 (@gable/service-worker 3 entries, 107 symbols, 0 undocumented); npm run check -w site exit 0 after re-running npm install to link the gable-check bin (first attempt: 'gable-check is not recognized', the known Windows bin-link issue); npm test -w site 14 files / 114 tests passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Finished service worker support with docs, a create-gable option and an end-to-end browser test.
- create-gable --service-worker copies template-service-worker/ over the starter: gable.sw.json (prefetch the shell and assets/, lazy-cache the rest, navigation fallback), gableServiceWorker() in vite.config.ts, provideServiceWorker({ url: '/sw.js' }) in main.ts, and an UpdateBanner that shows when updateAvailable() and calls activateUpdate() then reloads. It adds @gable/service-worker to dependencies. Without the flag the starter is unchanged, and the test proves it carries no worker dependency, file or code.
- scaffold.test.ts installs both starters from packed tarballs. The service worker starter passes check, test and build, and in headless Chromium it installs, keeps working (client routes included) with the server dropping every request, then takes a rebuilt release through the banner's activateUpdate(), with the old release's cache removed and the new release working offline. A planted banner without activateUpdate() fails the test.
- docs/packages/service-worker.md now covers getting started, the three layers, releases and updates, gable.sw.json, the extend and replace paths, core's API, the app services, the Vite plugin, testing and an honest limits list. getting-started.md shows the option's files, kept in sync by docs.test.ts. create-gable.md, README and the site package grid list the package.
Verified: build, typecheck:tests, npm test (2049 passed), site api:strict (0 undocumented), site check and site test all pass. No core, runtime or Vite behaviour changed.
Follow-ups (not done, listed under Limits in the docs): clients.claim on first visit, per-file carry-over between releases, data cache expiry, push subscription, a gable.sw.json schema, exporting the in-memory test scope.
<!-- SECTION:FINAL_SUMMARY:END -->
