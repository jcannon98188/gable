import { html, signal } from '@gable/core';
import { RouterLink, RouterLinkActive, RouterOutlet, type Route } from '@gable/core/router';
import { UiPresence } from '@gable/ui-primitives';

class Home {
  static meta = { selector: 'demo-home', template: html`<h2>Home</h2><p>Each page enters with <code>[data-state=open]</code> and leaves with <code>[data-state=closed]</code>.</p>` };
}

/** A list animated with presence: rows animate in on add, and stay mounted until their exit animation ends on remove. */
class Inbox {
  static meta = {
    selector: 'demo-inbox',
    imports: [UiPresence],
    template: html`
      <h2>Inbox</h2>
      <button id="add" (click)="add()">Add message</button>
      <ul>
        @for (m of messages(); track m.id) {
          <li uiPresence class="row"><span>{{ m.text }}</span> <button class="remove" (click)="remove(m.id)">Remove</button></li>
        }
      </ul>
    `,
  };
  next = 3;
  messages = signal([
    { id: 1, text: 'Welcome' },
    { id: 2, text: 'Your invoice' },
  ]);
  add(): void {
    const id = this.next++;
    this.messages.update((list) => [...list, { id, text: `Message ${id}` }]);
  }
  remove(id: number): void {
    this.messages.update((list) => list.filter((m) => m.id !== id));
  }
}

class About {
  static meta = { selector: 'demo-about', template: html`<h2>About</h2><p>This page opts out of animation with <code>transition: false</code> on its route.</p>` };
}

/** Pages are animated by the outlet's `transition`; `about` opts out. */
export const transitionRoutes: Route[] = [
  { path: '', component: Home },
  { path: 'inbox', component: Inbox },
  { path: 'about', component: About, transition: false },
];

/**
 * Route transitions and list animation. The outlet keeps the outgoing page mounted, marked `data-state="closed"`, until
 * its CSS animation ends, while the new page enters on top of it (both sit in one grid cell). Under
 * `prefers-reduced-motion` the swap is immediate. Provide `provideRouteTransitions({ mode: 'view' })` instead to use the
 * View Transitions API. Open `/transitions.html` in the dev server.
 */
export class TransitionsDemo {
  static meta = {
    selector: 'app-root',
    imports: [RouterOutlet, RouterLink, RouterLinkActive],
    // Not scoped: the rules style the routed pages, which are other components.
    encapsulation: 'none' as const,
    styles: `
      app-root nav { display: flex; gap: 1rem; padding: 1rem; }
      app-root a.on { font-weight: 600; text-decoration: underline; }
      app-root router-outlet { display: grid; padding: 1rem; overflow: hidden; }
      app-root router-outlet > * { grid-area: 1 / 1; }
      app-root router-outlet > [data-state='open'] { animation: demo-in 250ms ease-out; }
      app-root router-outlet > [data-state='closed'] { animation: demo-out 250ms ease-in forwards; }
      app-root .row { animation: demo-in 200ms ease-out; display: flex; gap: .5rem; }
      app-root .row[data-state='closed'] { animation: demo-out 200ms ease-in forwards; }
      @keyframes demo-in { from { opacity: 0; transform: translateX(16px); } }
      @keyframes demo-out { to { opacity: 0; transform: translateX(-16px); } }
      @media (prefers-reduced-motion: reduce) { app-root * { animation-duration: 1ms !important; } }
    `,
    template: html`
      <nav>
        <a routerLink="/" routerLinkActive="on" [routerLinkActiveExact]="true">Home</a>
        <a routerLink="/inbox" routerLinkActive="on">Inbox</a>
        <a routerLink="/about" routerLinkActive="on">About</a>
      </nav>
      <router-outlet transition></router-outlet>
    `,
  };
}
