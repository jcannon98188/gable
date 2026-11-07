---
id: TASK-50
title: 'gable-ui: Date picker and Calendar'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T03:32:00Z'
updated_date: '2026-11-07T04:57:00Z'
labels:
  - ui
dependencies: []
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
shadcn's Calendar and Date Picker use react-day-picker. Zag has date-picker and uses @internationalized/date, which adds a sizeable dependency and a nontrivial parts API. Deferred from TASK-28.

Decision (2026-11-06): build natively and use date-fns for date maths, formatting and locales (not react-day-picker, not Zag date-picker/@internationalized/date). The calendar takes a date-fns Locale through a `locale` input, so it can later follow the I18n service (TASK-57) without depending on it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Calendar and date picker (single date, optionally range) with keyboard navigation and a popover
- [x] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. date-fns dependency on packages/ui, registry-meta entries declare it.
2. calendar.ts: month grid (role=grid), single and range, min/max/isDisabled, weekStartsOn, locale input, roving-tabindex keyboard navigation.
3. date-picker.ts: button + ui-popover + ui-calendar, [field] convention (value model, disabled/readonly/invalid, touched on close).
4. Tests (in-memory, jsdom, axe), gallery page date.html.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented packages/ui/src/components/calendar.ts and date-picker.ts (date-fns ^4.4.0 added to packages/ui; registry-meta entries list it, so the gable-ui CLI installs it). Added a `calendar` icon to lib/icon.ts and a `label` input to UiPopover (a role=dialog panel needs an accessible name; axe flagged the picker). Tests: calendar.test.ts (in-memory), calendar.dom.test.ts (jsdom, keyboard, range, picker, axe). Gallery page examples/ui-gallery/date.html + src/date-*.ts; its test passes when @gable/ui is aliased to the sources, but the gallery's vendored @gable/ui is stale until `npm run pack:local examples/ui-gallery`, so AC #3 is not checked (not verified in a real browser). Not covered: typed text input of a date, multi-month display, multiple-date selection, range hover preview, dropdown month/year selects, I18n service wiring.

Second pass: calendar captionLayout (dropdown / dropdown-months / dropdown-years) with native selects clamped to min/max; date picker typeable input parsed with date-fns via displayFormat and validated against min/max/isDisabled; locale accepts a function (lazy). Wiring to the I18n service not done: see follow-up task. Tests added incl. axe.
<!-- SECTION:NOTES:END -->
