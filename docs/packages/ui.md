# @gable/ui

gable-ui: shadcn-style components for Gable, built on [@gable/ui-primitives](./ui-primitives.md). Buttons, forms, overlays, menus, navigation, tables, charts, a calendar, a tree, a code block and more, in the shadcn neutral style with Tailwind v4, `tw-animate-css`, lucide icons and CSS variables for the theme. Like shadcn, the components are meant to be copied into your app and owned by you. The [gable-ui CLI](./gable-ui.md) does the copying.

## Install

Use the CLI rather than depending on the package:

```
npx gable-ui init
npx gable-ui add button dialog select
```

`init` writes `gable-ui.json`, sets up Tailwind and the theme, and `add` copies each component and its helpers into `src/components/ui` and `src/lib/ui`. The package itself is still private while nothing is published.

## Using a component

Components are plain Gable classes, and simple ones are attribute directives so the element stays native:

```ts
import { html, signal } from "@gable/core";
import { UiButton } from "./components/ui/button.js";
import { UiDialog } from "./components/ui/dialog.js";

export class Page {
  static meta = {
    selector: "app-page",
    imports: [UiButton, UiDialog],
    template: html`
      <button uiButton variant="outline" size="sm" (click)="open.set(true)">Edit profile</button>
      <ui-dialog [(open)]="open" heading="Edit profile">
        <p>Dialog body.</p>
      </ui-dialog>
    `,
  };
  open = signal(false);
}
```

## Key concepts

- **Variants are computed class strings.** Templates cannot call functions, so each component computes its classes in a `computed` with `variants()`, a small class-variance-authority, and binds the result. `buttonVariants({ variant, size })` is exported so an anchor or another component can borrow the look.
- **You can override anything.** A `class` (or `*Class`) input is merged last with `tailwind-merge`, so your utilities win conflicts. The demo below runs the real `buttonVariants` and `cn`.
- **State drives animation.** `data-state="open|closed"` selects the enter and exit animations, and `usePresence` delays `hidden` so the exit plays.
- **Form controls follow one convention.** `[field]` binds a signal-form field, with a `value` model, `invalid`, `disabled` and a `touched` output. `ui-form`, `ui-field` and `uiFieldControl` add labels, descriptions and error text over `Form<T>`.
- **Machines come from the primitives.** Dialog, popover, tabs, tooltip and select are `*State` classes in `@gable/ui-primitives`, and parts in projected content are wired by the parent with `contentChild` and an effect (the owner push).

```demo ui-variants
Pick a variant and size, then add your own class to see tailwind-merge resolve the conflict.
```

## Why there is no live component demo here

The components are styled entirely with Tailwind utility classes (`bg-primary`, `h-9`, `focus-visible:ring-[3px]` and so on) and read the theme from CSS variables. This site does not load Tailwind, so a live `<button uiButton>` would render unstyled and misrepresent the library. Rather than ship a fake, the demo above shows what the components actually compute, and the primitives guide has live, self-styled demos of the behaviour underneath. To see the full set styled, run the gallery from the repository: `npm run pack:local examples/ui-gallery`, then `npm install` and `npm run dev` in that folder. One exception is already in use on this site: the code block's tokenizer (`tokenize` in `lib/highlight.ts`) is a pure function with no Tailwind dependency, and it colours the code samples in these docs.

## What is in the package

Button, Button Group, Dialog, Alert Dialog, Sheet, Drawer, Popover, Tooltip, Hover Card, Dropdown Menu, Context Menu, Select, Combobox, Command, Tabs, Accordion, Collapsible, Input, Textarea, Checkbox, Switch, Radio Group, Slider, Toggle, Toggle Group, Input OTP, Calendar, Date Picker, Form and Field, Table, Virtual List, Virtual Table, Tree, JSON Viewer, Code Block, Chart, Carousel, Resizable panels, Sortable, Toast, Badge, Card, Alert, Avatar, Progress, Skeleton, Separator, Breadcrumb, Pagination and Scroll Area. One file per component sits in `src/components`, with the helpers (`cn`, `variants`, `useHostClass`, `UiIcon`) in `src/lib`, so a component can be copied on its own.

Per-component notes (toast, tree, code block, calendar locale, resizable panels, button group) are in the [primitives and gable-ui notes](../ui-primitives.md).

Every exported symbol is documented in the [API reference](/docs/ui/api).
