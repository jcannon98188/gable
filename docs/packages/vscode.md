# gable-vscode

The VS Code extension for Gable (display name **Gable**, id `gable.gable-vscode`). It gives the `html` templates in your TypeScript files type-checking, completions and syntax highlighting. It is an application, not a library: a private extension with a TypeScript server plugin and a grammar, so there is no API reference for it.

## What it contributes

The extension's `package.json` declares two contributions:

- A **TypeScript server plugin**, `gable-vscode-plugin`, enabled for workspace TypeScript versions too. It is the Gable [language service](../manual-setup.md) bundled for tsserver, so the checks you see in the editor are the ones `gable-check` runs on the command line: unknown members, a signal read without `()`, wrong event names and more.
- A **grammar injection**, `gable-template.injection`, into `source.ts` and `source.tsx`. It highlights the `html` template literal and marks `{{ ... }}` and binding expressions as embedded TypeScript.

## Use it in your app

An app made with `npm create gable@latest` is already set up: its `.vscode/extensions.json` recommends `gable.gable-vscode`, and its `tsconfig.json` loads the language service:

```json
{
  "compilerOptions": {
    "plugins": [{ "name": "@gable/language-service", "renderer": "@gable/renderer-dom" }]
  }
}
```

Point the editor at the workspace's TypeScript so that plugin can load:

```json
{
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

The [manual setup guide](../manual-setup.md) shows the same steps for an existing app. For the checks in CI, add `"check": "tsc --noEmit && gable-check"` to your scripts.

## Build it from source

The extension is not published; it is packaged locally into a `.vsix`. From a checkout:

```
npm install
npm run package -w packages/vscode
```

This writes `packages/vscode/dist/gable-vscode-0.0.0.vsix`. Install it in VS Code with the **Extensions: Install from VSIX...** command, or with `code --install-extension` and that path. `npm run build -w packages/vscode` builds only the bundled plugin into `packages/vscode/dist/plugin`.

The packaging script stages the extension in a scratch directory with the plugin installed as a real dependency, because VS Code finds a contributed tsserver plugin by name in `node_modules`. It requires VS Code 1.90 or newer.

## Why there is no live demo here

The extension runs inside VS Code's editor and TypeScript server, which a web page cannot host. The same language service powers `gable-check` on the command line.
