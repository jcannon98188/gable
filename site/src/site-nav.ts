import { html, inject } from "@gable/core";
import { ThemeStore } from "./theme.js";

export class SiteNav {
  static meta = {
    selector: "site-nav",
    template: html`
<nav class="nav">
<a class="logo" href="#top"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20L12 4l9 16"></path><path d="M8 20l4-7 4 7"></path></svg>Gable</a>
<a href="#compiler">No compiler</a>
<a href="#hmr">True HMR</a>
<a href="#framework">Framework</a>
<a href="#ui">gable-ui</a>
<a href="#designer">Designer</a>
<a href="#editor">Editor</a>
<span style="flex: 1"></span>
<button type="button" class="theme-btn" (click)="theme.toggle()" [attr.aria-label]="theme.label()" [attr.title]="theme.label()">
@if (theme.theme() === 'dark') {
<svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>
} @else {
<svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"></path></svg>
}
</button>
<a href="#start" class="btn btn-a" style="min-height: 38px">Get started</a>
</nav>
    `,
  };

  theme = inject(ThemeStore);
}
