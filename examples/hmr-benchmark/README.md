# HMR benchmark

Measures Gable's headline feature: how long a hot update takes, and whether state survives it. The script generates a large app, starts the Vite dev server programmatically, opens the app in a real browser (Playwright driving Chrome, falling back to Edge, then bundled Chromium), rewrites source files and times edit to DOM updated.

## Run

```
npm run pack:local -- examples/hmr-benchmark   # from the repo root: builds and packs @gable/* into vendor/
cd examples/hmr-benchmark
npm install
npm run bench                                   # or: node bench.mjs [--sizes 500,2000] [--iterations 10]
```

From the repo root, `npm run bench:hmr -- --sizes 500` also works once the example is installed.

Options: `--sizes` (components, default `500,2000`), `--iterations` (measured edits per row, default 10, plus one unmeasured warm-up), `--browser chrome|msedge|chromium` (default: first one found), `--headed`, `--json out.json`. For bundled Chromium run `npx playwright install chromium` first. The exit code is 1 if any row timed out, reloaded the page or lost state.

## The generated app

`gen.mjs` writes `.work/n<N>/` (gitignored): `N` components in a tree with fanout 4, one file each. Every component has a `count` signal, a `computed` field, a method, a `last` signal, an uncontrolled `<input>`, a template, a scoped style and buttons (`+`, `mark`). One root-scoped `Store` service holds a `value` signal; every 10th component (and both edit targets) injects it and renders `store.label()`.

Two edit targets per size: a **leaf** (no descendants) and an **inner** component at depth 1 (about N/4 descendants).

## What is measured

Before the edits, the script sets state on the target: types `keep-me` in its input, clicks `+` three times (`count` = 3) and `bump` twice (service `value` grows by 2). Then for each edit kind it rewrites the file and times, with the page's own `Date.now()` against the Node `Date.now()` taken just before the write, until the DOM shows the edit:

| Edit | File change | Done when |
| --- | --- | --- |
| class field | the `computed` field's formula | its text shows the new marker |
| class method | the body of `fmt()` | the page calls the method (clicks `mark`, every ~4 ms) and sees the new result |
| template text | a text node in the template | the text node changes |
| style | `padding-left` in `styles` | `getComputedStyle` reports the new value |
| service | the `label` computed in `Store` | the injecting component shows the new label |

The method edit needs the page to call the method because a hot-swapped method does not invalidate a `computed` that already called it (see below), so its time includes up to ~4 ms of polling granularity. The other kinds are detected by a `MutationObserver`.

After each edit (plus 150 ms to settle) it checks that state survived: the page was not reloaded (a `window.__bench` id set by an inline script, and Playwright's main-frame navigation count), `count` is still 3, the input still holds `keep-me`, and the service value is unchanged. The summary table reports median, p95, min and max over the iterations and "yes" or the failed checks. Run-to-run noise on a developer machine is easily tens of ms; compare medians, not single runs.

## Sample results

Edge 156 headless on Windows 11, 10 iterations, median ms (p95 in brackets):

| components | target | class field | class method | template text | style | service |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 500 | leaf | 60 (71) | 46 (59) | 44 (49) | 50 (69) | 259 (311) |
| 500 | inner | 106 (170) | 51 (68) | 170 (299) | 44 (50) | 155 (168) |
| 2000 | leaf | 188 (206) | 167 (179) | 167 (178) | 165 (197) | 1434 (1801) |
| 2000 | inner | 703 (855) | 169 (211) | 701 (766) | 178 (222) | 1489 (2099) |

State was kept in every run. Initial dev-server load: about 2.2 to 5.8 s for 500, about 5 s for 2000 components.

## Findings

- A method-only edit used to leave the DOM stale when a `computed` had already called the method (TASK-16). The runtime now makes every call of a registered class's method read a per-class version signal that an edit bumps, so callers re-run. The benchmark still clicks `mark` to detect the edit, which now also covers the case where nothing calls the method.
- Leaf-edit latency grows with app size (TASK-17), but the cost is in Vite's file watcher, not in Gable: after a change, Vite's chokidar re-reads the edited file's whole directory (`readdirp` plus one `lstat` per file), and this generated app keeps all N components in one `src/` directory. That is about 25 ms at 500 files and 113 ms at 2000, and the module request does not even leave the browser until it is done. Gable's own work for a leaf edit is a few ms at any size. Real apps spread files across directories.
- Editing an inner component rebuilds its subtree (about N/4 components), which is inherent; the avoidable part was a synchronous forced layout (`scrollTop` read on every element to capture scroll offsets), now replaced by recording scrolled elements from scroll events: inner template edit at 2000 went from about 700 ms to about 465 ms.
- Editing a service rebuilds every component that injected it, which dominates (about 0.8 s at 2000 components).
