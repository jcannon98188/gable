# Accessibility checks

`gable-check` (and the editor plugin) lint templates for common accessibility mistakes. They look at the template markup only, so a binding such as `[alt]="x"` or `[attr.aria-label]="x"` counts as the attribute being present, and a custom element (a tag with a hyphen) is trusted to handle its own semantics.

All of these rules are warnings by default: they report but do not fail `gable-check`. Set a rule to `"error"` to fail CI on it, or `"off"` to silence it, under `rules` in the plugin entry of `tsconfig.json`:

```json
{ "name": "@gable/language-service", "rules": { "a11y-heading-order": "off", "a11y-img-alt": "error" } }
```

| Rule | Reports |
| --- | --- |
| `a11y-img-alt` | `<img>` with no `alt` (use `alt=""` for decorative images, or `role="presentation"`). |
| `a11y-control-name` | A `<button>` or `<a href>` with no text, `aria-label`, `aria-labelledby` or `title`; an `<input>`, `<select>` or `<textarea>` with no wrapping `<label>`, no `<label for>` matching its `id`, and no `aria-label`/`aria-labelledby`. A placeholder is not a label. |
| `a11y-aria-valid` | A `role` that is not a WAI-ARIA role, an `aria-*` attribute that does not exist (with a suggestion for near misses), and static values outside the allowed set (`aria-hidden="yes"`). |
| `a11y-click-key` | A `(click)` handler on a non-interactive element (`div`, `span`, `li`...) without a `role` or without a `(keydown)`/`(keyup)` handler. Prefer a `<button>`. |
| `a11y-tabindex-positive` | `tabindex` greater than 0, static or a literal binding. Use `0` or `-1` and order the DOM instead. |
| `a11y-heading-order` | A heading that skips a level (`<h1>` then `<h3>`) within one component template. `@if` and `@switch` branches are alternatives, each starting from the heading level before them. |
| `a11y-autofocus` | `autofocus` anywhere except inside a `<dialog>` or `role="dialog"`/`"alertdialog"`. |

These rules cover what can be seen statically. They do not replace testing with real assistive technology or an automated audit of the rendered page.

## Live announcements and focus at runtime

`LiveAnnouncer` speaks a message to screen readers without moving focus. Inject it from `@gable/core/renderer` in a component or service (a toast, a "3 results" status, a form error summary):

```ts
import { inject } from '@gable/core';
import { LiveAnnouncer } from '@gable/core/renderer';

class Cart {
  #live = inject(LiveAnnouncer);
  add(item: string) {
    this.#live.announce(`${item} added to cart`); // polite: waits for the reader to finish
  }
  fail() {
    this.#live.announce('Payment failed', 'assertive'); // interrupts
  }
}
```

The DOM renderer keeps two visually hidden regions (`role="status"` and `role="alert"`) in its `overlayRoot` option, or `document.body`, created when the service is first injected. Announcing the same text twice in a row is heard twice. `clear()` empties both regions. Empty messages are ignored. Under the test renderer, `app.announcer.messages` lists every announcement with its politeness.

`FocusManager` (same import) moves focus to the first element matching a selector, or a list of selectors tried in order, adding `tabindex="-1"` when needed; it returns whether anything was focused. The router uses it after each navigation; see [Router accessibility](router.md#accessibility-announcements-and-focus) for the options.
