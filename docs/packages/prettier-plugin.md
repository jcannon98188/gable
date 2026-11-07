# @gable/prettier-plugin

A Prettier plugin that formats the `html` template literals in your components. Prettier keeps formatting everything else exactly as it does without the plugin; only literals tagged `html` are handed to [`@gable/template-format`](./template-format.md). Prettier's built-in HTML embedding is switched off for those literals, and its CSS, GraphQL and Markdown embeds keep working.

## Install

```
npm install -D prettier @gable/prettier-plugin
```

Prettier 3 or newer is a peer dependency.

## Configure

List the plugin in your Prettier config:

```json
{
  "plugins": ["@gable/prettier-plugin"],
  "printWidth": 100
}
```

That is the whole setup; the starter's `.prettierrc.json` is exactly this, and its `npm run format` runs `prettier --write .`. The plugin has no options of its own. It reads three standard Prettier options and passes them to the formatter:

| Prettier option | Effect on templates |
| --- | --- |
| `printWidth` | Line width, reduced by the indent of the surrounding code. |
| `tabWidth` | Spaces per indent level. |
| `useTabs` | Indent with tabs. |

It registers the `typescript`, `babel` and `babel-ts` parsers with a printer named `gable-estree`; Prettier looks these up by name, so you do not import them. Only literals tagged exactly `html` are formatted.

## Editor

Set Prettier as the default formatter so saving a file formats its templates. In VS Code:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true
}
```

## Without Prettier

Use the `gable-format` command from [`@gable/template-format`](./template-format.md), which does the same job with no Prettier dependency. See [Manual setup](../manual-setup.md) for adding the plugin to an existing app.

Every exported symbol is documented in the [API reference](/docs/prettier-plugin/api).
