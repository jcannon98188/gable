# Router

The router lives in `@gable/core/router`. It matches the URL against a plain array of route objects, renders the matched component in a `<router-outlet>`, and exposes the current URL, params and data as signals. It imports RxJS, a peer dependency of `@gable/core`.

## Set it up

Pass `provideRouter(routes)` as providers when you bootstrap, and put a `<router-outlet>` in your root component:

```ts
import { bootstrap, html } from '@gable/core';
import { provideRouter, RouterOutlet, type Route } from '@gable/core/router';
import { dom } from '@gable/renderer-dom';

class Home {
  static meta = { selector: 'app-home', template: html`<h1>Home</h1>` };
}
class About {
  static meta = { selector: 'app-about', template: html`<h1>About</h1>` };
}
class Root {
  static meta = { selector: 'app-root', imports: [RouterOutlet], template: html`<router-outlet></router-outlet>` };
}

const routes: Route[] = [
  { path: '', component: Home },
  { path: 'about', component: About },
];

bootstrap(Root, { renderer: dom(), providers: provideRouter(routes), target: '#app' });
```

`provideRouter` provides both the route config and the `Router` service. Inject the router anywhere with `inject(Router)`.

## Routes

A route is plain data (no decorators, no modules). Fields of `Route`:

| Field | Meaning |
| --- | --- |
| `path` | Static segments, `:param` segments and an optional trailing `**` wildcard. `''` matches no segments. |
| `component` | The component to render, or `lazy(() => import('./page.js'), 'Page')`. |
| `children` | Child routes, or a `lazy()` entry naming an export that is a `Route[]`. Children render in the parent's own `<router-outlet>`. |
| `providers` | Creates an injector for this route. Its component and descendants resolve from it. |
| `data` | Static data, read back as `Router.data()` or `ActiveRoute.data()`. |
| `title` | Written to the platform title when this is the deepest matched route with a title. |
| `redirectTo` | An absolute URL to go to when this route matches in full. `:param` is replaced by the matched param. |
| `canActivate`, `canDeactivate`, `canMatch` | Function guards, see below. |

The first matching route wins, depth first. A `**` route is a catch-all, so put it last.

```ts
const routes: Route[] = [
  { path: '', redirectTo: '/home' },
  { path: 'u/:id', redirectTo: '/users/:id' },
  { path: 'users/:id', component: User, title: 'User' },
  { path: '**', component: NotFound },
];
```

A URL that no route matches is reported as a `router` error and the previous view stays.

### Params

Path params reach a routed component two ways. A matching `input()` is set automatically, and updated in place (the instance is kept) when only the params change:

```ts
class User {
  static meta = { selector: 'app-user', template: html`<p>user {{ id() }}</p>` };
  id = input.required<string>();
}
// { path: 'users/:id', component: User }
```

Or inject `ActiveRoute` to get the `params` and `data` of this level (including its parents') as signals, with `params$` and `data$` as Observables:

```ts
class Probe {
  route = inject(ActiveRoute);
  // this.route.params().id, this.route.data().kind
}
```

### Nested routes

A route with `component` and `children` renders the component, which holds a `<router-outlet>` for the child. Each outlet renders one nesting level. A parent whose path is unchanged keeps its instance while the child swaps.

```ts
{ path: 'app', component: Layout, children: [
  { path: '', component: Home },
  { path: 'about', component: About },
] }
```

### Routes without a component

Routes with no `component` are supported. They are tested in `packages/testing/src/router.test.ts`. There are three shapes:

- A grouping route with `children`: it renders nothing itself, and its children render in the parent's outlet.
  `{ path: 'admin', children: [{ path: 'users/:id', component: User }] }`
- A `redirectTo` route, which never renders.
- A leaf with only `data` (and optionally `title`). It matches, its data is published, and the outlet renders nothing for it. This is the filter-from-route-data pattern below.

Data of nested routes is merged, with the child's keys winning over its parents'.

## Route data and the filter pattern

`Router.data()` is the merged `data` of the matched routes, so state that is "which view of the same page am I on" can live in the route table rather than being parsed from the URL. TodoMVC uses it for its All, Active and Completed filters. The routes have no components:

```ts
export const routes: Route[] = [
  { path: '', data: { filter: 'all' } },
  { path: 'active', data: { filter: 'active' } },
  { path: 'completed', data: { filter: 'completed' } },
  { path: '**', redirectTo: '/' },
];
```

A store derives its filter from the router, and everything else is an ordinary computed:

```ts
class TodoStore {
  router = inject(Router);
  filter = computed(() => (this.router.data()['filter'] as Filter | undefined) ?? 'all');
  visible = computed(() => this.todos().filter((t) => matchesFilter(t, this.filter())));
}
```

The links are plain anchors (`<a href="#/active">`), which works in hash mode. See `examples/todomvc`.

## The Router service

`inject(Router)` exposes the following signals, each with a `$` Observable twin: `url`, `params`, `queryParams` (values are a string, or an array for repeated keys), `fragment`, `data` and `navigating`. `events$` emits `start`, `end`, `cancel` and `error` navigation events.

`router.navigate(target, options?)` takes a URL string or segments (`['users', 4]` is `/users/4`) and options `{ replace, state }`. It resolves, and never rejects, with an outcome:

```ts
const outcome = await router.navigate('/about');
// { status: 'success', url: '/about' }
// { status: 'cancelled', url, reason: 'guard' | 'superseded' | 'lazy-load-failed' }
// { status: 'error', url, error }
```

A newer navigation supersedes one still waiting on a guard or a lazy load. `await router.whenIdle()` resolves when none is in flight. Redirect chains longer than 10 end in a `router` error.

## Links

Import `RouterLink` and `RouterLinkActive` into the component that uses them:

```ts
class Nav {
  static meta = {
    selector: 'app-nav',
    imports: [RouterLink, RouterLinkActive, RouterOutlet],
    template: html`
      <a routerLink="/" routerLinkActive="on" routerLinkActiveExact="true">home</a>
      <a routerLink="/about" routerLinkActive="on">about</a>
      <a [routerLink]="userLink()">user</a>
      <router-outlet></router-outlet>
    `,
  };
  userLink = computed(() => ['/users', this.uid()]);
}
```

- `routerLink` takes a string or a segment array, sets `href`, and navigates on a plain click without a page load. Modified clicks (ctrl, meta, shift, alt, or a non-primary button) are left to the browser.
- `routerLinkActive` adds its classes while the link's URL is active. It matches by prefix unless `routerLinkActiveExact` is set. Only the path is compared, so a link to `/` is active everywhere unless exact.

## Guards

Guards are plain functions in `canActivate`, `canDeactivate` and `canMatch`. They run in an injection context, so `inject()` works. Each may return a boolean, a `Promise` or an `Observable` (the first value is used). Return `false` to cancel, or `redirect(url)` to navigate elsewhere.

```ts
import { redirect } from '@gable/core/router';

const requireLogin = async () => (inject(Auth).loggedIn() ? true : redirect('/login'));

const routes: Route[] = [
  { path: 'login', component: Login },
  { path: 'admin', component: Admin, canActivate: [requireLogin] },
];
```

- `canActivate(route)` runs for the routes being entered. `route` is a `RouteSnapshot` with `url`, `params` and `data`. A `false` leaves the view and URL alone and resolves with `{ status: 'cancelled', reason: 'guard' }`.
- `canDeactivate(component, route)` runs for the routes being left, with the leaving component instance, so a form can veto leaving.
- `canMatch(segments)` runs only for routes whose path already matched. `false` lets matching continue with the next route, which allows different components at the same path.
- A guard that throws is reported as a `router` error and the navigation resolves with `status: 'error'`.

## Lazy routes

`lazy()` from `@gable/core` is the same helper `@defer` uses. A lazy `component` is loaded before the navigation commits, so the old view stays until the new one is ready. `router.navigating()` is true meanwhile. Lazy `children` are loaded to match them.

```ts
import { lazy } from '@gable/core';

const routes: Route[] = [
  { path: 'about', component: lazy(() => import('./about.js'), 'About') },
  { path: 'users', children: lazy(() => import('./user-routes.js'), 'userRoutes') },
];
```

A failed load cancels the navigation (`reason: 'lazy-load-failed'`), reports a `lazy` error, and leaves the view alone. Navigating again retries.

## Hash mode and path mode

By default `dom()` uses the real path (`/about`). Pass `mode: 'hash'` to keep the app URL after the `#` (`/#/about`), which needs no server rewrite rules and suits static hosting:

```ts
bootstrap(Root, { renderer: dom({ mode: 'hash' }), providers: provideRouter(routes), target: '#app' });
```

Route paths are the same in both modes. An empty hash reads as `/`. In path mode, `dom({ base: '/app' })` strips a prefix of the real path that is not part of the app URL. In path mode, the server must serve `index.html` for every route, and Vite's dev server does that.

The `title` of a route is written to `document.title` in both modes.

## Testing

`mountApp` from `@gable/testing` mounts a root component with a router and an in-memory Location, History and Title. No browser is needed, and `url` sets the starting URL.

```ts
import { mountApp } from '@gable/testing';

const app = mountApp(Root, { routes, url: '/users/4' });
await app.settle(); // also waits for the initial navigation
expect(app.text()).toBe('user 4');

const outcome = await app.navigate('/about');
expect(outcome).toEqual({ status: 'success', url: '/about' });
expect(app.location.url).toBe('/about');
expect(app.history.entries).toEqual(['/users/4', '/about']);
expect(app.router.data()).toEqual({}); // the Router is on the fixture

app.history.back(); // the browser's back button
await app.settle();
```

`app.title.get()` reads the title. Pass `providers` to supply fakes, for example an `Auth` service for a guard. The test renderer has no hash mode: it takes app URLs directly, so routes behave the same as under `dom({ mode: 'hash' })`.
