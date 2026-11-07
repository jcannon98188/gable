# gable-ui CLI and registry

`gable-ui` copies component source into your project, shadcn-style: you own the files afterwards. The source lives in `packages/ui` (`@gable/ui`); the CLI package is `packages/gable-ui`, versioned in lockstep with the rest of Gable (it is in the changeset `fixed` group next to `create-gable`). The registry is a component registry, not the npm registry.

```sh
npx gable-ui init
npx gable-ui add button dialog select
```

The package is still `"private": true` while nothing is published. One thing to settle before publishing: `npm pack` names the `@gable/ui` tarball `gable-ui-<version>.tgz`, the same as this package's tarball, so `scripts/pack-local.mjs` would collide the moment both are public. Rename or exempt one then.

## Commands

| Command | What it does |
| --- | --- |
| `gable-ui init` | Writes `gable-ui.json`, makes sure the stylesheet imports Tailwind and `tw-animate-css`, writes the theme (CSS variables and the Tailwind v4 `@theme` mapping) into it and adds `tailwindcss`, `@tailwindcss/vite` and `tw-animate-css` to `package.json`. Warns when the Vite config does not use `@tailwindcss/vite`. Running it again is safe. |
| `gable-ui add <component...>` | Copies each component plus everything it needs (helpers such as `cn`, `variants`, `host-class`, `icon`, and other components), rewrites their imports to your directories, applies any CSS the items carry, adds missing npm packages to `package.json` and runs your package manager's install. |
| `gable-ui build` | Generates a registry from a gable-ui source tree (see below). |

There is no `diff` command and no prompts: everything is a flag.

| Flag | Applies to | Meaning |
| --- | --- | --- |
| `--registry <dir\|url>` | all | Where components come from (below). `init` stores it in `gable-ui.json`, so `add` needs no flag afterwards. |
| `--local <dir>` | init, add | Install `@gable/*` from the tarballs in `<dir>` (made by `npm run pack:local`) instead of npm, and pin them in `overrides`; same as `create-gable --local`. |
| `--no-install` | init, add | Edit `package.json` but do not run the package manager. |
| `--overwrite`, `-o` | add | Replace files that already exist and differ. Without it they are kept, a warning is printed and the exit code is 1. Identical files are reported as unchanged. |
| `--components-dir`, `--utils-dir`, `--css`, `--base-color` | init | Override the config defaults. |
| `--ui <dir>`, `--out <dir>` | build | Source tree (default `.`) and output directory (default `./registry`). |

The package manager is taken from the lockfile in the project (pnpm, yarn, bun, npm), then from `npm_config_user_agent`. Only packages that are not already in `dependencies`, `devDependencies` or `peerDependencies` are added, and existing ranges are never changed.

## gable-ui.json

```json
{
  "componentsDir": "src/components/ui",
  "utilsDir": "src/lib/ui",
  "css": "src/global.css",
  "baseColor": "neutral",
  "registry": "../my-registry"
}
```

All paths are relative to the project root and must stay inside it. `registry` is optional (absent means the registry bundled with the CLI). Imports in copied files are rewritten as relative paths between the files' new locations, so no path aliases or tsconfig changes are needed; the `.js` extension style of the source is kept.

## Registry format

A registry is a directory of JSON files, so it can be served from a git repository today and from a URL later without changing the format.

```
registry/
  index.json
  items/
    button.json
    cn.json
    theme-neutral.json
    ...
```

`index.json`:

```json
{
  "name": "gable-ui",
  "formatVersion": 1,
  "version": "0.0.0",
  "baseColors": ["neutral"],
  "items": [{ "name": "button", "type": "component", "description": "...", "path": "items/button.json" }]
}
```

`items/<name>.json`:

| Field | Meaning |
| --- | --- |
| `name` | Unique across the registry. The file name without `.ts`. |
| `type` | `component`, `lib` (helper) or `style` (theme, installed by `init`, not `add`). |
| `description` | One line. |
| `files` | `[{ "path": "components/button.ts", "content": "..." }]`. Paths are relative to `packages/ui/src`; `components/` goes to `componentsDir`, `lib/` to `utilsDir`. Absolute paths and `..` are rejected. |
| `dependencies` / `devDependencies` | npm packages with ranges. `@gable/*` ranges follow the lockstep version (`~x.y.z`). |
| `registryDependencies` | Names of other items needed; `add` installs them first, transitively. |
| `cssImports` | `@import`s the stylesheet must have (`init` adds the missing ones at the top). |
| `cssVars` | `{ "light": { "--x": "..." }, "dark": { ... } }`, written into `:root` and `.dark`. |
| `css` | Raw CSS appended to the stylesheet: Tailwind v4 configuration is CSS (`@theme`, `@custom-variant`, keyframes). |
| `baseColor` | Style items only. `init` picks the theme item whose `baseColor` matches the config. |

CSS from an item is written between `/* gable-ui:<name> */` and `/* /gable-ui:<name> */` markers, so it is replaced rather than duplicated on later runs and the rest of your stylesheet is left alone. Edit inside the markers at your own risk; move your edits outside them to keep them.

## Registry sources

`--registry` (or `registry` in the config) accepts:

- nothing: the registry bundled with the CLI (`packages/gable-ui/registry`, generated by `npm run build`);
- a directory holding `index.json`, or a directory holding `registry/index.json`;
- a gable-ui source tree (a directory with `package.json` and `src/components`, like `packages/ui`): the registry is generated in memory;
- a git URL (`https://...`, `ssh://...`, `git@host:path`, `file://...`, anything ending `.git`), optionally `url#branch-or-tag`: shallow-cloned into a temporary directory, then read as one of the directory forms above.

A hosted URL can be added later as another source kind: the JSON layout is the contract.

## How the registry is generated

`npm run build -w packages/gable-ui` compiles the CLI and then runs `gable-ui build --ui ../ui --out registry`. The builder reads `packages/ui` and writes one item per non-test file in `src/components` (type `component`) and `src/lib` (type `lib`), plus a `theme-neutral` style item from `theme.css` (its header comment about importing the package is dropped). Nothing is listed by hand, so new components show up on the next build.

- **Inference.** Relative imports map to `registryDependencies` (a file the registry cannot carry, such as `../index.js`, fails the build); bare imports map to npm `dependencies`, with the range taken from `packages/ui/package.json` (an import that is not declared there fails the build). Comments are ignored.
- **`src/registry-meta.ts`.** When present, it is read first. It should export `registryMeta`, an object (or array with `name`) keyed by item name, each entry optionally giving `description`, `files` (an item that is several files, relative to `src`), `dependencies` (names or `{ name: range }`), `registryDependencies`, `cssVars` and `css`. What an entry states replaces the inferred value for that item; what it leaves out is inferred. Where the sources import something the entry does not list, the build prints a warning. If the module cannot be loaded the build warns and infers everything. The exact shape of that file is owned by the `@gable/ui` side; adjust `MetaEntry` in `packages/gable-ui/src/registry-build.ts` if it differs.

## Tests

`packages/gable-ui/src/*.test.ts`: unit tests (import scanning and rewriting, config, CSS blocks, `package.json` merging, registry generation with and without a meta file) and an offline end-to-end test that builds the registry from `packages/ui` and runs `init` and `add` into temporary Vite project fixtures (directories, `--local`, lockfile detection, source tree and git sources, error cases). The install step is stubbed; the test checks `package.json` instead. Run with `npx vitest run packages/gable-ui`.
