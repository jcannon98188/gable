---
id: TASK-107.1
title: Precache verifies fetched files against the manifest hashes
status: To Do
assignee: []
created_date: '2026-11-14T17:29:00Z'
labels: []
dependencies: []
parent_task_id: TASK-107
ordinal: 271000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0021 promises a versioned precache that installs atomically, but install() only checks for a 200 status. The Vite plugin already emits a content hash per file in the manifest, so a deploy that lands mid-install can store files from two releases under one version, and the installed marker is not proof the cache matches the manifest.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 core precache accepts optional per-file hashes and, after fetching each file, checks the bytes against them
- [ ] #2 A mismatching file fails the install atomically: the version cache is deleted and the worker install fails, as for any other failed file
- [ ] #3 The default runtime passes the manifest hashes through, and the Vite-emitted hash format (first 16 hex digits of SHA-256) is the one verified
- [ ] #4 Where crypto.subtle is unavailable (the AgniJS and QuickJS engine suites) verification is skipped in a documented way and the engine suites stay green
- [ ] #5 Tests cover match, mismatch, no hashes supplied, and a mid-install release swap; docs/packages/service-worker.md drops this from its limits
<!-- AC:END -->
