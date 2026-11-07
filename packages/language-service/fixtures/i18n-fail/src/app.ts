import { html, signal } from "@gable/core";

export class Bad {
  static meta = {
    selector: "x-bad",
    template: html`
      <p i18n="nothing"></p>
      <p i18n>{{ name() }}</p>
      <p i18n="mixed">Hello <b>world</b></p>
      <input aria-label="a" i18n-title="missing" />
      <input aria-label="b" [title]="name()" i18n-title="bound" />
      <p i18n="empty id@@">Text</p>
    `,
  };
  name = signal("Ada");
}
