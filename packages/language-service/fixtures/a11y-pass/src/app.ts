import { html, signal } from "@gable/core";

export class Panel {
  static meta = { selector: "x-panel", template: html`<i></i>` };
}

export class Good {
  static meta = {
    selector: "x-good",
    imports: [Panel],
    template: html`
      <h1>Title</h1>
      <h2>Section</h2>
      <h3>One level at a time</h3>
      <h2>Back up to any level</h2>
      <img src="a.png" alt="A cat" />
      <img src="deco.png" alt="" />
      <img [src]="url()" [alt]="label()" />
      <button type="button" (click)="go()">Add</button>
      <button aria-label="Close" (click)="go()"><i></i></button>
      <button (click)="go()">{{ label() }}</button>
      <a href="/home">Home</a>
      <a href="/x"><img src="x.png" alt="Logo" /></a>
      <label for="name">Name</label>
      <input id="name" type="text" />
      <label>Email <input type="email" /></label>
      <input type="text" aria-label="Search" />
      <input type="hidden" name="csrf" />
      <input type="submit" value="Go" />
      <select aria-labelledby="name"><option>One</option></select>
      <div role="button" tabindex="0" (click)="go()" (keydown)="go()">Fake</div>
      <div role="tablist" aria-label="Tabs" aria-hidden="false" aria-live="polite" aria-expanded="true"></div>
      <div [attr.aria-label]="label()" [attr.aria-hidden]="hidden()"></div>
      <div tabindex="0"></div>
      <div tabindex="-1"></div>
      <x-panel (click)="go()"></x-panel>
      <dialog open><input aria-label="Name" autofocus /></dialog>
      <div role="dialog" aria-modal="true"><button autofocus>OK</button></div>
    `,
  };
  n = signal(0);
  go() {
    this.n.set(1);
  }
  url = signal("a.png");
  label = signal("x");
  hidden = signal(false);
}
