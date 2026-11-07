---
id: TASK-28
title: Port remaining gable-ui components, including Form and Field
status: Done
assignee:
  - '@claude'
created_date: 2026-11-07 02:24
updated_date: '2026-11-07T03:33:00Z'
labels:
  - ui
  - ready-for-agent
dependencies:
  - TASK-26
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the rest of the shadcn set over the primitives, in batches. Form and Field are built on the existing signal-based forms layer in core (forms.ts) with validation and error display. Add-ons without a Gable equivalent (command palette, toasts, drawer, carousel, date picker, charts, OTP input, resizable panels) are listed here and split into their own tasks as they are reached.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Remaining core shadcn components are ported with tests
- [x] #2 Form and Field work with Form<T> and the schema validators
- [x] #3 Add-on components are each filed as separate tasks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built all 28 listed components plus Form/Field, one file per component in packages/ui/src/components, listed in packages/ui/src/registry-meta.ts (COMPONENT_META, LIB_META; registry-meta.test.ts checks it against real imports and that every file is registered). Zag machines exposed as *State classes in packages/ui-primitives/src/machines.ts with generic [uiProps] and [uiPopup] directives. New Zag deps: accordion, collapsible, checkbox, switch, radio-group, slider, toggle-group, toggle, progress, avatar, pagination, scroll-area, hover-card; @zag-js/combobox also added to packages/ui deps. Form/Field: ui-form takes [submit]="form.submit" and [action], emits submitted; ui-field takes [state]="form.x.state" (a Field or Form passed directly trips the bare-signal check, and a directive output on a native <form> trips unknown-event, hence the component and state inputs); uiFieldControl wires id/aria-describedby/aria-invalid. Errors show when touched or submitted; message precedence: error.message, messages[kind], built-in defaults. Tests: display.test (in-memory), controls/selection/overlays2/form .dom.test (jsdom). Gallery extended; npm run build, test and check pass after pack:local. TODO(TASK-36) notes in dropdown-menu.ts and pagination.ts (flag fields that become a compared kind). Follow-ups filed: TASK-46..TASK-54 (label ui).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ported the remaining core shadcn components (Label, Input, Textarea, Checkbox, Switch, Radio Group, Slider, Toggle, Toggle Group, Badge, Card, Alert, Separator, Skeleton, Progress, Avatar, Accordion, Collapsible, Dropdown Menu, Context Menu, Combobox, Alert Dialog, Sheet, Table, Breadcrumb, Pagination, Scroll Area, Hover Card) over new Zag state classes, and added Form and Field on core forms with label, description and error display. Added registry-meta.ts for the CLI. Verified: npx vitest run packages/ui packages/ui-primitives (141 passing), tsc on ui, gallery build/test/check. Add-ons without a Gable equivalent filed as TASK-46 to TASK-53, plus TASK-54 for menu submenus/radio items, range slider and multi-select combobox. Risks: scroll area and hover card are only lightly tested (jsdom has no layout); Select lacks invalid/touched for [field] yet.
<!-- SECTION:FINAL_SUMMARY:END -->
