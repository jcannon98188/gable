# @gable/template-format

The formatter for Gable templates. It lays out the `html` tagged template literals in your components and leaves every other byte of the file alone. It has no Prettier dependency: it is a pure function over the template text, and it is what both the `gable-format` command and [`@gable/prettier-plugin`](./prettier-plugin.md) call. The output is deterministic and idempotent, so formatting twice changes nothing.

## Install

```
npm install -D @gable/template-format
```

Most apps get it through `@gable/prettier-plugin` and format with Prettier. Install this package directly when you want the `gable-format` command, or to format templates from your own tooling.

## Try it

Edit the component below. Only the template literal is rewritten; the class around it is not touched.

```demo format
The real formatter, running in your browser.
```

## The command line

`gable-format` rewrites only the `html` template literals in the files you name.

```
Usage: gable-format [--check] [--stdin] [--tab-width n] [--use-tabs] [--print-width n] [--tag name] [files...]

Rewrites only html template literals in the given files (or stdin to stdout with --stdin).
--check lists files that would change and exits 1 without writing.
```

| Flag | Meaning |
| --- | --- |
| `--check` | List the files that would change, one per line, and exit 1. Nothing is written. Use it in CI. |
| `--stdin` | Read one source from standard input and write the formatted source to standard output. |
| `--tab-width n` | Spaces per indent level. Default 2. |
| `--use-tabs` | Indent with tabs. |
| `--print-width n` | Line width to fill to. Default 80. |
| `--tag name` | The tag of the template literals to format. Default `html`. |
| `-h`, `--help` | Print the usage. |

The exit code is 0 when everything is fine, 1 when `--check` found files that would change, and 2 for an unknown option, no files, or a file that could not be read or written. The command takes file paths; it does not expand globs itself, so let your shell do it.

```
npx gable-format src/app.ts src/card.ts
npx gable-format --check src/*.ts
cat src/app.ts | npx gable-format --stdin
```

## From code

```ts
import { formatTemplate, formatTemplateLiterals } from "@gable/template-format";

// A whole TS or JS source: only the html literals change.
const out = formatTemplateLiterals(source, { printWidth: 100 });

// Just a template body (the text between the backticks).
const body = formatTemplate("<p>Hello   <b>{{ name() }}</b></p>");
```

The options are shared with the command line:

| Option | Default | |
| --- | --- | --- |
| `indentSize` | `2` | Spaces per indent level, and the width of a tab. |
| `useTabs` | `false` | Indent with tabs. |
| `printWidth` | `80` | Line width. |
| `baseIndent` | `""` | `formatTemplate` only: a prefix added to every output line. |
| `tag` | `"html"` | `formatTemplateLiterals` and `formatTemplateLiteral` only: the tag to look for. |

The package also exports `formatTemplateLiteral` (the replacement body for one literal), `findHtmlLiterals` (the literals in a source, with their positions), `parseTemplateTree`, and `runCli`, the command's implementation over a small I/O seam, so you can test it without a process.

## Where it is used

- [`@gable/prettier-plugin`](./prettier-plugin.md) formats `html` literals inside Prettier runs, using Prettier's `tabWidth`, `useTabs` and `printWidth`.
- The starter from [`create-gable`](./create-gable.md) sets that plugin up for you.

Every exported symbol is documented in the [API reference](/docs/template-format/api).
