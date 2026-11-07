import { html, signal } from "@gable/core";

export class Page {
  static meta = {
    selector: "x-page",
    template: html`
      <h1 i18n="page title">Welcome</h1>
      <p i18n>Hello {{ name() }}, you have {{ count() }} messages</p>
      <input title="Search" i18n-title="search field" />
      <span i18n="@@note">Saved</span>
      <p>Plain text is never checked</p>
    `,
  };
  name = signal("Ada");
  count = signal(3);
}
