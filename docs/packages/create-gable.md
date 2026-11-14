# create-gable

`npm create gable` copies the Gable starter into a new directory: a small counter app with Vite, TypeScript, Tailwind, Vitest, the language service and Prettier already wired up. It writes files and prints the next steps. It does not install anything for you.

## Usage

```
npm create gable@latest my-app
cd my-app
npm install
npm run dev
```

Run it without a name and it asks for one (the default is `my-gable-app`). The target directory must not exist or must be empty, and the name must be a valid package name: lowercase letters, digits and dashes, optionally scoped. The package manager is detected from how you ran it, so with `pnpm create gable`, `yarn create gable` or `bun create gable` the printed commands and the generated README use that manager.

```
Usage: npm create gable@latest [project-name]

Copies the Gable starter into a new directory. Asks for a project name when none
is given.

Options:
  --service-worker  Add a service worker (@gable/service-worker): offline caching of the
                    production build and an update banner that applies new versions.
  --local <dir>     Install @gable/* from the tarballs in <dir> (made by "npm run pack:local"
                    in the Gable repository) instead of the registry. For unpublished builds.
```

| Option | Meaning |
| --- | --- |
| `--service-worker` | Add [`@gable/service-worker`](./service-worker.md) to the starter: offline caching of the production build and an update banner. See [below](#with---service-worker). With `npm create`, pass it after `--`: `npm create gable@latest my-app -- --service-worker`. |
| `--local <dir>` (or `--local=<dir>`) | Point every `@gable/*` dependency of the new app at a tarball in `<dir>`, and pin them under `overrides` since the packages depend on each other. For builds that are not published yet. |
| `-h`, `--help` | Print the usage. |

The exit code is 0 on success, 1 when the project could not be created (for example a non-empty directory), and 2 for an unknown option, a missing `--local` directory or more than one argument.

## What you get

- `package.json` with the scripts `dev`, `build`, `preview`, `test` (Vitest), `check` (`tsc --noEmit && gable-check`) and `format` (`prettier --write .`). The `@gable/*` packages are pinned with `~` to the version of `create-gable`, so they stay in lockstep.
- `vite.config.ts` using [`gable()`](./vite.md) and Tailwind, and a `tsconfig.json` that meets the [tsconfig requirements](../manual-setup.md) and enables the [language service](./language-service.md).
- `.prettierrc.json` using the [Prettier plugin](./prettier-plugin.md), `.vscode/settings.json`, `index.html`, a README, and a `src/` with a counter component, a store, a test and the entry file.

### With `--service-worker`

The option adds `@gable/service-worker` to `dependencies`, a `gable.sw.json` for the default worker, `gableServiceWorker()` to `vite.config.ts`, `provideServiceWorker({ url: "/sw.js" })` to `src/main.ts`, and `src/update-banner.ts`, a component in `src/root.ts` that offers a waiting release and applies it with `activateUpdate()`. `vite build` then emits `sw.js` and `sw-manifest.json` next to the app. Without the option the starter has none of this. [Getting started](../getting-started.md#offline-and-updates-the-service-worker-option) lists the files.

With `--local`, the tarball directory must then hold `@gable/service-worker` too.

[Getting started](../getting-started.md) walks through the generated app, and [Manual setup](../manual-setup.md) shows the same setup for an app you already have; the code blocks in both are kept identical to the starter's files.

Every exported symbol is documented in the [API reference](/docs/create-gable/api).
