---
id: TASK-79
title: 'gable-ui: Tree adopted for the designer''s route tree'
status: Done
assignee: []
created_date: '2026-11-07T06:37:00Z'
updated_date: '2026-11-07T06:50:00Z'
labels:
  - gable-ui
dependencies: []
priority: medium
ordinal: 136000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shell's page mode renders the route tree as a flat list indented by depth (page-mode.ts:75 TODO(gable-ui)). Find what the existing ui-tree lacks for that use and close the gap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A route-tree style demo (nested routes, a selected node, per-row trailing content such as a badge or actions) in the gallery and a test
- [x] #2 ui-tree supports per-row custom content (slot or template) and a row action area without breaking keyboard navigation
- [x] #3 Gaps found are fixed or recorded as follow-up tasks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Tree: per-node 'content' slot is not possible with static templates; add TreeNode.badge (text+variant) trailing content and 'actionsAlways' persistent action area, keep keyboard nav. 2. Route-tree demo section in tree.html + test. 3. Record gaps.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added TreeNode.badge, TreeAction.icon, tree inputs stacked/wrap/actionsAlways, title tooltip on labels; ui-tree now imports ui-badge. Demo: tree.html Route tree section. Gaps recorded: arbitrary per-row template slot not possible with static templates (data-driven badge/description/actions instead); ArrowLeft/Right between row actions not added. Tests: tree.route.dom.test.ts (4), tree-demo.test.ts, 19 existing tree tests pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented with unit, DOM, axe and gallery tests; typecheck:tests and build pass; packages/ui + ui-primitives suites and gallery suite pass. See implementation notes for limitations and follow-ups. Not verified in a real browser.
<!-- SECTION:FINAL_SUMMARY:END -->
