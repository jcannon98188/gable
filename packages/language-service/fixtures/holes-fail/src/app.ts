import { html, signal } from "@gable/core";

const color = "red";

export class Box {
  static meta = {
    selector: "x-box",
    template: html`
      <div class="p-2 bg-${color}-500"></div>
      <div class="${color}-500 p-2"></div>
    `,
  };
  hue = signal("red");
}
