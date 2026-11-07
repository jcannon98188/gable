import { computed, html, inject, input, lazy, signal } from "@gable/core";
import { ErrorHandler } from "@gable/core";
import { redirect, Router, RouterOutlet, type Route } from "@gable/core/router";
import { DemoLink as RouterLink, DemoLinkActive as RouterLinkActive } from "./links.js";

/** Who is signed in. Provided per demo, so two demos on a page would not share it. */
export class Session {
  loggedIn = signal(false);
  label = computed(() => (this.loggedIn() ? "Sign out" : "Sign in"));
  toggle() {
    this.loggedIn.set(!this.loggedIn());
  }
}

/** Collects what the mini app reports to its ErrorHandler, so it shows in the panel and not in the page's console. */
export class MiniErrors extends ErrorHandler {
  errors = signal<readonly string[]>([]);
  override handleError(error: unknown): void {
    const text = error instanceof Error ? error.message : String(error);
    this.errors.set([...this.errors(), text].slice(-3));
  }
}

let created = 0;

export class HomePage {
  static meta = {
    selector: "mini-home",
    template: html`
<h3>Home</h3>
<p>A small app with its own router. Click around, type a URL in the address bar, or press Back.</p>
<ul class="rd-list">
<li><a routerLink="/users/2?tab=posts">/users/2?tab=posts</a> has a param and a query param.</li>
<li><a routerLink="/admin">/admin</a> is behind a guard.</li>
<li><a routerLink="/reports">/reports</a> is a lazy route.</li>
<li><a routerLink="/nope">/nope</a> hits the <code>**</code> route.</li>
</ul>
    `,
    imports: [RouterLink],
  };
}

export class UsersLayout {
  static meta = {
    selector: "mini-users",
    template: html`
<h3>Users</h3>
<p class="rd-mut">Layout instance #{{ serial }}. It stays alive while the child below swaps.</p>
<div class="rd-tabs" role="group" aria-label="Users">
<a routerLink="/users/1" routerLinkActive="on">Ada</a>
<a routerLink="/users/2" routerLinkActive="on">Grace</a>
<a routerLink="/users/3" routerLinkActive="on">Linus</a>
</div>
<div class="rd-child"><router-outlet></router-outlet></div>
    `,
    imports: [RouterLink, RouterLinkActive, RouterOutlet],
  };
  serial = ++created;
}

export class UsersIndex {
  static meta = { selector: "mini-users-index", template: html`<p>Pick a user. The URL gets a <code>:id</code> segment.</p>` };
}

const NAMES: Record<string, string> = { "1": "Ada Lovelace", "2": "Grace Hopper", "3": "Linus Torvalds" };

export class UserPage {
  static meta = {
    selector: "mini-user",
    template: html`
<h4>{{ name() }}</h4>
<p class="rd-mut">Page instance #{{ serial }}. Changing only the id updates it in place: the number stays.</p>
<div class="rd-tabs" role="group" aria-label="Tab">
<a [routerLink]="profileLink()" [class.on]="!posts()">profile</a>
<a [routerLink]="postsLink()" [class.on]="posts()">posts</a>
</div>
@if (posts()) {<p>Posts by {{ name() }}. The tab comes from <code>?tab=posts</code>.</p>} @else {<p>Profile of {{ name() }}, from <code>:id</code> = {{ id() }}.</p>}
    `,
    imports: [RouterLink],
  };
  router = inject(Router);
  id = input.required<string>();
  serial = ++created;
  name = computed(() => NAMES[this.id()] ?? `User ${this.id()}`);
  posts = computed(() => this.router.queryParams()["tab"] === "posts");
  profileLink = computed(() => `/users/${this.id()}`);
  postsLink = computed(() => `/users/${this.id()}?tab=posts`);
}

export class AdminPage {
  static meta = {
    selector: "mini-admin",
    template: html`
<h3>Admin</h3>
<p>The guard let you in because you are signed in.</p>
<p class="rd-mut">Guards run when you navigate. Signing out here does not remove this page; try <a routerLink="/home">going home</a> and coming back.</p>
    `,
    imports: [RouterLink],
  };
}

export class LoginPage {
  static meta = {
    selector: "mini-login",
    template: html`
<h3>Sign in</h3>
@if (session.loggedIn()) {<p>You are signed in. <a routerLink="/admin">Open /admin</a></p>} @else {
<p>The guard on <code>/admin</code> sent you here with <code>?next=</code> set to {{ wanted() }}.</p>
<button type="button" class="rd-btn rd-primary" (click)="signIn()">Sign in and continue</button>
}
    `,
    imports: [RouterLink],
  };
  router = inject(Router);
  session = inject(Session);
  wanted = computed(() => {
    const next = this.router.queryParams()["next"];
    const first = Array.isArray(next) ? next[0] : next;
    return `/${(first ?? "home").replace(/^\/+/, "")}`;
  });
  signIn() {
    this.session.loggedIn.set(true);
    void this.router.navigate(this.wanted());
  }
}

export class NotFoundPage {
  static meta = {
    selector: "mini-not-found",
    template: html`
<h3>Not found</h3>
<p>Nothing matches <code>{{ router.url() }}</code>, so the <code>**</code> route rendered this.</p>
<p><a routerLink="/home">Back home</a></p>
    `,
    imports: [RouterLink],
  };
  router = inject(Router);
}

/** A guard is a plain function that runs in an injection context. */
const requireLogin = () => (inject(Session).loggedIn() ? true : redirect("/login?next=admin"));

/** Long enough to see; a real chunk would be as slow as the network. */
export const LAZY_DELAY_MS = 900;

export const routes: Route[] = [
  { path: "", redirectTo: "/home" },
  { path: "home", component: HomePage },
  {
    path: "users",
    component: UsersLayout,
    children: [
      { path: "", component: UsersIndex },
      { path: ":id", component: UserPage },
    ],
  },
  { path: "admin", component: AdminPage, canActivate: [requireLogin] },
  { path: "login", component: LoginPage },
  { path: "reports", component: lazy(() => new Promise((done) => setTimeout(done, LAZY_DELAY_MS)).then(() => import("./reports.js")), "ReportsPage") },
  { path: "**", component: NotFoundPage },
];
