import { computed, html, input } from "@gable/core";
import { DocCode } from "./doc-code.js";
import { DocInline } from "./doc-inline.js";
import { resolveDocLink } from "./content.js";
import { parseMarkdown, type MarkdownDoc } from "./markdown.js";

/** Renders a parsed markdown document (or a `source` string) as headings, paragraphs, lists, tables and code blocks. */
export class DocMarkdown {
  static meta = {
    selector: "doc-markdown",
    imports: [DocInline, DocCode],
    template: html`
@for (b of parsed().blocks; track b.key) {
@switch (b.kind) {
@case ('h1') {
<h1 class="md-h" [attr.id]="b.id"><doc-inline [runs]="b.inlines"></doc-inline></h1>
}
@case ('h2') {
<h2 class="md-h" [attr.id]="b.id"><doc-inline [runs]="b.inlines"></doc-inline><a class="md-anchor" [attr.href]="b.anchor" aria-label="Link to this section">#</a></h2>
}
@case ('h3') {
<h3 class="md-h" [attr.id]="b.id"><doc-inline [runs]="b.inlines"></doc-inline><a class="md-anchor" [attr.href]="b.anchor" aria-label="Link to this section">#</a></h3>
}
@case ('h4') {
<h4 class="md-h" [attr.id]="b.id"><doc-inline [runs]="b.inlines"></doc-inline></h4>
}
@case ('p') {
<p><doc-inline [runs]="b.inlines"></doc-inline></p>
}
@case ('quote') {
<blockquote><doc-inline [runs]="b.inlines"></doc-inline></blockquote>
}
@case ('code') {
<doc-code [code]="b.code" [language]="b.lang"></doc-code>
}
@case ('ul') {
<ul>@for (it of b.items; track it.key) {<li><doc-inline [runs]="it.inlines"></doc-inline>@if (it.sub.length) {<ul>@for (s of it.sub; track s.key) {<li><doc-inline [runs]="s.inlines"></doc-inline></li>}</ul>}</li>}</ul>
}
@case ('ol') {
<ol>@for (it of b.items; track it.key) {<li><doc-inline [runs]="it.inlines"></doc-inline>@if (it.sub.length) {<ul>@for (s of it.sub; track s.key) {<li><doc-inline [runs]="s.inlines"></doc-inline></li>}</ul>}</li>}</ol>
}
@case ('table') {
<div class="tbl"><table><thead><tr>@for (c of b.head; track c.key) {<th [attr.class]="c.align"><doc-inline [runs]="c.inlines"></doc-inline></th>}</tr></thead><tbody>@for (r of b.rows; track r.key) {<tr>@for (c of r.cells; track c.key) {<td [attr.class]="c.align"><doc-inline [runs]="c.inlines"></doc-inline></td>}</tr>}</tbody></table></div>
}
@case ('hr') {
<hr />
}
}
}
    `,
  };

  /** A parsed document. */
  doc = input<MarkdownDoc | null>(null);
  /** Markdown source, used when `doc` is not set. */
  source = input<string>("");

  parsed = computed<MarkdownDoc>(() => this.doc() ?? parseMarkdown(this.source(), { resolveLink: resolveDocLink }));
}
