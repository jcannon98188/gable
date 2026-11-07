# @gable/core

The framework itself: components, signals, dependency injection, control-flow templates, a router, forms, an HTTP client and i18n. Components are plain classes with a static `meta`, state lives in field initialisers, and there are no decorators and no base class. The DOM is one renderer behind a seam (`@gable/renderer-dom`), so tests can run on an in-memory renderer with no jsdom.

## Install

```
npm install @gable/core @gable/renderer-dom rxjs
```

`npm create gable@latest my-app` sets all of this up, with Vite, TypeScript and the language service. See [Getting started](../getting-started.md) or [Manual setup](../manual-setup.md) for an existing app.

## A component

```ts
import { computed, html, signal } from "@gable/core";

export class Counter {
  static meta = {
    selector: "app-counter",
    template: html`
      <p>Count: {{ count() }} (doubled: {{ doubled() }})</p>
      <button (click)="increment()">+1</button>
    `,
  };

  count = signal(0);
  doubled = computed(() => this.count() * 2);

  increment() {
    this.count.update((n) => n + 1);
  }
}
```

Templates are static `html` strings with no `${}` holes, so Gable can check them against your class. Expressions stay simple: property and signal reads, literals, `!`, `??`, comparisons and `&&` or `||`. Derived values belong in `computed` signals. Start the app with `bootstrap(Root, { renderer: dom(), target: "#app" })`.

## Signals, live

Press the buttons below. Only the text that actually changed is written to the page, and `parity` re-runs without repainting when `a` changes by 2.

```demo signals
The source below is the real demo component.
```

## What else is in the package

The main entry point exports `signal`, `computed`, `effect`, `input`, `output`, `model`, `inject`, `createComponent`, `bootstrap`, `ErrorHandler`, `ErrorBoundary` and `provideI18n`. The rest sits behind subpath entry points: `@gable/core/router`, `/forms`, `/http`, `/i18n`, `/rxjs`, `/renderer`, `/hmr` and `/devtools`.

- The [router guide](../router.md) covers routes, params, guards, lazy loading, hash mode and focus management.
- The [error handling guide](../errors.md) covers the error handler, reporting and error boundaries.
- The [i18n guide](../i18n.md) covers catalogs, plurals, formatting and extraction.
- The [performance guide](../performance.md) explains how updates are scheduled and how to keep them cheap.

Every exported symbol is documented in the API reference, linked below.
