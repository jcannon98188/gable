import { computed, html, inject, signal } from "@gable/core";
import { Http } from "@gable/core/http";
import { toSignal } from "@gable/core/rxjs";
import { catchError, map, of } from "rxjs";

interface User {
  id: number;
  name: string;
  role: string;
}

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; users: User[] };

/** Loads the users with the Http client (fetch) and the server status with a plain XMLHttpRequest. */
export class NetApp {
  static meta = {
    selector: "net-app",
    template: html`
      <main>
        <h1>Users</h1>
        @if (loading()) {
          <p data-test="loading">Loading users…</p>
        }
        @if (error()) {
          <p data-test="error" role="alert">Could not load users: {{ error() }}</p>
        }
        <ul data-test="users">
          @for (u of users(); track u.id) {
            <li>{{ u.name }} ({{ u.role }})</li>
          }
        </ul>
        <p data-test="status">Server: {{ server() }}</p>
        <p data-test="theme">Theme: {{ theme() }}</p>
        <button data-test="dark" (click)="setTheme('dark')">Dark theme</button>
        <button data-test="login" (click)="signIn()">Sign in</button>
        <p data-test="signed">{{ signed() }}</p>
      </main>
    `,
  };
  http = inject(Http);
  state = toSignal<State>(
    this.http.get<User[]>("/api/users", { params: { limit: 10 } }).pipe(
      map((users): State => ({ status: "ready", users })),
      catchError((e: unknown) => of<State>({ status: "error", message: e instanceof Error ? e.message : String(e) })),
    ),
    { initialValue: { status: "loading" } },
  );
  loading = computed(() => this.state().status === "loading");
  error = computed(() => {
    const s = this.state();
    return s.status === "error" ? s.message : "";
  });
  users = computed(() => {
    const s = this.state();
    return s.status === "ready" ? s.users : [];
  });
  server = probeServer();

  // Storage the Storage check watches: a preference in localStorage, and a sign-in whose session cookie is HttpOnly.
  theme = signal(localStorage.getItem("theme") ?? "light");
  signed = signal("");
  setTheme(theme: string): void {
    localStorage.setItem("theme", theme);
    this.theme.set(theme);
  }
  async signIn(): Promise<void> {
    const res = await fetch("/api/login", { method: "POST" });
    this.signed.set(res.ok ? "Signed in" : `Sign-in failed (${res.status})`);
  }
}

/** Asks the server's status with a plain XMLHttpRequest (not the Http client). */
function probeServer() {
  const state = signal("checking…");
  const xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/status");
  xhr.onload = () => state.set(xhr.status === 200 ? "up" : `answered ${xhr.status}`);
  xhr.onerror = () => state.set("unreachable");
  xhr.send();
  return state;
}
