import { html, signal } from "@gable/core";

export class Box {
  static meta = {
    selector: "x-box",
    template: html`
      <div [class]="'bg-' + hue()"></div>
      <div [class]="hue() + '-500 p-2'"></div>
    `,
  };
  hue = signal("red");
}
