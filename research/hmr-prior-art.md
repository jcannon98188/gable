# HMR prior art (TASK-1.2)

Question: how do Vite HMR, React Refresh, Lit, Solid-refresh and Angular HMR preserve state across updates, what are their limits, and what applies to a class-based, signals-driven, compiler-free framework (gable) whose dev server or bundler need not understand templates?

All sources fetched 2026-11-04. Several pages were read through a summarising fetch; those are marked "(summary)" and should be re-verified against the source before a claim becomes a spec rule. Lit has no first-party HMR (a web search of lit.dev found none), so the Lit section covers the open-wc plugin. GLOSSARY.md was not present in this worktree.

## 1. Vite HMR API (transport and boundary layer)

Source: https://vite.dev/guide/api-hmr (2026-11-04)

- `import.meta.hot.accept(cb)` makes a module a self-accepting HMR boundary; importers above it are not notified. `accept(deps, cb)` accepts updates to direct dependencies without re-executing the accepter.
- Vite does not swap bindings: a boundary that re-exports from a dependency must update those re-exports itself (and they must use `let`).
- `dispose(cb)` runs on the old instance before replacement (clean up side effects). `prune(cb)` runs when the module is no longer imported at all.
- `import.meta.hot.data` is one object per module path that survives updates; mutate it, do not reassign it. It is cleared after dispose/prune when the module is removed.
- `invalidate()` makes the server propagate the update to importers as if the module were not self-accepting; recommended inside the `accept` callback.
- Static analysis requirement: the text must literally be `import.meta.hot.accept(` so the server can detect boundaries. `decline()` is a no-op.
- Events (`vite:beforeUpdate`, `vite:afterUpdate`, `vite:error`, ...) plus custom events via `hot.send`/`hot.on`.
- Limit: Vite supplies only module re-execution and boundary propagation. It preserves no state itself; state preservation is the framework's job via `data` or in-memory registries.

Implication: the server needs the module graph and which modules call `accept` (plain JS text analysis), not templates. Compatible with "nothing may need to understand gable's templates".

## 2. React Fast Refresh (registry + signatures)

Sources (all summary):
- Runtime: https://github.com/facebook/react/blob/main/packages/react-refresh/src/ReactFreshRuntime.js
- Babel plugin: https://github.com/facebook/react/blob/main/packages/react-refresh/src/ReactFreshBabelPlugin.js
- Design thread: https://github.com/facebook/react/issues/16604

Mechanism:
- A Babel plugin wraps each component definition with `$RefreshReg$(type, persistentID)` and hook-using functions with `$RefreshSig$`. Runtime `register(type, id)` keeps a `family = {current: type}` per id; re-registering an id with a new type queues an update.
- `performReactRefresh()` classifies each queued update with `canPreserveStateBetween(prev, next)`: re-render in place (`updatedFamilies`) or remount (`staleFamilies`). The reconciler is given a `resolveFamily` hook so fibers of an old type render with `family.current`. The reconciler cooperates; it is not a pure userland patch.
- State survives because the fiber (and its hook state) is kept; only the function being called changes.
- Hook signature: the plugin records ordered hook calls (assignment target text, initial-state argument text for useState/useReducer, custom hook names; SHA-1 hashed). A differing signature remounts. `/* @refresh reset */` forces a reset for a file; custom hooks not in scope force reset.
- Remount rules: either side is a class (classes are always remounted), `typeof`/`$$typeof` change, memo shape change, one side lacks a signature, hook signature change.
- Module boundary heuristic: modules exporting only components are accepted, otherwise the update bubbles (`isLikelyAReactComponent`, name-based; the thread acknowledges it is a heuristic).
- Errors: error boundaries are always remounted; failed roots are retried with their last element; `hasUnrecoverableErrors()` triggers a full reload.
- The runtime must load before any app code.

Limits: needs a compiler plugin to find components and compute signatures; classes never keep state; hook-order edits reset state; non-component exports force bubbling or reload.

Applicability: the "family" indirection (stable id to current implementation) and the cheap structural signature deciding preserve versus remount are reusable. The compile-time hook signature is not, because it needs a transform. Gable's analogue would be a runtime-derived signature (section 7).

## 3. Lit and web components (prototype swap)

Source: https://open-wc.org/docs/development/hot-module-replacement/ (2026-11-04, summary). This is the community @open-wc/dev-server-hmr plugin, not Lit itself.

- "Web component HMR works by replacing class references and instance prototype chains with proxies." New elements use the latest class; for existing elements "the prototype chain is updated to reference the new class", so methods update but instance fields do not.
- Existing elements keep their state (an explicit feature). Constructors are not re-run for existing elements; newly added fields or properties are unavailable on existing elements.
- `observedAttributes` changes are not applied until a full refresh. The docs recommend periodic full refreshes.
- Library presets (`lit` for Lit 3, `litElement` for Lit 2) hook into the library to trigger re-render; an instance `hotReplacedCallback` is called for each connected element.
- Inference (not stated on the page): `customElements.define` cannot run twice for a name, so a stable proxy class must be registered once and its target swapped.

Limits: field initialisers and constructor logic are silently stale; instance shape changes are unsupported; it relies on a plugin that rewrites modules on the dev server (@web/dev-server).

Applicability: re-pointing the prototype is the cheapest compiler-free way to hot-swap class methods and is class-native. Its failure mode (new fields and initialisers do not apply) matters for gable because fields hold signals.

## 4. Solid (solid-refresh)

Sources (summary):
- README: https://github.com/solidjs/solid-refresh
- Runtime: https://github.com/solidjs/solid-refresh/blob/main/src/runtime/index.ts

- A Babel plugin wraps each PascalCase component via `$$component(registry, id, component, {signature, dependencies})`. The runtime stores the implementation in a signal (`createSignal(component, {internal: true})`) and returns a stable proxy that reads it; an update only calls the setter. Component identity stays stable, so importers need not update.
- `patchComponent`: if the signature (hash of the component's JS source in granular mode) or the dependency list (foreign bindings) changed, or there is no signature, the component is remounted through the signal, so local state resets. Otherwise nothing is swapped. README: "Preserving state is applied partially." and "No HOC support."
- Contexts are patched in place (copying `defaultValue`, `id`, `Provider` onto the new context) so existing providers keep working.
- The per-module registry is kept in `hot.data` across updates. If an export was removed the module is invalidated (bubbles up). Pragmas: `/* @refresh skip */` and `/* @refresh reload */`. Without Solid's dev build it warns and declines.

Applicability: the nearest analogue, since Solid is signals-based. A signal as the indirection cell for "current implementation" fits gable. Solid's state lives in closures so a changed signature must remount; gable class instances can keep their fields on the instance.

## 5. Angular HMR

Sources (summary):
- Docs: https://angular.dev/tools/cli/build-system-migration ("Hot module replacement")
- Runtime: https://github.com/angular/angular/blob/main/packages/core/src/render3/hmr.ts
- Compiler wiring: https://github.com/angular/angular/pull/58465

- Docs: "general JavaScript-based hot module replacement (HMR) is currently not supported". Supported: global stylesheets, component stylesheets and component templates. On by default; disable with `ng serve --no-hmr`.
- Mechanism: the AOT compiler emits, per component, a loader `<Class>_HmrLoad(t)` that dynamically imports `/@ng/component?c=<id>&t=<timestamp>` when the server fires `angular:component-update`, then calls `ɵɵreplaceMetadata(Comp, m.default, ...)`.
- `replaceMetadata` re-evaluates the definition and merges it into the existing definition object ("Keep the object in place, because there can be references to it"). It then finds live views whose `tView` matches (not `instanceof`, to avoid inheritance false positives) and `recreateLView` rebuilds each with the same component instance, host element and TNode. Instance fields (state) are preserved; the template DOM is recreated. Shadow DOM hosts are cloned, so stored references go stale.
- Errors during recreation send `angular:invalidate` through `import.meta.hot` so the server can fall back to a full reload.
- Limits: component definitions on element hosts only; embedded views are not replaced; directive and pipe changes via module scope do not flow; class logic changes (methods, fields) are not hot-applied, so they cause a reload.

Applicability: confirms a split that suits gable: keep the instance, replace the view definition, rebuild the view. But Angular's server piece depends on the compiler extracting template metadata, which gable cannot assume. If gable templates are ordinary runtime values, re-executing the module yields the new template without server knowledge.

## 6. Comparison

| System | Who finds components | Identity indirection | State kept when | Reset trigger |
|---|---|---|---|---|
| Vite | module graph + literal `accept` | none (module level) | framework supplies it via `hot.data` | n/a |
| React | Babel plugin | family id to current type, reconciler hook | hook signature equal | signature change, classes, forceReset |
| Lit (open-wc) | patched library/`define` | proxy class + prototype swap | instance never recreated | page refresh |
| Solid | Babel plugin | signal holding current impl | signature and deps equal | signature or deps change, no signature |
| Angular | AOT compiler | definition object mutated in place | instance reused | error, unsupported change |

Common failure modes: stale closures and initialisers, module-level side effects (need `dispose`), non-component exports forcing bubbling, error recovery needing full reload, runtime-ordering requirements, HOC or wrapper patterns defeating detection.

## 7. What may transfer to gable

These are inferences from the sources above, for TASK-1.7, 1.8 and 1.9; they are not claims from the sources.

1. Use Vite's `import.meta.hot` only as transport. A tiny gable runtime registers each component class under a stable id in a registry kept in `hot.data` (React families, Solid registry). Without a compiler the id must be explicit or derived from module path plus class name.
2. Keep component instances alive and re-point their prototype to the new class (open-wc), rebuilding only the view and effects (Angular `recreateLView`). Signals live on the instance, so state is preserved by construction. Needs a rule for added or removed fields (open-wc's weakness): diff the field set and initialise only new fields, or remount on shape change.
3. Replace React's compile-time hook signature with a runtime signature: ordered names and kinds of signal and DI fields, from decorators or static metadata, compared old versus new. A mismatch remounts.
4. If templates are runtime values, a re-evaluated module yields a new template and the renderer re-runs the view against the same instance. The server needs no template knowledge. This implies the renderer seam needs an operation like "recreate view for existing instance".
5. Effects and subscriptions need disposal on the old view to avoid leaks. DI-provided services should persist unless their own module changed.
6. Boundaries: every module that registers a component should self-accept. Avoid name heuristics (React's weak spot). Vite's literal `import.meta.hot.accept(` detection means a registration helper cannot hide the call, so either modules write it, a small plugin injects it, or a different mechanism is used. This is an open question for TASK-1.8.
7. Provide escape hatches (Solid's `reload`/`skip` pragmas) and an invalidate-to-reload fallback on any error (Angular, React).
8. If gable ever targets custom elements, the open-wc `define` proxy approach applies.

Open questions: stable ids without a compiler; weak registry of live instances per class including DI-scoped ones; inheritance chains (match by definition identity, as Angular does); how new field initialisers run on existing instances.
