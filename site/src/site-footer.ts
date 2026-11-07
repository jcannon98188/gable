import { html } from "@gable/core";

export class SiteFooter {
  static meta = {
    selector: "site-footer",
    template: html`
<footer class="foot">
<div class="in" style="display: flex; gap: 48px; flex-wrap: wrap; justify-content: space-between">
<div style="max-width: 300px"><a class="logo" href="#top"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20L12 4l9 16"></path><path d="M8 20l4-7 4 7"></path></svg>Gable</a><p class="mut" style="margin-top: 12px; font-size: 14px">A client-side framework with true HMR and no framework compiler.</p></div>
<div class="fl"><div><b>Framework</b><a href="#compiler">No compiler</a><a href="#hmr">True HMR</a><a href="#framework">Templates</a></div><div><b>Tools</b><a href="#ui">gable-ui</a><a href="#designer">Designer</a><a href="#editor">Editor</a></div><div><b>Project</b><a href="https://github.com/jcannon98188/gable/tree/main/docs">Docs</a><a href="https://github.com/jcannon98188/gable">GitHub</a></div></div>
</div>
</footer>
    `,
  };
}
