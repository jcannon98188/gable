---
id: TASK-56.11
title: 'Designer: project switcher, agent install and dev server control'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T15:20:00Z'
updated_date: '2026-11-07T16:08:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.8
parent_task_id: TASK-56
ordinal: 149000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-56.8. Open project dialog, Preview agent install, and dev-server restart/log show unavailable states. Implement them in the Rust host/backend as thin as ADR 0002 allows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Open project dialog picks a project, starts its Vite and connects; recent projects listed
- [x] #2 Missing Preview agent can be installed from the connect flow; failed dev server shows log and a working Restart
- [x] #3 Tests added; tsc, designer build and full vitest pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Backend (Node, ADR 0002): src/server/dev-server.ts owns the project's Vite (spawn via wrapper config, status, crash-after-ready detection, log ring buffer, restart on the same preview port); src/server/projects.ts holds recent projects (user data dir), a folder lister, the project check (package.json, Vite, @gable/core/designer = the Preview agent's in-app hook, package manager) and the install runner; src/server/project-api.ts serves /api/project/* and /api/server/*.
2. backend.ts: per-project session (dev server, watcher, edits, tailwind, diagnostics) swappable behind the same HTTP server, token and preview port; SSE server/log/project events.
3. cli.ts: project optional (falls back to the most recent). Rust: pass the project only when given (stays window + process lifetime).
4. Shell: ProjectState service; Open project dialog (path field, folder browser, recents, Open); Connect dialog with check chips and Install and start (live log); failure card with log tail, Restart server, Open log; dev server log dialog.
5. Tests: unit tests for projects.ts and dev-server.ts with a fake vite package; backend switch test. Update chrome-check, add e2e/project-check.mjs driving switch, install and restart in headless Edge.
6. Verify tsc, build, cargo check, vitest, e2e; README.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification (2026-11-07):
- npx tsc -p packages/designer/tsconfig.json --noEmit: clean; npm run typecheck:tests: clean; npm run build -w packages/designer: ok; cargo check in src-tauri: ok.
- npx vitest run: 168 files, 1488 tests passed (new src/project.test.ts: recent projects, projectProblem, folder lister, package manager detection, checkProject cases, findPackage, ProjectLog, DevServer start/crash/restart/fail-at-start/no-Vite with a fake vite package, backend open/recent/log/install/restart/folders endpoints).
- e2e/project-check.mjs (headless Edge, self-contained, stops only the pids it started): 22/22 PASS. Covers starting on ui-gallery, recents, folder lister + Up, refusal of a folder without package.json, opening a fixture app with uninstalled deps (connect flow opens by itself, says the Preview agent and Vite are missing, names npm install), Install and start with the live log, connected afterwards, a crash of the dev server (failure card with reason and log tail, top bar Disconnected), Open log, Restart server, preview renders again, palette 'Show the dev server log', switching back via recents.
- e2e/chrome-check.mjs: 14/14 PASS after dropping its 'Open a project not available yet' entry.
- Found while driving: the template language has no ?: operator, '[]' literal or calls with arguments in bindings; those moved into computeds (they only fail at runtime).

Limits: the Tauri window itself was not launched (cargo check only); only npm installs were exercised end to end (pnpm/yarn/bun are detected and unit-tested, not run); an outdated @gable/core is reported, not upgraded; the folder picker is an in-app lister, not the OS dialog.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Open project, Preview agent install and dev server control now run against the backend (ADR 0002: Node owns the project's Vite; Rust stays window + process lifetime).

Backend: src/server/dev-server.ts (DevServer runs the project's own Vite through the wrapper config, tracks starting/running/failed/stopped incl. a crash after ready, ring-buffer log, restart on the same preview port), src/server/projects.ts (recent.json in the user data dir, folder lister, project check: package.json, Vite, @gable/core/designer, package manager from packageManager/lockfile; install runner), src/server/project-api.ts (/api/project/recent|folders|open|install, /api/server/log|restart). backend.ts keeps a per-project Session (dev server, watcher, edits, Tailwind, diagnostics) swapped behind the same server, token and preview port; SSE server/log/project events. cli.ts: project optional, falls back to the most recent; main.rs passes it only when given.

Shell: ProjectState service; Open a project dialog (path, recents, folder lister, refusal reasons); Connect dialog with check chips, Install and start and the live install log, opened by itself on a first run that needs it; failure card with reason, log tail, Restart server, Open log, Install…; Dev server log dialog; palette commands for log, restart and install.

Tests: src/project.test.ts (unit + backend endpoints with a fake vite), e2e/project-check.mjs (headless Edge, 22 checks), chrome-check updated. tsc, typecheck:tests, designer build, cargo check and full vitest (1488 tests) pass. README documents the flow and endpoints.

Not verified: the Tauri window run; pnpm/yarn/bun installs end to end. Follow-ups: OS folder picker / drag-drop, starting with no project at all (currently the CLI needs a folder or a recent one), an upgrade path for an outdated @gable/core.
<!-- SECTION:FINAL_SUMMARY:END -->
