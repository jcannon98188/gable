# Manual setup

Add Gable to an existing Vite and TypeScript app. For a new app use [Getting started](./getting-started.md); it is the same setup, scaffolded.

## 1. Install

```
npm install @gable/core @gable/renderer-dom rxjs
npm install -D @gable/vite @gable/testing @gable/language-service @gable/prettier-plugin typescript vitest
```

Keep every `@gable/*` package on the same version (the starter pins them with `~`). `rxjs` is a peer dependency of `@gable/core`. Vite 8 or newer is required.

## 2. Add the Vite plugin

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

Put `gable()` in `plugins`. Tailwind is optional; it is shown because the starter uses it.

## 3. Meet the tsconfig requirements

`@gable/vite` reads your `tsconfig.json` (following `extends` and project references) and stops with a clear error if any of these hold:

- `useDefineForClassFields` is `false`. Gable needs native class fields.
- `experimentalDecorators` or `emitDecoratorMetadata` is `true`. Gable components use no decorators.
- `target` is older than `ES2022` and `useDefineForClassFields` is not `true`.

A matching configuration:

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

Component and service classes have no constructors; use field initialisers and `inject()`.

## 4. Wire the language service

The `plugins` entry above enables the template checks in editors and in the CLI. Install the VS Code extension `gable.gable-vscode` and point the editor at the workspace TypeScript:

<!-- template: .vscode/settings.json -->
```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true
}
```

Add a script so CI fails on template errors:

```json
"check": "tsc --noEmit && gable-check"
```

## 5. Add the entry file

<!-- template: src/main.ts -->
```ts
import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import "./global.css";
import { Root } from "./root.js";

bootstrap(Root, { renderer: dom(), target: "#app" });
```

`bootstrap` takes the root component and a renderer. `dom()` from `@gable/renderer-dom` renders into the page; `target` is a selector for the host element. Your `index.html` needs that element and a module script pointing at this file:

<!-- template: index.html -->
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{name}}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## 6. Choose the renderer for the language service

The language service checks templates against a renderer's elements and events. Set `renderer` in the plugin entry (shown in the tsconfig above) to the package you pass to `bootstrap`: `@gable/renderer-dom`.

## 7. Tests and formatting

Tests import `mount` from `@gable/testing` and run under Vitest; set `test.include` in `vite.config.ts` as above. For formatting, add the plugin to `.prettierrc.json`:

<!-- template: .prettierrc.json -->
```json
{
  "plugins": ["@gable/prettier-plugin"],
  "printWidth": 100
}
```

## Trying unpublished builds

The `@gable/*` packages are not published yet. From a checkout of the Gable monorepo, run `npm run build`, then `npm pack ./packages/<name> --pack-destination <dir>` for `core`, `renderer-dom`, `testing`, `vite`, `language-service`, `prettier-plugin` and `template-format`. In your project, replace each `@gable/*` version with `file:<dir>/<tarball>` and add the same entries under `overrides`, because the packages depend on each other. `packages/create-gable/src/scaffold.test.ts` does exactly this to test the starter in CI.
