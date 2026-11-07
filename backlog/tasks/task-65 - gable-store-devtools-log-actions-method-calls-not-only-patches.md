---
id: TASK-65
title: '@gable/store devtools: log actions (method calls), not only patches'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T05:01:00Z'
updated_date: '2026-11-07T05:28:00Z'
labels:
  - store
dependencies: []
priority: low
ordinal: 113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
withDevtools only logs patchState changes. Method wrappers are blocked because store members are defined non-configurable; either wrap in withMethods or add an opt-in actions wrapper.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
withMethods wraps methods only under DEV (instrument() in store.ts); withDevtools registers an action wrapper and logs 'action' entries {name,args,patches,error?}; sync patches grouped, async/rxMethod-pipeline patches stay as 'patch' entries. devtools-prod.test.ts bundles with __GABLE_DEV__ false and asserts devtools code absent.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Store devtools now logs actions with args summary and grouped patches; dev-only, dead-code test added; docs/store.md and docs/devtools.md updated.
<!-- SECTION:FINAL_SUMMARY:END -->
