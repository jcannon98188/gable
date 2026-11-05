<img src="assets/icon.svg" width="64" height="64" alt="">

# Gable

A client-side web framework that keeps the best of Angular (components, dependency injection, a router, forms, an HTTP client, strong template tooling) with **true hot module replacement** and **no framework-specific compiler**.

- **No framework compiler.** Templates are `html` tagged template literals, parsed at runtime. TypeScript transpiling and general-purpose bundlers (Vite) are fine; nothing has to understand Gable's templates.
- **True HMR.** Edit a component, template, style or service and the running app updates in place with state carried over: no reload.
- **Signals and RxJS, both first-class.** State is TC39-style signals. Async and events are RxJS Observables. Templates bind either directly.
- **Pluggable renderer.** The DOM is one renderer behind a small seam; the test harness uses an in-memory one.
- **Template tooling.** A language service type-checks templates against component classes in the editor and in CI.

> Status: pre-1.0. The API can still change. All packages are at `0.0.0` in this repo.

## A taste

```ts
import { computed, html, inject, signal } from "@gable/core";
import { CounterStore } from "./counter-store.js";

export class Counter {
  static meta = {
    selector: "app-counter",
    template: html`
      <p>Count: {{ count() }} (doubled: {{ doubled() }})</p>
      <button (click)="increment()">+1</button>
      <button (click)="save()">Save</button>
      @if (status()) {
        <p>{{ status() }}</p>
      }
    `,
  };

  store = inject(CounterStore);
  count = signal(0);
  doubled = computed(() => this.count() * 2);
  status = computed(() => {
    const saved = this.store.saved();
    return saved === null ? "" : `Saved: ${saved}`;
  });

  increment() {
    this.count.update((n) => n + 1);
  }
  save() {
    this.store.save(this.count());
  }
}
```

```ts
import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { Root } from "./root.js";

bootstrap(Root, { renderer: dom(), target: "#app" });
```

## Core ideas

- **Components** are plain classes with a `static meta` object (`selector`, `template`, `imports`, ...). No decorators, no base class.
- **State** lives in signals (`signal`, `computed`). Plain fields do not trigger updates.
- **Templates** read signals by calling them (`count()`). Value expressions stay simple: property reads, signal reads, literals, `!` and `??`. Derived values belong in `computed` signals, not in the template, and the language service offers quick fixes that extract them.
- **Control flow** uses blocks: `@if`, `@for (x of xs(); track x.id)`, `@switch`, `@let`, `@defer`.
- **Observables and Promises** bind directly: a bare reference such as `user$` shows the latest value (`undefined` until the first emission).
- **Dependency injection** is hierarchical, with `inject()` and a single injector tree. A service sets `static scope = "root"` to be an app-wide singleton.
- **HMR** swaps classes in place and carries over fields with the same name and kind. Opt a class out with `static hmr = "reset"`.

## Packages

All packages share one version number and are released together.

| Package | What it is |
| --- | --- |
| `@gable/core` | Runtime: signals, components, DI, templates, plus the `/router`, `/forms`, `/http`, `/rxjs` and `/hmr` entry points |
| `@gable/renderer-dom` | The DOM renderer |
| `@gable/vite` | Vite plugin: dev-only HMR wiring and tsconfig checks |
| `@gable/testing` | Test harness with an in-memory renderer (`mount`) |
| `@gable/language-service` | Template type-checking: tsserver plugin and the `gable-check` CLI |
| `@gable/template-format`, `@gable/prettier-plugin` | Template formatter and its Prettier plugin |
| `gable-vscode` | VS Code extension: diagnostics, completions and highlighting for templates |
| `create-gable` | `npm create gable` project starter |

`rxjs` is a peer dependency of `@gable/core`.

## Getting started

```sh
npm create gable@latest my-app
cd my-app
npm install
npm run dev
```

The starter gives you a counter app with Vite, TypeScript, Tailwind, tests, formatting and the language service already wired up. See [Getting started](docs/getting-started.md) for a tour and an HMR walkthrough, or [Manual setup](docs/manual-setup.md) to add Gable to an existing Vite and TypeScript app.

Since the packages are not yet published to npm, work from this repository until they are.

## Develop this repo

This is an npm workspaces monorepo.

```sh
npm install
npm run build   # build every package
npm test        # run the Vitest suite
```

Versioning uses [Changesets](https://github.com/changesets/changesets) (`npm run changeset`) with all packages in lockstep. CI is in `.github/workflows/ci.yml`.

## Project documentation

- `GLOSSARY.md`: the project's vocabulary.
- `backlog/`: design decisions and implementation tasks, managed with [Backlog.md](https://github.com/MrLesk/Backlog.md).
- `docs/`: user documentation.
