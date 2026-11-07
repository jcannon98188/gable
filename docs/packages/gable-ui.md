# gable-ui (CLI)

`gable-ui` copies component source into your project, shadcn-style, so you own the files afterwards. The components come from [@gable/ui](./ui.md); this package is the command-line tool and the registry format around them. It is versioned in lockstep with the rest of Gable.

## Install and use

```sh
npx gable-ui init
npx gable-ui add button dialog select
```

The package is still private while nothing is published, so for now run it from the repository (`npm run pack:local` packs the Gable packages, and `--local <dir>` installs from those tarballs). There is no `diff` command and no prompts: everything is a flag.

## Commands

| Command | What it does |
| --- | --- |
| `gable-ui init` | Writes `gable-ui.json`, makes sure the stylesheet imports Tailwind and `tw-animate-css`, writes the theme, and adds the Tailwind packages to `package.json`. Safe to run again. |
| `gable-ui add <component...>` | Copies each component plus what it needs (helpers and other components), rewrites imports to your directories, applies any CSS the items carry, adds missing npm packages and runs your package manager's install. |
| `gable-ui build` | Generates a registry from a gable-ui source tree. |

Useful flags: `--registry <dir|url>` (where components come from; `init` remembers it), `--local <dir>`, `--no-install`, `--overwrite` (replace files that differ; otherwise they are kept, a warning is printed and the exit code is 1), `--components-dir`, `--utils-dir`, `--css` and `--base-color` for `init`, and `--ui` and `--out` for `build`. The package manager is read from your lockfile, and existing dependency ranges are never changed.

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

Paths are relative to the project root and must stay inside it. `registry` is optional; without it the registry bundled with the CLI is used. Imports in copied files are rewritten as relative paths, so no path aliases or tsconfig changes are needed.

## Registries

A registry is a directory of JSON files: an `index.json` listing the items and an `items/<name>.json` per item, with its `type` (`component`, `lib` or `style`), `files`, npm `dependencies`, `registryDependencies` and optional CSS (`cssImports`, `cssVars`, `css`). CSS from an item is written between `/* gable-ui:<name> */` markers, so a later run replaces it instead of duplicating it.

`--registry` accepts a registry directory, a gable-ui source tree (the registry is generated in memory), or a git URL, optionally `url#branch-or-tag`. `gable-ui build --ui ../ui --out registry` generates the registry the CLI bundles: one item per file in `src/components` and `src/lib`, with dependencies inferred from imports.

## Programmatic use

The commands are exported for scripts and tests: `init`, `add`, `buildRegistry`, `writeRegistry`, `openRegistry`, `readConfig`, `findImports` and `rewriteImports`. `main(argv, env, io)` runs the whole CLI with its output and install step injected.

## Why there is no live demo

This is a command-line tool that edits files and runs your package manager, so there is nothing to run in a page. The component behaviour it installs is shown live in the [@gable/ui-primitives guide](./ui-primitives.md) and the [@gable/ui guide](./ui.md).

The [full CLI and registry notes](../gable-ui-cli.md) cover every flag, the item fields and how the registry is generated.

Every exported symbol is documented in the [API reference](/docs/gable-ui/api).
