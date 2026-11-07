# Error handling and reporting

Gable never lets one failing piece take down the rest of the app. Work that fails is caught where it runs, reported to a single place, and the surrounding UI keeps going.

## Where errors come from

Every failure is reported as an `ErrorContext` with a `source`:

| source | what failed | what happens next |
| --- | --- | --- |
| `setup` | A component's field initialisers (or its template build) threw | The component's scope is disposed and it renders an empty host. Siblings continue. A failed root component throws from `bootstrap`/`createComponent` instead. |
| `effect` | An `effect()` threw | The effect stays alive and runs again on its next dependency change. Runaway effect loops are reported here too. |
| `binding` | A template expression threw | The binding keeps its last good value. Reported once per failure episode, not on every re-evaluation. |
| `event` | An event handler or `submit()` callback threw or rejected | Reported; nothing is torn down. |
| `subscription` | An observable bound with `toSignal`, a store `rxMethod`, or a form async validator errored | The pipeline ends (as in RxJS). |
| `lazy` | A `lazy()` import, `@defer` block or lazy route failed to load | Reported even when an `@error` block renders. |
| `router` | Navigation threw (a guard, a resolver) | The previous route stays. |
| `hmr` | A hot update failed to evaluate or apply | The update is rolled back (dev only). |

`ErrorContext` is `{ source, component?, injector, detail? }`: plain data. The error itself is never wrapped, so `instanceof` checks and stacks are intact.

## The ErrorHandler

All sources go to one token, `ErrorHandler`, resolved from the failing component's injector (so a component-level provider can override it for that subtree), falling back to the root one. The default writes `console.error("[gable] <source> error", error, context)` and swallows. A handler that itself throws falls back to the console, so reporting never throws.

Replace it with a provider. To add a reporter and keep the console output, decorate the previous handler:

```ts
import { ErrorHandler, inject, type ErrorContext } from "@gable/core";
import * as Sentry from "@sentry/browser";

class SentryErrorHandler extends ErrorHandler {
  override handleError(error: unknown, context: ErrorContext): void {
    Sentry.withScope((scope) => {
      scope.setTag("gable.source", context.source);
      if (context.component) scope.setTag("gable.component", context.component.name);
      if (context.detail) scope.setExtra("detail", context.detail);
      Sentry.captureException(error);
    });
    super.handleError(error, context); // keep the console output
  }
}

bootstrap(App, {
  renderer: createDomRenderer(),
  providers: [{ provide: ErrorHandler, useClass: SentryErrorHandler }],
});
```

To wrap an existing custom handler instead, inject the previous one into a factory (`useFactory: () => new Reporting(inject(Previous))`).

Anything that is not reported through Gable (an uncaught error in your own `setTimeout`, an unhandled promise rejection) still needs `window.onerror` / `unhandledrejection`; forward those to the same service yourself.

## Development and production

Gable has no separate production error path: the same handler runs in both. Differences in development:

- During a hot update (HMR) a failing component Setup is thrown rather than reported, so the update rolls back to the last working version and the failure is reported as `hmr`.
- Devtools, when installed, observe components and HMR results; they do not replace the handler.
- There is no built-in error overlay. To show one, provide an `ErrorHandler` that renders it in development only (`import.meta.env.DEV`) and calls `super.handleError`.
- In tests, `mount()` collects every report. Unexpected reports fail the test on the next `flush()` or `destroy()`; claim expected ones with `fixture.claimErrors()`.

## Error boundaries

`ErrorBoundary` (selector `gable-error-boundary`) renders its content normally. When something below it fails, it swaps the content for fallback content (the `fallback` slot):

```ts
import { ErrorBoundary, html, viewChild } from "@gable/core";

class Page {
  static meta = {
    selector: "app-page",
    imports: [ErrorBoundary, Widget],
    template: html`
      <gable-error-boundary [resetKey]="user()" (failure)="notify($event)">
        <app-widget></app-widget>
        <div slot="fallback">
          <p>Something went wrong.</p>
          <button (click)="boundary()!.reset()">Try again</button>
        </div>
      </gable-error-boundary>
    `,
  };
  boundary = viewChild(ErrorBoundary);
}
```

- A failure is reported to the `ErrorHandler` first, so logging is unchanged. Then the nearest boundary above the failing scope that accepts its source shows its fallback.
- `catch` (input) lists the sources that trip the boundary. The default is `setup`, `effect`, `binding` and `subscription`. Event, router and lazy failures only report by default, since the UI around them is usually still sound; add `"event"` etc. to opt in.
- `reset()` rebuilds the content from scratch (new component instances, fresh state). Changing `resetKey` while failed also resets, e.g. on navigation or after the user changes.
- `error()` is the failure while showing the fallback, `failed()` is true while it shows, and `(failure)` emits each time it trips. Read them through `viewChild(ErrorBoundary)`.
- A failure inside the fallback, or from a source the boundary does not catch, continues to the next boundary up. A boundary shows one failure at a time; further failures before a reset are still reported.
- A route-level fallback is a boundary around `<router-view>`; use `resetKey` bound to the current URL.

Limits: a boundary catches only failures that Gable catches. It cannot see errors in code Gable never runs (timers, your own listeners), and the content's state is discarded when it trips.
