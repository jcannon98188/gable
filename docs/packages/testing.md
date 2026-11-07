# @gable/testing

A test harness for Gable components. It mounts a component into an in-memory renderer, so there is no jsdom, no browser and no extra setup. You drive the component with events, wait for updates, and assert on text or markup. It works with any runner (examples here use Vitest).

## Install

```
npm install --save-dev @gable/testing
```

## Mount, act, flush, assert

`mount(Component, options?)` returns a fixture. The fixture never flushes by itself: after changing a signal or firing an event, `await fixture.flush()` before asserting.

```ts
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { expect, it } from "vitest";

class Counter {
  static meta = {
    selector: "app-counter",
    template: html`<button (click)="increment()">Count: {{ count() }}</button>`,
  };
  count = signal(0);
  increment() {
    this.count.update((n) => n + 1);
  }
}

it("counts clicks", async () => {
  const fixture = mount(Counter);
  fixture.dispatch(fixture.query("button")!, "click");
  await fixture.flush();
  expect(fixture.text()).toBe("Count: 1");
});
```

The tests below are the same idea, running for real in this page against the same renderer. Tick the box to break the component and see what a failure looks like.

```demo testing
This is a real @gable/testing run, not a recording.
```

## The fixture

- Find things with `query(selector)`, `queryAll(selector)`, `text()` and `html()`. `instance` is the component object, so you can read its signals directly.
- Act with `dispatch(node, "click")`, `fill(node, "text")` (or `true` for a checkbox), `type`, `change`, `keydown` and `blur`. The last four build realistic events, so handlers that read `$event` work.
- Wait with `flush()` (the next update), `settle()` (until nothing is scheduled, which covers resolved Promises and Observables) and `advance(ms)` (fake timers, for debounce and `@defer` timers). `advance` uses the `vi` or `jest` global, or pass `advanceTimers` to `mount`.
- Clean up with `destroy()`. With a global `afterEach` (Vitest globals or Jest) it happens automatically; otherwise call it or write `using fixture = mount(...)`.

Errors reported to the app's `ErrorHandler` are collected and fail the test at teardown, so a silent failure cannot pass. If you expect one, claim it with `fixture.errors.expect()` (see the [error handling guide](../errors.md)).

## Options

```ts
mount(Greeting, {
  inputs: { name: "Ada" }, // input() and model() values
  providers: [{ provide: Clock, useValue: fakeClock }], // override any token
  i18n: { locale: "fr", catalogs: { fr: { [id]: "Bonjour" } } },
  overrides: [[HeavyChart, StubChart]], // replace an imported component or a lazy() entry
});
```

A stub passed to `overrides` must declare the selector of the component it replaces. Missing translations are collected in `fixture.i18n.missing` instead of warning.

## HTTP

`fixture.http` is a recording backend for `@gable/core/http`. Requests wait until the test answers them, and any request left open fails the test.

```ts
const fixture = mount(UserList);
fixture.http.expectOne("/api/users").respond([{ id: 1, name: "Ada" }]);
await fixture.flush();
expect(fixture.text()).toContain("Ada");
```

`expectOne`, `expectNone` and `match` take a URL, a `{ method, url }` object or a predicate. `respond(body, { status })` answers with a non-2xx status as an error, and `networkError()` simulates a failure.

## Apps with a router

`mountApp(Root, { routes, url })` mounts a root with a `<router-outlet>`, a router, and an in-memory Location, History and Title. `await app.navigate("/users/42")` resolves after guards, lazy routes and the view update. `app.location.url`, `app.history`, `app.title`, `app.announcer` and `app.focus` expose what a browser would show. See the [router guide](../router.md).

## Scenes

`mountScene(scenes, "name")` mounts one scene from a `*.scenes.ts` file exactly as the Designer shows it, with its inputs, providers, state and HTTP mocks, so one file serves both the Designer and your tests.

## Everything else

`createTestInjector` builds an injector without a component, for testing services and stores (see [@gable/store](./store.md)). `createTestPlatform` gives the in-memory browser services alone. `fixture.defer` drives `@defer` blocks, and `fixture.hotReplace` replays a hot update through the real HMR path.

Every exported symbol is documented in the API reference, linked below.
