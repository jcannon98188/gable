---
id: TASK-56.16
title: 'Designer: Performance tab in the drawer'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T17:52:00Z'
updated_date: '2026-11-07T18:21:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a Performance tab to the bottom drawer (next to Accessibility). The Preview agent collects in-page metrics from the selected frame and reports them over the protocol (additive method, PROTOCOL_VERSION unchanged, like a11y): navigation/load timing, FCP, LCP (with the element, selectable on canvas), CLS (with shifting elements), long tasks and total blocking time, INP if available, resource summary (count, bytes, slowest), and DOM size. Add Gable-specific numbers if the devtools hook exposes them (time to first render, effect re-runs / signal updates per second, hot update to repaint time). Show each metric with a good/needs-work/poor rating using the standard web-vitals thresholds, an element link where relevant (click selects the element), a Re-run/reload-and-measure action, and the frame's device context (size, DPR, throttling when set). Optional if cheap: CPU/network throttling per frame via CDP emulation on WebView2 (labelled unavailable elsewhere). Honest empty state before first run; no fake data. Expose via MCP get_performance. Not a Lighthouse run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Preview agent reports performance metrics for the selected frame over an additive protocol method; metrics refresh on load, hot update and Re-run
- [x] #2 Performance tab lists metrics with ratings, element links (LCP, CLS) that select the element, and an honest empty/unavailable state
- [x] #3 MCP get_performance tool returns the same metrics
- [x] #4 Tests added; tsc, designer build and full vitest pass; driven in headless Edge
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Protocol (additive, PROTOCOL_VERSION stays 1): agent methods 'performance' (PerfReport) and 'reload' (location.reload of the frame; the session survives in window.name). Types PerfReport/PerfMetric/PerfElement/... in src/protocol.ts.
2. Agent src/agent/perf.ts: PerformanceObserver (buffered) for paint, largest-contentful-paint, layout-shift, longtask, event + first-input, navigation, resource, started when the agent starts. Pure functions: rating (web-vitals thresholds: FCP 1800/3000, LCP 2500/4000, CLS 0.1/0.25, INP 200/500, TTFB 800/1800; TBT 200/600 and DOM size 800/1400 as Lighthouse), CLS session windows, INP from interactions, TBT after FCP, resource summary, DOM size (overlay excluded). LCP element and layout-shift sources mapped to template nodes via designer.nodeOf (nearest ancestor). Unsupported entry types are reported as unavailable, never as zero.
3. Gable numbers from the devtools hook only (already pushed to the agent): signal flushes, effect runs, effect time and slowest flush since load; first component tree; time from an HMR apply to the next frame.
4. Throttling (cheap path): /api/devices/throttle -> CdpEmulator.throttle (Emulation.setCPUThrottlingRate, Network.emulateNetworkConditions on the frame's target); transient per frame, re-applied with the emulation on every connect; labelled unavailable without CDP.
5. Shell: perf-state.ts (root) measures on frame connect/load (each ready), hot update, navigation (debounced) and Re-run (reloads the frame via agent 'reload' and measures after its next ready); drawer Performance tab next to Accessibility: metric rows with rating chips, element links for LCP and layout shifts (click selects, hover outlines), long tasks/resources/DOM/Gable sections, device context (size, DPR, throttling), dev-server caveat, honest empty states; command palette entry.
6. MCP get_performance through the shell channel (control command 'performance', additive) returning the same report.
7. Tests: perf.test.ts (pure functions: ratings, CLS windows, INP, TBT, resources, report mapping), shell sorting/format helpers, MCP get_performance with the fake window. Fixture test-fixtures/perf-app (LCP image, a late layout shift, a long task) and e2e/perf-check.mjs (spawns backend with --cdp-port and headless Edge, kills only its PIDs). Run tsc, typecheck:tests, designer build, vitest, perf-check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Agent (src/agent/perf.ts): PerfCollector observes paint, LCP, layout-shift, longtask, event (durationThreshold 16) buffered from agent start; navigation/resource read at snapshot (resource buffer raised to 2000: the dev server serves every module). Unsupported types -> metric null + reason, listed in `unsupported`.
- Gable numbers come only from hook events the agent already receives (flush, tree, hmr): flushes, effect runs/ms, slowest flush, first tree time, last hot update -> next rendered frame (rAF + setTimeout, since a rAF timestamp can be earlier than the HMR entry's performance.now()).
- Re-run: agent `reload` (component mode keeps the Scene via `?scene=`); shell counts `ready` in DesignerState.loads and measures the fresh load; calls to a reloading frame are bounded (no answer comes).
- Throttling: /api/devices/throttle -> CdpEmulator.throttle; Frame.throttle (asked) vs throttleApplied (CDP-confirmed), label shows "(applying...)" in between (the e2e caught the label running ahead of CDP). sanitizeThrottle uses Object.hasOwn (`"toString" in NETWORK_PROFILES` was true).
- Fixture: Gable components may not declare constructors; the fixture's late banner/long task start from a field initialiser.
- e2e/perf-check.mjs: 30 checks with CDP, 29 with --no-cdp; Edge spawned with its own temp profile and CDP port, killed by its PID tree only.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Performance tab in the Designer drawer (next to Accessibility), backed by in-page measurement in the Preview agent.

- Protocol (additive, PROTOCOL_VERSION unchanged): agent methods `performance` (PerfReport) and `reload`; control command `performance`; MCP `get_performance` (`reload: true` measures a fresh load).
- Metrics: TTFB, FCP, LCP, CLS (session windows), INP (p98 past 50), TBT (from FCP to the measurement), DOM size, rated with web-vitals thresholds (Lighthouse's for TBT/DOM). LCP element, layout-shift sources and the slowest interaction resolve to template nodes; clicking selects on canvas. Facts: navigation, long tasks, interactions, requests (Designer's own counted apart), DOM, Gable hook counts. n/a with reason instead of zeros; dev-server caveat on every report.
- Refresh: frame connect/reload, frame selection, hot update, navigation, Re-run (reloads frame). Badge counts poor + needs-work.
- Throttling per frame over CDP (CPU 4/6/20x, Fast 4G/Slow 4G/Slow 3G), labelled unavailable without CDP.
- Tests: src/perf.test.ts (11), throttle endpoint, MCP get_performance with the fake window. tsc, typecheck:tests, designer build, full vitest (180 files, 1599 tests) pass. Driven in headless Edge: e2e/perf-check.mjs passes with CDP (incl. CPU 4x measurably slowing the frame) and with --no-cdp.

Not verified: component-mode Re-run (scene kept via ?scene=) only by reading; the Tauri/WebView2 window (TASK-56.15 territory); network throttling's effect (only CPU measured).
<!-- SECTION:FINAL_SUMMARY:END -->
