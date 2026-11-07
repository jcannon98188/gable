# Items for Select, Combobox and Context Menu (TASK-24)

Gable has no `<ng-template>`/`TemplateRef` by design (TASK-1.4): reusable fragments are `html` template values passed through `${}` holes, or small components. This note checks whether Select options, Combobox items and Context Menu items can be built with what exists, using prototype tests in `packages/ui-primitives` (`items-*.proto.test.ts`, helpers in `items-proto.fixtures.ts`).

## Recommendation

**Data in, render out: items are data, rendered by `@for` in the declaring component, one directive per item element (option c). No template-ref language feature is needed, so there is no user decision to make.**

- Select and Combobox: the machine takes a `collection` prop built from a signal of data. The component renders `@for (row of rows(); track row.value) { <li [uiSelectItem]="row">...</li> }`. A `uiSelectItem` directive takes the item as an input and applies `getItemProps({ item })`.
- Per-item context (value, selected, highlighted, disabled) is a computed view model: `rows = computed(() => items().map(item => ({ ...item, ...api().getItemState({ item }) })))`. Templates cannot call methods or compute, so this matches the TASK-1.4 rule that view models carry derived values. Item bodies read `row.label`, `[class.on]="row.selected"`.
- Context Menu: Zag's menu has no collection. Items register through the DOM (item order and typeahead text come from the content element), so the same per-element directive (`[uiMenuItem]="value"`) works with `@for` or static markup.
- If an item body is bigger than a line, make it a small component with a `row` input (`<li [uiSelectItem]="row"><ui-option-row [row]="row"></ui-option-row></li>`; tested). This is the "small component" half of the TASK-1.4 fragment story.

## The three options, as tested

| | Result | Notes |
|---|---|---|
| (a) `${}` template value rendered per item with its own context | **Not possible today** | `html` holes are not implemented: `parseTemplate` throws "holes (${}) are not supported yet" (`packages/core/src/template.ts`). Even once they exist, a hole renders a fixed fragment, and its expressions have no per-item context beyond what the declaring component's scope gives it; the design says context travels as a computed view model, which is exactly what (c) already does. So a `${}` item body would add nothing for the machine, only for sharing markup. A small component covers that today. |
| (b) slot items collected with `contentChildren` | **Works for static content, with costs** | `<ui-select><ui-option value="a" label="A"></ui-option></ui-select>` works: the select collects the option components into its machine collection, options apply `getItemProps`, arrows, disabled skipping, Enter and typeahead all pass. Costs: (1) a second source of truth (items live in content, the collection is derived from them, and the machine is created with an empty collection before content exists); (2) projected content is injected from the declaring component, so options cannot inject the select state and the select must push itself into each option (an effect writing an `owner` signal); (3) **core bug: `contentChildren` never sees content created after the first projection**, so options added later by `@for`/`@if` are not collected (removal is tracked). Cause: `registerEntry` relies on `withContentTarget` being active, which it is only during the initial build of projected nodes (`query.ts`, `view.ts`). Captured as `it.fails` in `items-slots.proto.test.ts`. (4) Zag treats an element whose `localName` matches `/textarea|select/` as editable and ignores typeahead on it, so a custom element tag like `ui-select-option` silently breaks typeahead (tested; name it `ui-option`). |
| (c) items rendered from data with `@for` | **Works** | Select (in-memory renderer): roles, per-item context, open, arrows skipping disabled items, Enter selection, typeahead from collection labels, items added at runtime. Combobox (jsdom): filtering the collection from the input value, empty state, `aria-activedescendant`, arrow keys, Enter. Menu (jsdom): per-item directive from `@for`, disabled, click select, arrow navigation, typeahead, items added at runtime. |

## What the Zag machines need, and where each comes from

| Need | Select | Combobox | Menu |
|---|---|---|---|
| Collection | `collection` prop (data) | `collection` prop (data, filtered by a computed) | none |
| Item order / navigation | from the collection | from the collection | from the DOM (`querySelectorAll` in content) |
| Highlighted item | `highlightedValue` in machine, view model `highlighted` | same | `highlightedValue`, set via DOM item props |
| Typeahead | `collection.search` on labels (no DOM) | n/a (the input filters) | item text read from the DOM |
| Scroll highlighted into view | DOM (`scrollIntoView`/`scrollTo`) | DOM | DOM |

## Findings that affect implementation

1. **Combobox and Menu need a real DOM.** They call `CSS.escape`, `window`, `closest`, and focus APIs that the in-memory test renderer's Zag facade (`test-dom.ts`) does not model. Select works in the facade only after adding no-op `scrollTo`/`scrollIntoView` (done in the prototype fixture `provideItemsDom`). Plan on jsdom tests for Combobox and Menu, as the spike did for Dialog Escape handling. jsdom also needs a `CSS.escape` shim and the per-task rAF patch (see `dom.test.ts`).
2. **Required inputs are still unusable in item directives** (known from TASK-20): item inputs stay non-required with a null guard in the prop getter.
3. **New `contentChildren` bug** (above). It matters beyond UI: any component that collects slotted items (tabs, accordion) misses items rendered conditionally after first render. It should be filed as a core task. Fixing it would make option (b) viable for dynamic lists, but (c) would still be simpler.
4. **Tag names**: avoid `select` or `textarea` inside the tag name of item elements.
5. Zag packages needed: `@zag-js/select`, `@zag-js/combobox`, `@zag-js/menu` (the prototypes installed them with `npm install --no-save`; `packages/ui-primitives/package.json` and the lockfile were not changed).

## Decision needed from the user

None. Options (c) and small components cover Select, Combobox and Context Menu without a language-level template-ref feature. Revisit only if a component needs to accept caller-supplied item markup that cannot be expressed as a small component or a data-driven view model; then the cheaper move is to implement `${}` holes (already designed in TASK-1.4) rather than add template refs.

## Prototype tests

- `items-select.proto.test.ts` (in-memory renderer): option (c) for Select, 4 tests.
- `items-slots.proto.test.ts` (in-memory renderer): option (a) (holes throw; row component works) and option (b) (7 tests plus 1 expected failure documenting the `contentChildren` bug).
- `items-combobox-menu.proto.test.ts` (jsdom): Combobox and Menu, 6 tests.
