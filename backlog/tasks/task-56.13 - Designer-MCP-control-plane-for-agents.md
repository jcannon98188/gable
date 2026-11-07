---
id: TASK-56.13
title: 'Designer: MCP control plane for agents'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T15:55:00Z'
updated_date: '2026-11-07T16:19:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.8
parent_task_id: TASK-56
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose the Designer to AI agents over MCP so an agent can drive it like a user: inspect state, navigate, select, edit, and verify. The control plane is a thin MCP server (stdio and/or localhost streamable HTTP, token-protected, bound to 127.0.0.1) over the same backend/shell operations the UI uses, so every edit stays a minimal source patch with undo (ADR 0001). Candidate tools: project/status; list components, scenes, routes; set mode and scenario; navigate route; list/create/resize frames and device env (dark, touch, reduced motion); select by ref/selector/pos; get selection, computed styles, signals and tree; edit ops (set text, classes via Tailwind model with breakpoint/state, insert/move/delete, bindings) returning the applied patch diff; undo/redo; get problems and HMR timeline; screenshot of a frame (image content). Reads are safe; writes return patches. Document in the README.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 MCP server exposes read tools (status, components, scenes, routes, selection, tree, signals, problems, HMR) with typed schemas
- [x] #2 Write tools (mode, scenario, route, frames/env, select, edit ops, undo/redo) go through the existing edit service and return the applied patch
- [x] #3 Screenshot tool returns an image of a chosen frame
- [x] #4 Localhost-only binding with a per-session token; refuses unauthenticated calls; documented in README with a client config example
- [x] #5 Tests cover the tools against a fixture project; tsc, build and full vitest pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Backend: src/server/mcp/ (new files). bridge.ts: command channel to the shell over a dedicated SSE stream (/api/shell/channel) plus POST /api/shell/reply, token-checked; the newest shell connection receives commands. control.ts: McpServer (official SDK) with zod-typed tools; reads from backend state (project, scenes, components, routes config, diagnostics, history, tailwind), UI/runtime state (mode, target, frames, selection, tree, signals, HMR, router) through the bridge; edits through EditService only, each returning a unified diff of the applied patch; Tailwind class edits planned by TailwindModel and written as setAttr. http.ts: streamable HTTP at /mcp on the backend's 127.0.0.1 listener, separate per-session MCP token, Host check; session file in the user data dir so the stdio proxy can find it.
2. backend.ts/cli.ts: minimal hooks (create the control plane, route /mcp and /api/shell/*, expose mcp url/token, close). cli: 'gable-designer mcp <project>' stdio proxy (StdioServerTransport <-> StreamableHTTPClientTransport), starting a backend in-process when none is running.
3. Shell: shell/src/app/control-channel.ts root service executing commands against DesignerState/PageState/FrameSet/EditState (mode, target, scene, scenario, navigate, frames, select by node id/ref/source position/CSS selector, inspect, frame rect for screenshot); one inject line in shell.ts. Agent: additive nodeBySelector method.
4. Screenshot: CDP Page.captureScreenshot of the shell page clipped to the frame's iframe rect (CdpEmulator gains a capture method); fallback without CDP: headless system Chromium/Edge (GABLE_CHROME or known paths) renders the frame URL at the frame size; else a clear error.
5. Tests (src/mcp.test.ts) against test-fixtures/mcp-app via InMemoryTransport with a fake shell, plus HTTP auth tests against startBackend; e2e/mcp-check.mjs drives a real backend+shell (headless Edge with CDP) through an MCP client. README section with client config. Verify tsc, build, vitest.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation notes (deviations from the plan and findings):
- Screenshot capture lives in src/server/mcp/screenshot.ts with its own small CDP client (browser-level websocket from /json/version), not in CdpEmulator, so cdp.ts stays untouched for the concurrent 56.9-56.12 work. It first tries Page.captureScreenshot on the frame's own OOPIF target (found by the nonce in window.name). If that fails, it clips the frame's rect from the shell page target and scales by 1/scale. On headless Edge the e2e run took the clip path ("cdp-clip"), which still gives the frame at its CSS size (1280x800).
- Fallback without a CDP port: headless Chromium/Edge (GABLE_CHROME, or the known install paths) renders the frame URL fresh, with the route and Scenario merged in, at the frame's size, DPR, touch, color scheme, reduced motion and UA.
- Elements are addressed by source position {file, line, column} (targets.ts maps them to a TargetRef). When no target is given, the shell's selection is used. Edit results carry a unified diff computed around EditService.apply (the edit service is unchanged), plus the edited element's new position. The shell is asked to reselect the element after HMR.
- The MCP token is separate from the shell token. The session file is <dataDir>/mcp/<sha1(root)>.json (0600) and holds url/token/pid. The stdio proxy (`gable-designer mcp <project>`) reads it; if none is found it starts a backend in-process unless --no-start is given.
- Agent protocol gains an additive nodeBySelector method (no PROTOCOL_VERSION bump). The shell gets one inject line in shell.ts.
- The gable Vite plugin skips files under /node_modules/, so the e2e project is created under packages/designer/dist/.mcp-e2e (git-ignored). Unit-test copies go under node_modules/.cache (no Vite there), so the fixture's @import "tailwindcss" resolves.
- Not exposed: route-config edits (editRouteConfig bypasses the edit service and undo) and real computed styles (get_styles is the Tailwind model's analysis of the static classes).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an MCP control plane to the Designer backend. It is built on the official @modelcontextprotocol/sdk and has 37 zod-typed tools.

What changed:
- Read tools: status, components/palette, scenes, routes (source config and the running router), problems, history, describe_element, selection, Tailwind styles, component tree, signals, HMR timeline and mocked HTTP.
- UI state is driven only through a new shell command channel (/api/shell/channel SSE plus POST /api/shell/reply, handled by shell/src/app/control-channel.ts). This covers mode, page/component, scene, Scenario, navigate, frames (add/update/remove/select, presets, emulation) and select_element (by source position or CSS selector).
- Edit tools go through EditService: text, attribute, bind, insert/delete/move/wrap, meta, CSS, and Tailwind classes at a breakpoint/state via TailwindModel.plan. Undo/redo use the same history. Each edit returns the unified diff it wrote.
- screenshot returns MCP image content. It captures over CDP when the backend has a CDP port, otherwise it renders the frame in a headless Chromium/Edge.
- Transports: streamable HTTP at <backend>/mcp on 127.0.0.1, with a Host check, a per-session Bearer token (401 without it) and a session file. Also stdio, via `gable-designer mcp <project>`, which proxies to the running Designer or starts one.
- The README documents tools, auth, the session file, screenshots and client configs.

Verification:
- src/mcp.test.ts (14 tests, test-fixtures/mcp-app): in-memory client with a fake window. Covers read tools, the edit tools' diffs, undo/redo, Tailwind edits, UI commands through the bridge, error paths, the session file, and HTTP 401/403 plus an authed client and a real SSE shell round-trip.
- e2e/mcp-check.mjs: real built backend, shell in headless Edge, clients over HTTP and stdio. All 32 checks pass, including the live CDP screenshot showing the edit, HMR, reselect after HMR, frames, and the headless fallback screenshot.
- `npx tsc -p packages/designer/tsconfig.json --noEmit` is clean, as is tsconfig.test.json for the designer.
- `npm run build -w packages/designer` passes.
- `npx vitest run`: 170 files, 1494 tests pass.

Follow-ups:
- A route-config edit tool with undo (editRouteConfig bypasses the edit service today).
- Real computed styles through an agent method.
- Live capture of the OOPIF target itself; on Edge the clip path was used.
- Verify in the Tauri/WebView2 window. The e2e used headless Edge in browser mode.
<!-- SECTION:FINAL_SUMMARY:END -->
