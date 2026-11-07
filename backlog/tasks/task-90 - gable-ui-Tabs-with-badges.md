---
id: TASK-90
title: 'gable-ui: Tabs with badges'
status: Done
assignee: []
created_date: '2026-11-07T15:21:00Z'
updated_date: '2026-11-07T15:29:00Z'
labels:
  - gable-ui
dependencies: []
priority: medium
ordinal: 151000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported while building the designer shell: ui-tab has only a text label, so a count or status badge beside a tab label needs a custom trigger.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ui-tab accepts a badge (text or number) shown after the label, styled for selected and compact density, and included in the trigger's accessible name
- [x] #2 Unit tests, an axe check and a gallery demo
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add badge input to ui-tab, render span inside trigger; tests + gallery demo
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Tests in packages/ui/src/components/tabs.test.ts; gallery 'Tabs with badges' demo; gallery a11y axe test covers it. Not browser-verified.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ui-tab gains badge input (string|number) rendered after the label inside the trigger (selected + compact styling). Unit tests, gallery demo (covered by existing gallery axe test) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
