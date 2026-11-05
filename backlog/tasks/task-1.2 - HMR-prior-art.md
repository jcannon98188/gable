---
id: TASK-1.2
title: HMR prior art
status: Done
assignee: []
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 04:23'
labels:
  - 'wayfinder:research'
dependencies: []
parent_task_id: TASK-1
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

How do Vite HMR, React Refresh, Lit, Solid-refresh and Angular's HMR preserve state across updates? Surface the mechanisms, their limits, and which ideas apply to a class-based, signals-driven, compiler-free framework.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:23
---
Findings: branch research/hmr-prior-art @ 30ddce4, file research/hmr-prior-art.md. Vite gives transport and module boundaries only; state preservation is the framework's job. Transferable: a class registry in hot.data, re-pointing prototypes while keeping instances (signals live on the instance), a runtime signature of signal/DI fields to choose remount vs keep, re-running the view on the same instance (needs a renderer-seam operation), reload/skip pragmas and invalidate fallback. Open for HMR runtime and dev server tickets: stable ids without a compiler, initialising new fields on live instances, who writes import.meta.hot.accept. Some claims are summaries, verify before they become spec rules.
---
<!-- COMMENTS:END -->
