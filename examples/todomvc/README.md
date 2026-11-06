# Gable • TodoMVC

[TodoMVC](https://todomvc.com) implemented with [Gable](../../README.md), following the
[TodoMVC app spec](https://github.com/tastejs/todomvc/blob/master/app-spec.md).

## Framework

Gable is a client-side framework with components, dependency injection and a router, true HMR, and no
framework-specific compiler. Templates are `html` tagged template literals parsed at runtime. State is signals;
templates only read them, so every derived value is a `computed`.

## Implementation

```
index.html
package.json
src/
├── main.ts                    bootstrap: DOM renderer in hash mode + router
├── routes.ts                  #/ , #/active , #/completed (filter carried as route data)
├── app.css                    overrides (none needed)
├── models/todo.ts             Todo type, filter predicate, tolerant parser for stored JSON
├── services/
│   ├── todo-storage.ts        localStorage under the key "todos-gable" (swap it in tests)
│   └── todo-store.ts          root-scoped service: todos signal, view-model computeds, persistence effect
├── components/
│   ├── todo-app.ts            header, toggle-all, list, footer
│   └── todo-item.ts           one row: toggle, edit mode (Enter/blur save, Escape discard), destroy
└── todo-app.test.ts           behaviour tests on the in-memory test renderer
```

- The active filter lives in the URL hash. The router's route `data` supplies it to `TodoStore.filter`, and the list
  is filtered in the store, so a reload restores it.
- `TodoStore` persists with an `effect` over the `todos` signal. Editing state is local to `TodoItem` and never saved.
- Templates call no functions to compute values (`remaining`, `itemWord`, `allCompleted`, ... are `computed` signals).

## Build

`@gable/*` is not published to npm yet, so it is installed from tarballs in `vendor/` (gitignored), packed from this repository.
`npm run pack:local` builds the workspace, packs every publishable package into `vendor/` and keeps this app's
`file:` dependencies and `overrides` in `package.json` pointing at them. Re-run it after changing a package.

```sh
# from the repository root
npm install
npm run pack:local            # defaults to examples/todomvc

# then, in examples/todomvc
npm install
npm run dev      # Vite dev server with HMR
npm run build    # production build into dist/
npm test         # Vitest
npm run check    # tsc --noEmit and the Gable template checker
```
