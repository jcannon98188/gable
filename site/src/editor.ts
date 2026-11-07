import { html, signal } from "@gable/core";

export class EditorSection {
  static meta = {
    selector: "site-editor",
    template: html`
<section class="sec" id="editor">
<div class="in">
<div class="grid2">
<div>
<div class="eyebrow">Gable Editor</div>
<h2 class="h2">Collaborative rich text, built from plugins.</h2>
<p class="lead mut">An editor built on TipTap and ProseMirror for the editing model, with our own Yjs binding for real-time collaboration. Every feature ships as a plugin, so you load only what you use and add your own.</p>
<ul class="chk">
<li><span>Formatting, headings, lists, tasks, links and code blocks as separate plugins.</span></li>
<li><span>Plugins declare dependencies and priorities. Missing or cyclic ones throw clear errors.</span></li>
<li><span>Plugins can own shared Yjs state for collaborative features.</span></li>
<li><span>Headless unless you hand it an element.</span></li>
</ul>
</div>
<div><img class="shot" [attr.src]="img()" alt="Two collaborating Gable Editor instances on the same document"><div class="cap">Two live editors on one Yjs document. Each sees the other's cursor and edits.</div></div>
</div>
</div>
</section>
    `,
  };

  img = signal(`${import.meta.env.BASE_URL}img/editor.png`);
}
