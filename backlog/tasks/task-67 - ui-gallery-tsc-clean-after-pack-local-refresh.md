---
id: TASK-67
title: 'ui-gallery: tsc clean after pack:local refresh'
status: To Do
assignee: []
created_date: '2026-11-07T05:01:00Z'
labels:
  - ui
dependencies: []
priority: medium
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
examples/ui-gallery tsc fails only because vendored @gable/ui tarball is stale (missing UiCarousel, UiCommand, etc., menu item kinds). Re-run npm run pack:local examples/ui-gallery and re-check tsc.
<!-- SECTION:DESCRIPTION:END -->
