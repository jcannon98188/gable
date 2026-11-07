import { html } from "@gable/core";
import { SiteNav } from "./site-nav.js";
import { Hero } from "./hero.js";
import { WhatYouGet } from "./what-you-get.js";
import { Compiler } from "./compiler.js";
import { Hmr } from "./hmr.js";
import { Framework } from "./framework.js";
import { Data } from "./data.js";
import { Tooling } from "./tooling.js";
import { UiSection } from "./ui.js";
import { DesignerSection } from "./designer.js";
import { EditorSection } from "./editor.js";
import { Packages } from "./packages.js";
import { Start } from "./start.js";
import { SiteFooter } from "./site-footer.js";

/** The whole page: a nav, a hero, the sections in reading order and a footer. Each part is its own component. */
export class SiteRoot {
  static meta = {
    selector: "site-root",
    imports: [SiteNav, Hero, WhatYouGet, Compiler, Hmr, Framework, Data, Tooling, UiSection, DesignerSection, EditorSection, Packages, Start, SiteFooter],
    template: html`
      <div class="gs" id="top">
        <header class="sec" style="padding: 0">
          <site-nav></site-nav>
          <site-hero></site-hero>
        </header>
        <site-what-you-get></site-what-you-get>
        <site-compiler></site-compiler>
        <site-hmr></site-hmr>
        <site-framework></site-framework>
        <site-data></site-data>
        <site-tooling></site-tooling>
        <site-ui></site-ui>
        <site-designer></site-designer>
        <site-editor></site-editor>
        <site-packages></site-packages>
        <site-start></site-start>
        <site-footer></site-footer>
      </div>
    `,
  };
}
