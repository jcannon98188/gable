# Getting started

This page takes you from nothing to a running Gable app, then teaches hot module replacement (HMR) by editing the sample. The code below is the starter template, file for file; `create-gable` copies it and substitutes the project name and versions (`{{name}}` and `{{version}}` in the listings).

## Create the project

```
npm create gable@latest my-app
cd my-app
npm install
npm run dev
```

`create-gable` asks only for a project name (or takes it as the argument) and has no other options. It detects the package manager that ran it (`npm`, `pnpm`, `yarn` or `bun`) and prints the matching commands. The template ships no lockfile; your first install creates one. The `@gable/*` packages are pinned with `~` to the `create-gable` release that made the project, so they stay in lockstep.

Open the URL the dev server prints. You should see "Hello, Gable" and a counter.

## What is in the project

- `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`: Vite, TypeScript and the scripts `dev`, `build`, `preview`, `test`, `check` and `format`.
- `src/main.ts`, `src/root.ts`, `src/counter.ts`, `src/counter-store.ts`, `src/counter.test.ts`, `src/global.css`: the app.
- `.prettierrc.json`, `.vscode/`: formatting and editor settings.

Files are kebab-case with no role suffix, one class per file, and tests sit beside the source.

### package.json

<!-- template: package.json -->
```json
{
  "name": "{{name}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "check": "tsc --noEmit && gable-check",
    "format": "prettier --write ."
  },
  "dependencies": {
    "@gable/core": "~{{version}}",
    "@gable/renderer-dom": "~{{version}}",
    "rxjs": "^7.8.2"
  },
  "devDependencies": {
    "@gable/language-service": "~{{version}}",
    "@gable/prettier-plugin": "~{{version}}",
    "@gable/testing": "~{{version}}",
    "@gable/vite": "~{{version}}",
    "@tailwindcss/vite": "^4.3.4",
    "prettier": "^3.9.0",
    "tailwindcss": "^4.3.4",
    "typescript": "^7.0.2",
    "vite": "^8.3.6",
    "vitest": "^5.1.0"
  }
}
```

### vite.config.ts

<!-- template: vite.config.ts -->
```ts
import tailwindcss from "@tailwindcss/vite";
import { gable } from "@gable/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tailwindcss(), gable()],
  test: { include: ["src/**/*.test.ts"] },
});
```

`gable()` adds HMR to the dev server only (production builds contain no HMR code) and checks that your `tsconfig.json` keeps native class fields. Tailwind v4 comes from `@tailwindcss/vite`.

### tsconfig.json

<!-- template: tsconfig.json -->
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "useDefineForClassFields": true,
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "types": ["vite/client"],
    "plugins": [{ "name": "@gable/language-service", "renderer": "@gable/renderer-dom" }]
  },
  "include": ["src", "vite.config.ts"]
}
```

The `plugins` entry wires the Gable language service into the editor and into `gable-check`. `renderer` names the renderer package whose elements and events templates are checked against.

### src/main.ts

<!-- template: src/main.ts -->
```ts
import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import "./global.css";
import { Root } from "./root.js";

bootstrap(Root, { renderer: dom(), target: "#app" });
```

### src/root.ts

<!-- template: src/root.ts -->
```ts
import { html } from "@gable/core";
import { Counter } from "./counter.js";

export class Root {
  static meta = {
    selector: "app-root",
    imports: [Counter],
    template: html`
      <main class="mx-auto max-w-md p-8">
        <h1 class="text-2xl font-bold">Hello, Gable</h1>
        <app-counter></app-counter>
      </main>
    `,
  };
}
```

### src/counter.ts

<!-- template: src/counter.ts -->
```ts
import { computed, html, inject, signal } from "@gable/core";
import { CounterStore } from "./counter-store.js";

export class Counter {
  static meta = {
    selector: "app-counter",
    template: html`
      <p class="my-4">Count: {{ count() }} (doubled: {{ doubled() }})</p>
      <button class="inc rounded bg-sky-600 px-3 py-1 text-white" (click)="increment()">+1</button>
      <button class="save rounded border px-3 py-1" (click)="save()">Save</button>
      @if (status()) {
        <p class="saved mt-4">{{ status() }}</p>
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

### src/counter-store.ts

<!-- template: src/counter-store.ts -->
```ts
import { signal } from "@gable/core";

/** A root-scoped service: one instance for the whole app, shared by every component that injects it. */
export class CounterStore {
  static scope = "root";

  saved = signal<number | null>(null);

  save(value: number) {
    this.saved.set(value);
  }
}
```

### src/counter.test.ts

<!-- template: src/counter.test.ts -->
```ts
import { describe, expect, it } from "vitest";
import { mount } from "@gable/testing";
import { Counter } from "./counter.js";

describe("Counter", () => {
  it("counts up and shows the doubled value", async () => {
    const fixture = mount(Counter);
    expect(fixture.text()).toContain("Count: 0 (doubled: 0)");

    fixture.dispatch(fixture.query("button.inc")!, "click");
    await fixture.flush();

    expect(fixture.text()).toContain("Count: 1 (doubled: 2)");
  });

  it("saves the count to the injected service", async () => {
    const fixture = mount(Counter);
    fixture.dispatch(fixture.query("button.inc")!, "click");
    fixture.dispatch(fixture.query("button.save")!, "click");
    await fixture.flush();

    expect(fixture.query("p.saved")?.children[0]?.text).toBe("Saved: 1");
  });
});
```

### src/global.css

<!-- template: src/global.css -->
```css
@import "tailwindcss";
```

### .prettierrc.json

<!-- template: .prettierrc.json -->
```json
{
  "plugins": ["@gable/prettier-plugin"],
  "printWidth": 100
}
```

### .vscode/extensions.json

<!-- template: .vscode/extensions.json -->
```json
{
  "recommendations": ["gable.gable-vscode", "esbenp.prettier-vscode"]
}
```

### .vscode/settings.json

<!-- template: .vscode/settings.json -->
```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true
}
```

## Learn HMR by editing the sample

Keep `npm run dev` running, click "+1" a few times, then edit and save. The count survives every edit below.

1. **Template.** In `src/counter.ts`, change the "+1" button text or its Tailwind classes. The view updates in place and the count is kept.
2. **Computed field.** Change `doubled = computed(() => this.count() * 2)` to multiply by 3. The displayed value updates at once, using the new rule and the current count.
3. **Service.** Click "Save", then in `src/counter-store.ts` change `save` so it stores `value + 100`. The service is re-created with its state carried over, and every component that injected it is rebuilt against it. The saved value stays; the next "Save" uses the new code.

When a class changes, Gable builds a new instance, carries over fields with the same name and kind (writable signals, models, plain data), initialises new fields, drops removed ones, and rebuilds the view. Focus, selection, scroll position and form-control values are restored where the markup did not change.

### Day-one limits

- **Renamed fields lose their value.** State is matched by field name, so renaming `count` to `total` starts `total` at its initial value.
- **Module-level state resets.** A top-level `signal(...)` resets when its module is edited. Keep long-lived state in a service.
- **Opt out per class.** Add `static hmr = "reset"` to a component or service to get fresh state on every edit of it.
- **Broken code leaves the app alone.** A syntax error or a throwing module is reported in the overlay and the running app is untouched; fix the file and save.

## Test

```
npm test
```

`src/counter.test.ts` mounts `Counter` with `mount` from `@gable/testing`, drives it through the test renderer (no browser, no DOM) and reads the result with `fixture.text()` and `fixture.query()`. The root-scoped `CounterStore` resolves without any setup; pass `providers` to `mount` to replace it.

## Check

```
npm run check
```

Runs `tsc --noEmit` and then `gable-check`, which type-checks the `html` templates against their component classes (unknown members, a signal read without `()`, wrong event names and more). It exits non-zero on errors, so use it in CI. In VS Code, install the recommended **Gable** extension (`gable.gable-vscode`) to see the same diagnostics, completions and highlighting as you type. The extension uses the workspace TypeScript through `typescript.tsdk` in `.vscode/settings.json`.

## Format

`npm run format` runs Prettier with `@gable/prettier-plugin`, which formats the HTML inside `html` templates as well as the TypeScript.

## Build

```
npm run build
npm run preview
```

The production bundle contains no HMR code.

## Adding Gable to an existing Vite app

See [Manual setup](./manual-setup.md).
