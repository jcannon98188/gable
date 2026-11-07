---
id: TASK-56.21
title: 'Designer: network and storage panels'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T18:28:00Z'
updated_date: '2026-11-07T19:35:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Drawer panels for the selected frame: request log (method, URL, status, timing, size, initiator) and local/session storage and cookies with edit/delete. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Network log and storage/cookies panels with live updates
- [x] #2 Exposed through the MCP control plane where an agent would drive it
- [x] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Audit: the request log (method, URL, status, time, size, initiator, live via the activity message) exists from TASK-56.20 in the drawer's HTTP tab; nothing reads or edits storage or cookies; each preview frame has its own origin, so storage is per frame.
1. Shared types (src/storage.ts): StorageMethods (storage, setStorageItem, removeStorageItem, clearStorage, setCookie, deleteCookie; additive, PROTOCOL_VERSION unchanged), the cookie string builder/parser and validation, StorageCommand for MCP.
2. Agent (src/agent/storage.ts): local/session items (the Designer's own keys hidden and never cleared), document.cookie view; edits; live updates by hooking Storage.prototype writes, the document.cookie setter, the storage event and cookieStore changes -> activity 'storage' (throttled).
3. CDP (WebView2/CDP browsers only, mirroring device emulation): full cookie list incl. HttpOnly and attributes, set/delete any cookie, via new methods in cdp.ts and /api/storage/cookies in a new storage-api.ts routed from network-api.ts; without CDP cookies come from document.cookie and HttpOnly is labelled unavailable.
4. Shell: storage-state.ts + storage-panel.ts (area tabs Local/Session/Cookies, filter, table, add/edit/delete, clear), drawer tab 'Storage'; relabel the HTTP tab 'Network' (drawer + commands); network log filters (text, kind, failed only).
5. MCP (src/server/mcp/storage-tools.ts): get_storage, set_storage_item, remove_storage_item, clear_storage, set_cookie, delete_cookie; get_network gains filter/kind/failed.
6. Unit tests (cookie string/parse, agent storage with fake window), e2e/storage-check.mjs headless Edge (with and without CDP) on test-fixtures/net-app, README section.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as planned. Storage: src/storage.ts (types, cookie helpers, StorageMethods, MCP command), src/agent/storage.ts (StorageAccess + live hooks), CDP cookie methods in src/server/cdp.ts behind POST /api/storage/cookies (src/server/storage-api.ts, routed from network-api.ts; backend.ts untouched), shell storage-state.ts + storage-panel.ts, drawer tab Storage; HTTP tab relabelled Network (value stays 'http'). Network log filters: filterEntries/isFailed in src/network.ts, used by the panel (text, kind, failed only, 'N of M') and get_network (filter, kind, failed, filteredOut). MCP: get_storage, set_storage_item, remove_storage_item, clear_storage, set_cookie, delete_cookie (src/server/mcp/storage-tools.ts).
Found while driving it: in a browser the shell (127.0.0.1) and the frames (localhost) are different sites, so the frame is a third-party iframe and the browser drops cookies that are not SameSite=None; Secure (an app's Lax session cookie, writes and deletes through document.cookie). The panel and get_storage now say so (thirdPartyNote), the cookie dialog defaults to SameSite=None; Secure there, and the agent's delete also writes the SameSite=None form. The desktop app (tauri.localhost) is same-site with the frames. The net-app fixture's login cookies are SameSite=None; Secure for that reason.
Verification: tsc clean; typecheck:tests clean; designer build OK; src/storage.test.ts 13 tests; full vitest 1628/1629, the one failure renderer-dom/browser.test.ts (fails alone too, and on a clean HEAD earlier: pre-existing). e2e/storage-check.mjs: all checks pass with CDP and with --no-cdp; e2e/network-check.mjs rerun: all checks pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Storage panel and network log filters for the Designer drawer.
- Storage tab: the selected frame's localStorage, sessionStorage and cookies, read from the page by the Preview agent and updated live (Storage API and document.cookie hooks, storage/cookieStore events, response activity). Add, edit, rename, delete and filter items; Clear asks first. The Designer's own keys are hidden, counted, refused and kept.
- Cookies: over CDP, every cookie with attributes, HttpOnly included, set and deleted via Network.* (POST /api/storage/cookies). Without CDP, the page's cookies through document.cookie, with HttpOnly and attributes labelled unavailable. Writes the browser drops and deletes that leave the cookie are reported.
- Third-party frame: the browser shell is cross-site with the frames, so only SameSite=None; Secure cookies work in the frame there. The panel and get_storage say so, and the dialog defaults to those attributes.
- Network log: filter by text, kind and failed-only, in the panel and in get_network. The HTTP tab is now labelled Network.
- MCP: get_storage, set_storage_item, remove_storage_item, clear_storage, set_cookie, delete_cookie. Protocol additions are additive, so PROTOCOL_VERSION is unchanged.
- Tests: src/storage.test.ts (13). Headless Edge e2e/storage-check.mjs passes with and without CDP; network-check passes too. tsc, typecheck:tests and the build are clean. Full vitest passes except the pre-existing renderer-dom/browser.test.ts flake.
- Not verified: the WebView2 desktop window itself (CDP was exercised through headless Edge), and the same-site claim for tauri.localhost (reasoned, not run).
<!-- SECTION:FINAL_SUMMARY:END -->
