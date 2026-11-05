import { html, signal } from "@gable/core";

const accent = "text-red-500";

export class Box {
  static meta = {
    selector: "x-box",
    template: html`
      <div class="p-2 text-red-500 ${accent}" [class.font-bold]="bold()" [class]="classes()">{{ bold() }}</div>
      <div title="x-${accent}"></div>
    `,
  };
  bold = signal(true);
  classes = signal("p-4");
}
