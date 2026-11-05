import { html, input, signal } from "@gable/core";

class Badge {
  static meta = {
    selector: "app-badge",
    styles: ".chip { color: rgb(255, 0, 0); }",
    template: html`<span class="chip">{{ label() }}</span>`,
  };
  label = input("?");
}

/** A small app that touches every part of the DOM renderer: bindings, two-way input, @for, child components, scoped styles, SVG and the DOM defer triggers. */
export class App {
  static meta = {
    selector: "app-root",
    imports: [Badge],
    styles: ":host { display: block; } .count { font-weight: bold; }",
    template: html`
      <h1>{{ title() }}</h1>
      <input class="name" [(value)]="name">
      <p class="greeting">Hello {{ name() }}</p>
      <button class="inc" (click)="inc()">+</button><span class="count">{{ count() }}</span>
      <ul>@for (t of todos(); track t) { <li><app-badge [label]="t"></app-badge></li> }</ul>
      <svg viewBox="0 0 10 10" width="10" height="10"><circle class="dot" cx="5" cy="5" r="4"></circle></svg>
      @defer (on interaction) { <p class="lazy-click">loaded by interaction</p> } @placeholder { <button class="open">open</button> }
      @defer (on viewport) { <p class="lazy-view">loaded by viewport</p> } @placeholder { <div class="vp">visible</div> }
    `,
  };
  title = signal("Gable");
  name = signal("world");
  count = signal(0);
  todos = signal(["write", "test"]);
  inc() {
    this.count.update((n) => n + 1);
  }
}
