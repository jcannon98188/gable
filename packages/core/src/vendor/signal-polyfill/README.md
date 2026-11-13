# Vendored signal-polyfill

This directory is a copy of the TypeScript source of
[proposal-signals/signal-polyfill](https://github.com/proposal-signals/signal-polyfill) `src/`, version 0.2.2, taken at
upstream `main` commit `1c33f91` (the `LICENSE` is upstream's Apache-2.0 licence, unchanged). Only `public-api-types.ts`
(a type-level test that needs `expect-type`) was left out. Two small source edits, neither changes behaviour:

- Four imports of types (`ValueEqualityComparer`, `ReactiveNode` in `computed.ts` and `signal.ts`) gained an inline
  `type` modifier, because Gable compiles with `verbatimModuleSyntax`.
- `wrapper.ts`: the `export let isState, isComputed, isWatcher` inside `namespace Signal` (assigned from static blocks)
  became module-level `isStateImpl` etc. plus `export const isState = (s) => isStateImpl(s)` in the namespace. Oxc, which
  Vite 8 uses when an app bundles `@gable/core` from source, rejects `export let` in a namespace. The internal calls use
  the module bindings directly, so there is no extra indirection on the hot path.

## Why it is vendored

The published `signal-polyfill@0.2.2` `dist` is built without a build target, so Vite lowers every `#brand in x` check to
`__privateIn` and every State/Computed/Watcher construction to `__privateAdd` (a `WeakSet` insert). That is measurable:
about 6.5 percent of the canvas benchmark's frame flush, and 10 to 25 percent on the polyfill's own propagation benchmark
(see `docs/research/frame-flush-optimisation.md`, step 1). Here the source is compiled by `@gable/core`'s own `tsc` build
at `target: ES2022`, so the private brand checks stay native. The source is not changed.

## The one-line diff

Upstream change (not a change to the source in this directory): `vite.config.ts` gets `build.target: 'es2022'`.

```diff
   build: {
     minify: false,
+    target: 'es2022',
```

Filed upstream as <https://github.com/proposal-signals/signal-polyfill/pull/64>.

## Removing it

Once upstream releases a version with the fix: add `"signal-polyfill": "<that version>"` back to
`packages/core/package.json` (and `examples/reactivity-benchmark/package.json`), change the `import { Signal } from
"./vendor/signal-polyfill/index.js"` in `packages/core/src/signals.ts` and `internal.ts` back to `"signal-polyfill"`,
delete this directory and `packages/core/src/vendor-signal-polyfill.test.ts`, and run `npm install`.

## Keeping the guard

`packages/core/src/vendor-signal-polyfill.test.ts` compiles core and fails if the emitted polyfill contains the
`__privateIn` or `__privateAdd` helpers, so the target cannot regress silently.
