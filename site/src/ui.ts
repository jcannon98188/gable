import { html, computed, inject } from "@gable/core";
import { ThemeStore } from "./theme.js";

export class UiSection {
  static meta = {
    selector: "site-ui",
    template: html`
<section class="sec" id="ui">
<div class="in">
<div class="grid2">
<div>
<div class="eyebrow">gable-ui</div>
<h2 class="h2">Components you own.</h2>
<p class="lead mut">A shadcn-style component set built for Gable. Add a component with the CLI and the source lands in your project, styled with Tailwind v4 and themed with CSS variables, in light and dark. Change anything. Nothing is hidden in node_modules.</p>
<ul class="chk">
<li><span>Tabs, Dialog, Popover, Select, Command, Tree, Resizable panels, Toast and more.</span></li>
<li><span>Accessible primitives underneath, with keyboard support.</span></li>
<li><span>Retheme by editing variables, not by fighting a library.</span></li>
</ul>
<div class="cmd" style="margin-top: 28px; display: inline-flex"><b>$</b> npx gable-ui add dialog</div>
</div>
<div><img class="shot" [attr.src]="img()" alt="The gable-ui gallery app: buttons, tooltips and dialogs"><div class="cap">The gable-ui gallery, running. Toggle the theme and every component follows.</div></div>
</div>
</div>
</section>
    `,
  };

  theme = inject(ThemeStore);
  img = computed(() => `${import.meta.env.BASE_URL}img/gallery-${this.theme.theme()}.png`);
}
