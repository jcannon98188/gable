---
id: TASK-104.9
title: How do assets load and how do loading states show in templates?
status: To Do
assignee: []
created_date: '2026-11-12T06:09:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-104.3
parent_task_id: TASK-104
ordinal: 232000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Decide how textures, spritesheets, bitmap fonts and web fonts load through Pixi's Assets system in a declarative app: how a template refers to an asset (by alias, URL, import), where bundles and manifests are declared, how loading, error and ready states surface as signals and in templates (an @defer-like or @if over a loading signal), caching and lifetime (texture destroy when a node is removed), and the Vite story for hashed asset URLs.
<!-- SECTION:DESCRIPTION:END -->
