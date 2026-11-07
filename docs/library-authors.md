# Writing component libraries

## `injectHost()`: a component's own element

A directive-style component (a button, a dialog trigger, a tooltip) needs to touch the element it is mounted on: set `role` or `aria-*`, add listeners, toggle classes. `injectHost()` returns that element and the renderer that owns it.

```ts
import { html, injectHost, signal } from '@gable/core';

export class Toggle {
  static meta = { selector: 'x-toggle', template: html`<slot></slot>` };

  pressed = signal(false);

  // Setup: a field initialiser, so injectHost() is available.
  private host = injectHost<HTMLElement>();
  private wire = (() => {
    const { renderer, host } = this.host;
    renderer.setAttribute(host, 'role', 'button');
    renderer.listen(host, 'click', () => this.pressed.update((p) => !p));
  })();
}
```

`injectHost<N>()` returns a `HostRef<N>`: `{ renderer: Renderer<N>, host: N }`. `N` is the renderer's node type: `HTMLElement` (or `Element`) under `@gable/renderer-dom`, `TestNode` under `@gable/testing`. It defaults to `unknown`. Prefer going through `renderer` (`setAttribute`, `listen`, ...) over touching the node directly so the component works with every renderer; see the `Renderer` type from `@gable/core/renderer`.

### Where it works

Like `inject()`, `injectHost()` only works during Setup: in a field initialiser, or in a helper (`useRole(...)`) that a field initialiser calls. It throws `injectHost() called outside a component Setup.` from a method, an event handler, a timer or module level, so take the reference in a field and use that later.

`gable-check` reports a call to `injectHost()` from `@gable/core` at module level, in a method, constructor, accessor, static field, or in an arrow function stored in a field, as `inject-host-context` (error by default). Helper functions are not flagged, since they may be called from Setup.

### Compatibility

`@gable/core/internal` still exports the same `injectHost` function, so existing imports keep working.

## Packing a library locally

`npm run pack:local -- <app-dir>` packs every non-private workspace package, plus private ones marked `"gablePack": true` (`@gable/ui`), into `<app-dir>/vendor`. Tarballs are named after the package (`@gable/ui` becomes `gable-ui-<version>.tgz`). The unscoped `gable-ui` CLI would pack to the same name, so the script stores it as `gable-ui-cli-<version>.tgz` and stops with an error on any other collision. See `docs/gable-ui-cli.md`.
