import { html, signal } from "@gable/core";

export class Page {
  static meta = {
    selector: "x-unmarked",
    template: html`
      <h1 i18n="page title">Welcome</h1>
      <h2>Unmarked heading</h2>
      <p>Hello {{ name() }}, nice to see you</p>
      <p>   </p>
      <span>42 / 100 %</span>
      <span>{{ name() }}</span>
      <span>{{ count() }} - {{ count() }}</span>
      <input title="Search" placeholder="Type here" i18n-placeholder />
      <img src="a.png" alt="Logo" />
      <p i18n-ignore>Brand Name</p>
      <div i18n-ignore><p>Inside an ignored subtree</p><input title="Also ignored" /></div>
      @if (name()) {
        <b>Inside a block</b>
      }
      <code>npm install</code>
    `,
  };
  name = signal("Ada");
  count = signal(3);
}
