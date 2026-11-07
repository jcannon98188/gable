# @gable/renderer-dom

The renderer that puts a Gable app in a browser. `@gable/core` never touches `document`: it describes work as a small set of calls (create a node, set a property, insert, remove, listen) on a `Renderer`, and this package implements them over the real DOM. It also ships the browser services the router needs (Location, History, Title, Meta, LiveAnnouncer, FocusManager), scoped component styles, and the `viewport`, `interaction` and `hover` triggers for `@defer`.

## Install

```
npm install @gable/core @gable/renderer-dom
```

`npm create gable@latest my-app` wires it up for you.

## Start an app

`dom()` creates the renderer and `bootstrap` mounts the root component into a target element.

```ts
import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { Root } from "./root.js";

bootstrap(Root, { renderer: dom(), target: "#app" });
```

`dom` is a short name for `createDomRenderer`. Creating the renderer needs no browser globals, because the document is read when first used, so it is safe in setup code and in tests.

## Options

Both take the same options.

```ts
const renderer = createDomRenderer({
  mode: "hash", // keep the app URL after the "#" (default "path")
  base: "/app", // path mode: a prefix of the real path that is not part of the app URL
  document: iframe.contentDocument!, // render into another document
  overlayRoot: () => document.querySelector("#overlays")!, // where dialogs and popovers are moved
});
```

`mode` and `base` change how the router reads and writes the URL, so a site hosted on static storage can use `hash` mode. `overlayRoot` must be an element in the same document as the app. The [router guide](../router.md) covers URLs in more detail.

## What it does to the DOM

The renderer is deliberately thin. Gable compiles each template into direct calls, so a signal change writes exactly the text, attribute, class or property that depends on it, with no tree diffing. Try it: the demo mounts a small component through the real DOM renderer, wrapped so it can list every call it receives.

```demo renderer-dom
Press a button. Each change is one or two renderer calls, and writing an equal value makes none.
```

The wrapper in the demo is the whole trick: a renderer is a plain object, so `{ ...base, setText(node, text) { log(text); base.setText(node, text); } }` is a valid renderer. That makes it easy to build a recorder, a profiler or a custom target.

Some details worth knowing:

- `[prop]="x"` sets a DOM property, and `[attr.name]="x"` sets an attribute. A property name the element does not have is reported with a suggestion. On SVG and MathML elements property bindings are written as attributes, since most DOM properties there are read-only.
- Setting `innerHTML`, `outerHTML` or `srcdoc` through a binding is refused.
- Component `styles` are registered once per component and scoped with an attribute token the renderer stamps on that component's elements.
- `[field]` works on native controls through `controlBinding`.

## Other exports

- `DOM_TRIGGERS` lists the defer triggers the renderer observes.
- `controlBinding(el)` is the form-control adapter behind `[field]`.
- `knownTags` lists the element names the renderer knows per namespace, used for its dev-time unknown-tag warning.
- `createDomPlatform()` builds just the browser services, for code that needs Location or History without the renderer.

To write your own renderer, for example for tests, see the `Renderer` type from `@gable/core/renderer`. Tests normally use the in-memory renderer in [@gable/testing](./testing.md).

Every exported symbol is documented in the API reference, linked below.
