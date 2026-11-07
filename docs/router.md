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

### Meta and SEO

A route declares document metadata with `meta`, beside `title`:

```ts
const routes = [
  {
    path: '',
    meta: { robots: 'index', twitter: { card: 'summary' } },
    children: [
      {
        path: 'blog/:slug',
        component: Post,
        title: 'Post',
        meta: {
          description: 'A post',
          canonical: 'https://example.com/blog',
          themeColor: '#0b1020',
          og: { title: 'Post', type: 'article' },
        },
      },
    ],
  },
];
```

Fields: `description`, `robots`, `themeColor` (`theme-color`), `canonical` (`<link rel="canonical">`), `og` (`og:*` properties) and `twitter` (`twitter:*` names). Tags merge from the root route down: a child wins per field, and `og` and `twitter` merge per key. On every navigation the merged result replaces the previous route's tags, so nothing leaks between pages. A tag the page already has in `index.html` is updated in place and restored when no route sets it; tags Gable adds are removed.

Inject `Meta` (from `@gable/core/renderer`) to set tags from code, for example once data has loaded: `meta.update({ description })` merges, `meta.set(tags)` replaces, `meta.clear()` removes. The next navigation resets them to the new route's declaration. Tags are written to `document.head` in the browser; they are not rendered into static HTML.

In tests, `app.meta.entries` lists the current head entries (`{ kind: 'name' | 'property' | 'link', key, value }`) and `app.meta.get()` the tags.

## Accessibility: announcements and focus

A single-page navigation changes the page without a load, so assistive technology hears nothing and keyboard focus stays on the link that was clicked. After every completed navigation the router does two things, once the new view has rendered:

1. **Announces the page** through a polite live region: the route's `announce` text, otherwise the route `title` (the deepest one), otherwise the platform `Title`.
2. **Moves focus** to the first match of `["main h1", "h1", "main", "router-outlet"]`. The target gets `tabindex="-1"` when it is not natively focusable, so it can take focus without joining the tab order.

Both are skipped for the first navigation (the browser already presents a freshly loaded page; set `initial: true` to include it) and for navigations that keep the same path, such as changing a query parameter or fragment, so a filter box keeps focus while it filters. Back and forward count as navigations.

Configure it for the whole app in the second argument of `provideRouter`, and override or opt out per route:

```ts
provideRouter(routes, {
  a11y: {
    announce: ({ title, data }) => `${title}, ${data.section ?? 'site'}`, // or false for none
    politeness: 'polite', // or 'assertive'
    focus: ['#page-title', 'main'], // a selector, a list tried in order, or false
    initial: false,
  },
});

const routes = [
  { path: 'results', component: Results, title: 'Results', announce: 'Results updated', focus: '#results-heading' },
  { path: 'player', component: Player, focus: false, announce: false }, // leave both alone
];
```

A route's `announce` and `focus` win over the app-wide options; the deepest route that sets one wins over its parents. `announce` as a function receives `{ url, title, params, data }`; returning `undefined` or an empty string announces nothing.

The announcements come from the `LiveAnnouncer` service (see [Accessibility checks](accessibility.md)), which you can inject yourself. In tests, `mountApp` exposes `app.announcer.messages` and `app.focus.focused` (the node focus moved to).

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

## Transitions

Route swaps are instant unless you opt in. There are two mechanisms, both opt-in and both skipped under `prefers-reduced-motion: reduce`.

**CSS (the default mode).** The outlet marks the incoming view's host `data-state="open"` and the outgoing view's host `data-state="closed"`, and sets `data-transition` on the `<router-outlet>`. The outgoing view's scope is disposed straight away, but its nodes stay in the tree until its exit animation or transition ends (the same `holdRemoval` hook that `uiPresence` uses, so presence components inside the leaving page are waited for too). You write the animation:

```html
<router-outlet transition></router-outlet>
```

```css
router-outlet { display: grid; }
router-outlet > * { grid-area: 1 / 1; }              /* old and new views overlap while the old one leaves */
router-outlet > [data-state='open']   { animation: in 250ms ease-out; }
router-outlet > [data-state='closed'] { animation: out 250ms ease-in forwards; }
```

The end is detected from the host's own `animationend` / `transitionend`, with a timeout (computed duration plus 100 ms) as a safety net. A leaving view with no animation or transition on `[data-state='closed']` is removed at once. Add your own `@media (prefers-reduced-motion: reduce)` rules for anything the router cannot skip: the router already swaps instantly and does not set `data-state`, so keyframes keyed on it never run. A swap to the same route with different params keeps the instance, so nothing animates.

**View Transitions API.** `transition="view"` runs the swap inside `document.startViewTransition(...)`. The browser snapshots the old view, the swap happens, and it cross-fades (or runs your `::view-transition-*` CSS; give the outlet or the views a `view-transition-name`). Where the API is missing the swap just happens immediately. The first render is never wrapped. The swap runs when the browser calls back, so `navigate()` can resolve before the DOM has changed.

**Where to turn it on.** From most to least specific:

1. `Route.transition` on the route being entered: `true` (router default mode), `'css'`, `'view'`, or `false` to opt out.
2. `<router-outlet transition>` (default mode), `transition="view"`, `[transition]="false"`.
3. `provideRouteTransitions({ mode })` next to `provideRouter` turns it on for every outlet (`mode` defaults to `'css'`). Pass `all: false` to only set options and keep opt-in per outlet or route.

`provideRouteTransitions` also takes `exitDuration(host)`, `reducedMotion()` and `startViewTransition(update)` overrides. They matter for tests and non-DOM renderers: the in-memory renderer has no computed style, so `exitDuration: () => 200` makes the outgoing view wait for an `animationend` that you dispatch.

```ts
const app = mountApp(Root, { routes, providers: provideRouteTransitions({ exitDuration: () => 200 }) });
await app.navigate('/about');
expect(app.query('app-home')!.attrs['data-state']).toBe('closed'); // still mounted
app.dispatch(app.query('app-home')!, 'animationend', { target: app.query('app-home') });
```

### Animating lists

The same hook animates `@for`, `@if` and `@switch`. Put `uiPresence` (from `@gable/ui-primitives`) on the row: it sets `data-state` and keeps the row mounted until its exit animation ends. Style `[data-state='closed']` with the exit and the row's base style with the enter; keyed `@for` moves rows without replaying either. Components can call `usePresence()` directly. See `examples/ui-gallery/src/transitions-demo.ts` (open `/transitions.html` in the dev server) for a routed page set, a list with presence, and a jsdom test.
