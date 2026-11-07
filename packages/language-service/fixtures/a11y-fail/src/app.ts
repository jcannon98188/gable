import { html, signal } from "@gable/core";

export class Bad {
  static meta = {
    selector: "x-bad",
    template: html`
      <h1>Title</h1>
      <h3>Skipped</h3>
      <img src="a.png" />
      <button type="button" (click)="go()"></button>
      <a href="/x"></a>
      <input type="text" placeholder="Name" />
      <textarea></textarea>
      <div role="buton" aria-lable="x" aria-hidden="yes"></div>
      <div (click)="go()">Click me</div>
      <div role="button" (click)="go()">No keys</div>
      <div tabindex="3"></div>
      <div [attr.tabindex]="2"></div>
      <input aria-label="Name" autofocus />
    `,
  };
  n = signal(0);
  go() {
    this.n.set(1);
  }
}
