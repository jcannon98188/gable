---
id: TASK-52
title: 'gable-ui: OTP input (Input OTP)'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T03:32:00Z'
updated_date: '2026-11-07T04:57:00Z'
labels:
  - ui
dependencies: []
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
shadcn's Input OTP uses input-otp. Zag has pin-input, which is a close fit but is a separate machine with its own parts and paste handling. Deferred from TASK-28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A segmented one-time-code input with paste, backspace and arrow-key handling that works with the [field] directive
- [x] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Evaluate @zag-js/pin-input. 2. Native ui-input-otp (one file) with registry-meta entry. 3. jsdom tests incl. axe and [field]. 4. Gallery page otp.html with demo and test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: native, not @zag-js/pin-input. It is not installed (adding it means touching shared package.json/lockfile), and its machine would keep a second copy of the value beside the value model that [field] needs; the behaviour (type, paste, backspace, arrows, autofill, complete) is ~100 lines. Value is a gapless string; one input per box, first box has autocomplete=one-time-code; touched fires only when focus leaves the whole control. Tests: packages/ui/src/components/input-otp.dom.test.ts (14 pass incl. axe and [field]); packages/ui and ui-primitives suites 225 pass; tsc -p tsconfig.build.json clean. Gallery page examples/ui-gallery/otp.html + src/otp-demo.ts + test: test passed when run against package source (temp copy); not run in the gallery itself, which needs npm run pack:local, and not checked in a real browser.

Second pass: dir input (auto follows nearest dir attribute) swaps ArrowLeft/ArrowRight under rtl. Tests added.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added ui-input-otp (packages/ui/src/components/input-otp.ts, registry-meta + index export), native implementation. Verified by jsdom tests incl. axe and [field]. Gallery page added but not verified inside the gallery (needs pack:local) or a browser, so AC3 is left unchecked.
<!-- SECTION:FINAL_SUMMARY:END -->
