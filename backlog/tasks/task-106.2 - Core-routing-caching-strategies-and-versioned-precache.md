---
id: TASK-106.2
title: 'Core: routing, caching strategies and versioned precache'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-13T19:56:00Z'
updated_date: '2026-11-14T07:15:00Z'
labels: []
dependencies:
  - TASK-106.1
parent_task_id: TASK-106
ordinal: 263000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The authoring API is the base the default worker and any custom worker build on. Atomic install and activation of a versioned precache is the part apps get wrong most often.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Routes match by URL pattern, method and request destination
- [x] #2 Cache-first, network-first, stale-while-revalidate and network-only strategies behave per spec in tests
- [x] #3 A precache manifest installs a version fully or not at all, and never serves a mix of two versions
- [x] #4 Old version caches are removed on activation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Routing (src/core/router.ts): createFetchRouter(scope).route(pattern, handler, { method, destination }).handle/listen. Patterns: same-origin path with :params and *, absolute URL pattern, RegExp, predicate; method default GET; destination by Request.destination; first match wins; unmatched requests left to the network. WorkerScope gains origin (self.origin).
2. Strategies (src/core/strategies.ts): cacheFirst, networkFirst (networkTimeoutMs), staleWhileRevalidate, networkOnly as route handlers over one named cache; store status 200 unless cacheable allows; writes via event.waitUntil.
3. Precache (src/core/precache.ts): createPrecache(scope, { version, urls }, { name }): one cache per version '<name>:<version>', installed record written after every file; failed install deletes the version's cache and rejects; uninstalled caches are never served; activate() removes other '<name>:*' caches.
4. In-memory scope: dispatchFetch mode 'navigate' and destination options; respondWith extends the event lifetime as in the browser.
5. TSDoc on all exports; export lines in core/index.ts; docs/packages/service-worker.md updated.
6. Verify via heavy.mjs: package build, vitest, npm run build, typecheck:tests, npm test, site api:strict; mutation check of the tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Seams tested (all on the in-memory worker scope, through core's public functions): the fetch router (dispatchFetch through router.listen/handle), each strategy as a route handler, and the precache object wired to install/activate events and to a route. No internals are tested.
Routing: src/core/router.ts, createFetchRouter(scope).route(pattern, handler, { method, destination }).listen()/handle(event). Patterns: same-origin path ('/users/:id', '/assets/*'; whole path, query ignored), absolute URL pattern for other origins, RegExp on the full URL (named groups become params), or predicate. Method defaults to GET ('*' for any); destination matches Request.destination. First match wins; unmatched requests are left alone (network or later listeners); a throwing handler is a network error, not a fall-through. Named FetchRouter/FetchRoute* to avoid clashing with the app Router and its Route (GLOSSARY).
WorkerScope gains readonly origin (self.origin in a real worker) so path patterns know the worker's origin; the in-memory scope already had it.
Strategies: src/core/strategies.ts, cacheFirst, networkFirst (networkTimeoutMs; late response still stored), staleWhileRevalidate, networkOnly. Caching ones read and write one named cache only; store status 200 unless cacheable says otherwise; writes go through event.waitUntil so the page does not wait. Uses Response.clone() (real workers have it).
Precache: src/core/precache.ts, createPrecache(scope, { version, urls }, { name }) -> cacheName '<name>:<version>', install(), activate(), has(url), match(request), handler. Atomicity: one cache per version, plus an installed record (an entry at /__gable-precache__/installed) written after every file is stored; a cache without it is never served and is rebuilt; any non-200 or network failure deletes the version's cache and rejects (fails the worker install). Requests use cache: 'no-cache' so the HTTP cache cannot hand back an older release. An installed version is not refetched. activate() deletes '<name>:*' caches other than its own; other names are kept.
In-memory scope extended: dispatchFetch accepts mode 'navigate' and destination (shadowed on the Request instance, since Node's Request cannot be built with them; navigate defaults destination to 'document'); respondWith now extends the event's lifetime like the browser, so waitUntil stays callable until the response settles.
Limits / not done: unchanged files are refetched per version rather than copied from the previous version's cache; no directory-index or ignore-search matching for precached URLs (navigation fallback is TASK-106.5); redirected responses are not rejected by the precache; no catch/default handler on the router. Engine-suite (AgniJS/QuickJS) runs of the new tests were not done; the strategies use Response.clone.
Mutation check: 20 deliberate breakages across router, strategies, precache and the scope changes; each one fails the package tests.

Verification (2026-11-14, under heavy.mjs): npm run build -w packages/service-worker exit 0; npx vitest run packages/service-worker 5 files / 77 tests passed (router 13, strategies 16, precache 13, scope 35); npm run build exit 0; npm run typecheck:tests exit 0; npm test 202 files / 1886 tests passed; npm run api:strict -w site exit 0 (@gable/service-worker 3 entries, 23 symbols, 0 undocumented). Evidence per AC: #1 router.test.ts (URL patterns, method and destination suites); #2 strategies.test.ts (cache-first, network-first incl. timeout, stale-while-revalidate, network-only); #3 precache.test.ts install suite (non-200 and part-way network failure install nothing and fail the worker install; interrupted cache never served and rebuilt) and 'versions never mix' (old version serves only its own files during and after a new version's failed and successful install); #4 precache.test.ts activation suite (other versions' caches removed, runtime caches and other precache names kept).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added routing, caching strategies and a versioned precache to @gable/service-worker/core, each in its own module (router.ts, strategies.ts, precache.ts) with three export lines in core/index.ts.
- createFetchRouter(scope) routes fetch events by URL pattern (same-origin path with :params and *, absolute URL pattern, RegExp or predicate), method (GET by default) and request destination; first match answers, unmatched requests go to the network, a failing handler is a network error.
- cacheFirst, networkFirst (optional networkTimeoutMs), staleWhileRevalidate and networkOnly are route handlers over one named cache; they store only status 200 unless cacheable allows more, and write through event.waitUntil.
- createPrecache(scope, { version, urls }) installs a release into its own cache '<name>:<version>' and writes an installed record only after every file is stored, so a failed or interrupted install is never served; a failure deletes the version's cache and rejects, failing the worker's install. activate() removes other versions' caches and keeps everything else.
WorkerScope gains origin (self.origin). The in-memory scope gained navigate-mode and destination requests, and respondWith now extends the event's lifetime as in the browser. docs/packages/service-worker.md describes the new API.
Verified: package tests 77/77, npm run build, typecheck:tests, npm test (1886 tests), site api:strict (0 undocumented) all pass; 20 deliberate breakages each failed the tests.
Follow-ups (not done): unchanged files are refetched per version rather than copied from the previous cache; no directory-index/ignore-search matching for precached URLs (navigation fallback belongs to TASK-106.5); redirected responses not rejected by the precache; new tests not run under the AgniJS/QuickJS engine suites; whether to publish the in-memory scope as ./testing remains open.
<!-- SECTION:FINAL_SUMMARY:END -->
