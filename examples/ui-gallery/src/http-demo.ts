import { computed, html, inject } from '@gable/core';
import { Http } from '@gable/core/http';
import { toSignal } from '@gable/core/rxjs';
import { catchError, map, of } from 'rxjs';

export interface User {
  id: number;
  name: string;
  role: string;
}

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; users: User[] };

/** A list that loads `/api/users`: the component whose scenarios (see `http-demo.scenes.ts`) mock the HTTP backend. */
export class UserList {
  static meta = {
    selector: 'app-user-list',
    template: html`
      <section class="flex flex-col gap-2" aria-live="polite">
        @if (loading()) {
          <p class="text-muted-foreground">Loading users…</p>
        }
        @if (error()) {
          <p class="text-destructive" role="alert">Could not load users: {{ error() }}</p>
        }
        @if (empty()) {
          <p class="text-muted-foreground">No users yet.</p>
        }
        <ul class="flex flex-col gap-1">
          @for (u of users(); track u.id) {
            <li class="flex justify-between rounded-md border px-3 py-2">
              <span class="font-medium">{{ u.name }}</span>
              <span class="text-muted-foreground">{{ u.role }}</span>
            </li>
          }
        </ul>
      </section>
    `,
  };
  http = inject(Http);
  state = toSignal<State>(
    this.http.get<User[]>('/api/users').pipe(
      map((users): State => ({ status: 'ready', users })),
      catchError((e: unknown) => of<State>({ status: 'error', message: e instanceof Error ? e.message : String(e) })),
    ),
    { initialValue: { status: 'loading' } },
  );
  loading = computed(() => this.state().status === 'loading');
  error = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : '';
  });
  users = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.users : [];
  });
  empty = computed(() => {
    const s = this.state();
    return s.status === 'ready' && s.users.length === 0;
  });
}

/** The demo page: a heading and the list. There is no backend behind `/api/users`; pick a scenario in the Designer. */
export class HttpDemo {
  static meta = {
    selector: 'app-root',
    imports: [UserList],
    template: html`
      <main class="mx-auto flex max-w-xl flex-col gap-6 p-8">
        <h1 class="text-2xl font-semibold">Users</h1>
        <app-user-list></app-user-list>
      </main>
    `,
  };
}
