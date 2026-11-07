import { I18n, html, i18n, signal } from "@gable/core";

export class Good {
  static meta = {
    selector: "x-good",
    template: html`
      <h1 i18n="page title">Welcome</h1>
      <p i18n>Hello {{ name() }}, you have {{ count() }} messages</p>
      <span i18n="note@@note-id">Saved</span>
      <input title="Search" i18n-title="search field" placeholder="Type here" i18n-placeholder="@@ph" />
      <img src="a.png" alt="Logo" i18n-alt />
      <p>Untranslated text is fine</p>
      <input [title]="label()" />
    `,
  };
  name = signal("Ada");
  count = signal(3);
  label = i18n`Search`;
}
