# Gable • js-framework-benchmark

A [Gable](../../README.md) implementation of the keyed app from
[krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark): a table of rows with
create 1,000 / 10,000, append 1,000, update every 10th row, swap rows, select, remove and clear.

## Implementation

```
index.html                   dev/preview page (links /css/currentStyle.css, the benchmark's stylesheet)
public/css/                  the upstream stylesheets, copied from the benchmark repo (Bootstrap 3 + main.css)
src/main.ts                  bootstrap(App) into #main
src/data.ts                  label generator (adjective colour noun) and ids counting up from 1
src/services/row-store.ts    root-scoped service: rows and selected signals, one method per button
src/components/app.ts        buttons, table, @for (row of store.rows(); track row.id)
src/components/row.ts        tr[app-row]: id, label, remove cells; "danger" class when selected
src/benchmark-app.test.ts    UI contract and behaviour tests on the in-memory test renderer
scripts/bench.mjs            builds, serves with vite preview, drives a real browser, prints median timings
upstream/index.html          the page the upstream repo expects (classic script dist/main.js)
vite.upstream.config.ts      builds src/main.ts to a single dist-upstream/main.js (IIFE)
```

The UI contract matches upstream's vanilla and Solid keyed implementations: buttons `#run`, `#runlots`, `#add`,
`#update`, `#clear`, `#swaprows`, `tbody#tbody`, and per row `td.col-md-1` (id), `td.col-md-4 > a.lbl` (label, click
selects), `td.col-md-1 > a.remove > span.glyphicon-remove` (click removes), a trailing `td.col-md-6`, and `tr.danger`
for the selected row.

Gable template rules shape the code. Templates only read signals, so the "selected" test is a `computed` on the row
(`store.selected() === id()`), not an expression in the template. Rows are immutable objects; "update every 10th row"
replaces those objects and `@for ... track row.id` keeps the other rows and the DOM of the replaced ones, rebinding the
row's `input`. Event handlers call store methods.

## Run

`@gable/*` is not published to npm yet, so it is installed from tarballs in `vendor/` (gitignored):

```
npm run pack:local -- examples/js-framework-benchmark    # from the repository root; builds and packs the packages
cd examples/js-framework-benchmark
npm install
npm run check        # tsc --noEmit && gable-check
npm test
npm run dev          # interactive, with HMR
npm run bench        # builds, serves and measures
```

### The timing script

`npm run bench` builds the app, starts `vite preview`, and for each operation opens a **fresh page** per iteration
(as the upstream runner does, so JIT warmup counts), runs the setup clicks, then times the operation and verifies the
resulting DOM (a wrong result fails the run). Options: `--iterations N` (default 10), `--only "create,swap"`,
`--no-build`, `--port P`, `--headed`.

It uses Playwright (`playwright-core`, from the registry) with an **already installed** Chrome, falling back to
Edge; set `CHROME_PATH` to use another Chromium-based executable. No browser is downloaded.

Two numbers are printed per operation, in milliseconds: `script` is the synchronous click handling (near zero, because Gable renders in a scheduled flush after the
handler returns), and `paint` is
the time from the click until the next frame has been painted (a `requestAnimationFrame` plus a message-channel hop).
`paint` is quantized to the frame interval (about 16 ms) and is not krausest's trace-based metric, so use it to compare
Gable against Gable, not against the official results page. The browser runs on your desktop, unthrottled; close other
heavy programs for stable numbers.

## Submit upstream

The upstream repository holds each implementation as `frameworks/keyed/<name>/` with an `index.html`, a
`package.json` carrying a `js-framework-benchmark` block and a `build-prod` script, and the sources. Gable must be
published to npm first (this example installs it from tarballs).

1. Fork krausest/js-framework-benchmark and create `frameworks/keyed/gable/`.
2. Copy `src/`, `tsconfig.json`, `vite.upstream.config.ts` and `package.json` there (not `public/`: upstream serves
   `/css/currentStyle.css` itself), and copy `upstream/index.html` to `index.html`.
3. In `package.json`: replace the `file:` dependencies and the `overrides` block with the published `@gable/*` versions
   (pinned, since the packages are lockstep), drop the `dev`, `preview`, `test`, `check`, `bench` and
   `playwright-core` entries, and add:

   ```json
   "js-framework-benchmark": {
     "frameworkVersionFromPackage": "@gable/core",
     "frameworkHomeURL": "https://github.com/jcannon98188/gable",
     "customURL": "/",
     "issues": []
   }
   ```

   `build-prod` stays `vite build --config vite.upstream.config.ts`; point `outDir` in that config at `dist` (upstream
   loads `dist/main.js`). Delete `src/benchmark-app.test.ts` or keep `@gable/testing` and `vitest` as dev dependencies.
4. From the benchmark repo root: `npm ci && npm start`, then `cd frameworks/keyed/gable && npm ci && npm run build-prod`.
   Check it at `http://localhost:8080/frameworks/keyed/gable/` and run the correctness check
   (`npm run isKeyed` and `cd webdriver-ts && npm run bench -- --headless --framework keyed/gable --count 1`) per the
   upstream README.
5. Open a pull request. Keep to the keyed rules: row elements are keyed by id (they are) and no row DOM is rebuilt
   for update, swap, select or remove.
