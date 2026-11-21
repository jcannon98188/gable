import { html, signal } from "@gablejs/core";

export class Box {
  static meta = {
    selector: "x-box",
    template: html`
      <div class="p-2 text-red-500" [class.font-bold]="bold()" [class]="classes()">{{ bold() }}</div>
    `,
  };
  bold = signal(true);
  classes = signal("p-4");
}
