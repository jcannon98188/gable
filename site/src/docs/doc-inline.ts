import { html, input } from "@gable/core";
import type { Inline } from "./markdown.js";
import { DocLink } from "./doc-link.js";

/** Inline runs of text, code and links. Everything is a text node or an attribute value, never HTML. */
export class DocInline {
  static meta = {
    selector: "doc-inline",
    imports: [DocLink],
    template: html`
@for (r of runs(); track r.key) {@if (r.href) {@if (r.internal) {<a [docLink]="r.href" [attr.class]="r.cls">{{ r.text }}</a>} @else {<a [attr.href]="r.href" [attr.class]="r.cls" rel="noopener">{{ r.text }}</a>}} @else if (r.code) {<code [attr.class]="r.cls">{{ r.text }}</code>} @else {<span [attr.class]="r.cls">{{ r.text }}</span>}}
    `,
  };

  runs = input<readonly Inline[]>([]);
}
