import { html, signal, model, output } from "@gable/core";

export class Child {
  static meta = { selector: "x-child", template: html`<i></i>` };
  value = model("");
  picked = output<number>();
  closed = output();
}

export class Page {
  static meta = {
    selector: "x-page",
    template: html`
      <button (click)="onClick($event)">go</button>
      <input [(value)]="text" (input)="onInput($event)" #box />
      <x-child [(value)]="text" (picked)="onPick($event)" (closed)="reset()" (click)="onClick($event)"></x-child>
      <p (click)="count.set(1)">{{ count() }}</p>
    `,
  };
  text = signal("");
  count = signal(0);
  onClick(event: MouseEvent): void {
    void event;
  }
  onInput(event: Event): void {
    void event;
  }
  onPick(n: number): void {
    void n;
  }
  reset(): void {}
}
