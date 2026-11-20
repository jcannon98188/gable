---
kind: ticket
title: Precache verifies fetched files against the manifest hashes
status: resolved
tags:
  - parent-107
created: 2026-11-14
updated: 2026-11-14
imported_from: backlog/tasks/task-107.1 - Precache-verifies-fetched-files-against-the-manifest-hashes.md
assignee:
  - '@claude'
ordinal: 271000
---

## Question

ADR 0022 promises a versioned precache that installs atomically, but install() only checks for a 200 status. The Vite plugin already emits a content hash per file in the manifest, so a deploy that lands mid-install can store files from two releases under one version, and the installed marker is not proof the cache matches the manifest.

## Acceptance criteria

- [x] #1 core precache accepts optional per-file hashes and, after fetching each file, checks the bytes against them
- [x] #2 A mismatching file fails the install atomically: the version cache is deleted and the worker install fails, as for any other failed file
- [x] #3 The default runtime passes the manifest hashes through, and the Vite-emitted hash format (first 16 hex digits of SHA-256) is the one verified
- [x] #4 Where crypto.subtle is unavailable (the AgniJS and QuickJS engine suites) verification is skipped in a documented way and the engine suites stay green
- [x] #5 Tests cover match, mismatch, no hashes supplied, and a mid-install release swap; docs/packages/service-worker.md drops this from its limits

## Implementation plan

1. Tests first in core/precache.test.ts: hashes match, mismatch (atomic failure: cache deleted, install rejects, worker install fails), no hashes supplied, mid-install release swap (server swaps release between files; mixed files detected), hash format = first 16 hex of SHA-256, engine degrade (no crypto.subtle => skipped).
2. core/precache.ts: optional PrecacheManifest.hashes (url -> hash); after fetch, hash response.clone() bytes with crypto.subtle SHA-256, compare first 16 hex digits (also accept shorter/longer prefix? no: exact 16); mismatch throws and the install's existing catch deletes the cache. When crypto.subtle is missing, skip, documented in TSDoc and docs.
3. runtime/worker.ts: pass manifest hashes through (AssetManifest gains optional hashes; validateManifest checks shape). Vite emitted manifest already has hashes.
4. Docs: drop limit from docs/packages/service-worker.md, describe verification.
5. Engine suites: verification tests skip where crypto.subtle is missing; suites stay green. Mutation check, full verification.

## Implementation notes

Seams: core createPrecache(scope, { version, urls, hashes }).install() on the in-memory worker scope (match, mismatch, no hashes, partial hashes, mid-install release swap, case, empty hash, crypto.subtle missing); the default worker via defineWorker().start() (hashes passed through for prefetch files, manifest hash validation); a real Vite build whose emitted sw.js verifies the plugin's hashes (matching install, file from another build rejected).
Implementation: core/precache.ts PrecacheManifest.hashes (url -> first hex digits of SHA-256, case-insensitive prefix compare, empty never matches); sha256Hex hashes a response clone via globalThis.crypto?.subtle, returns undefined where subtle is missing and verification is then skipped. Mismatch throws a TypeError naming the file, expected and actual hash; the existing catch deletes the version cache. runtime AssetManifest gains optional hashes, validated; worker.ts passes manifest.hashes to createPrecache. Lazy files are not verified (out of scope). Engine tests that need hashing use describe.skipIf(no crypto.subtle); the degrade test stubs crypto to {}.
Mutation check: 11 mutations (check removed, inverted, empty-hash guard, case fold, no clone, unresolved hash keys, subtle guard, hashes not passed in worker.ts, hashes validation off): 9 killed; 2 survivors are equivalent (known-URL filter on hashes, and an extra installed-record write).

Verification (2026-11-14, under heavy.mjs): npm run build exit 0; npx vitest run packages/service-worker 20 files / 237 tests passed; npm run typecheck:tests exit 0; npm test 218 files / 2067 tests passed; npm run api:strict -w site exit 0 (@gable/service-worker 107 symbols, 0 undocumented); npm run check -w site exit 0 (first run failed only because gable-check was not linked before the build; fixed by a second npm install). Engine suites (--engine node --engine agnijs --engine quickjs --filter packages/service-worker): node 18 files 229 passed 0 failed; AgniJS 221 passed 0 failed 8 skipped; QuickJS 221 passed 0 failed 8 skipped (the 8 are the hash-verification tests, skipped where crypto.subtle is missing). The harness exits 1 only because suites-expected.json lists i18n tests in packages/core and packages/testing that now pass (FIXED), unrelated to this task; the two earlier pre-existing Request.cache/mode failures from service-worker/111 no longer occur with the current harness binary.

## Answer

The precache now verifies fetched files against the manifest hashes.
- core createPrecache accepts optional manifest.hashes (URL -> first hex digits of the SHA-256, the format @gable/vite emits). After fetching each file it hashes a clone with crypto.subtle and compares; a mismatch throws, and the existing failure path deletes the version cache so the worker's install fails and the running version stays in charge. Files without a hash are not verified.
- AssetManifest gains optional, validated hashes; the default worker passes them to the precache for prefetch files. A test builds the sample app with Vite and shows the emitted sw.js accepts its own build and rejects a bundle from another build.
- Where crypto.subtle is missing (AgniJS, QuickJS suites) verification is skipped, documented in TSDoc and docs/packages/service-worker.md; the hash tests use skipIf, and a test stubs crypto to show the skip. Engine suites: 0 failures on node, AgniJS and QuickJS.
- Docs describe the verification and the limit is reworded (hashes are not used to skip downloads; lazy files are not verified).
Verified: 237 package tests, 2067 repo tests, build, typecheck:tests, api:strict and site check green; 9 of 11 planted mutations killed, the other 2 equivalent.
Not done: lazy files are not verified; hashes are not used for carry-over between releases.
