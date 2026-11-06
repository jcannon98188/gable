import { html, signal, model, output } from "@gable/core";

export class Child {
  static meta = { selector: "x-child", template: html`<i></i>` };
  value = model("");
  picked = output<number>();
}

export class Page {
  static meta = {
    selector: "x-page",
    template: html`
      <button (clck)="noop()">typo</button>
      <button (click)="onKey($event)">wrong arg</button>
      <x-child (pickd)="noop()"></x-child>
      <x-child (picked)="onText($event)"></x-child>
      <input [(value)]="num" />
      <input [(value)]="text" (input)="onInput($event)" />
      <x-child [(value)]="num"></x-child>
      <input (input)="text.set($event.currentTarget.checked)" />
    `,
  };
  text = signal("");
  num = signal(0);
  noop(): void {}
  onKey(event: KeyboardEvent): void {
    void event;
  }
  onText(s: string): void {
    void s;
  }
  onInput(event: Event): void {
    void event;
  }
}
