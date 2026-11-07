import { computed, html, input } from "@gable/core";
import type { ApiMember, ApiParam, ApiSymbol } from "./api-types.js";
import { REPO } from "./base.js";
import { DocCode } from "./doc-code.js";
import { DocInline } from "./doc-inline.js";
import { DocMarkdown } from "./doc-markdown.js";
import { resolveDocLink } from "./content.js";
import { parseInline, slugify, type Inline, type TocItem } from "./markdown.js";

const inlines = (text: string | undefined): Inline[] => (text ? parseInline(text.replace(/\s+/g, " ").trim(), { resolveLink: resolveDocLink }) : []);

const list = (value: string[] | string | undefined): string[] => (Array.isArray(value) ? value : value ? [value] : []);

interface ParamVM {
  key: number;
  name: string;
  type: string;
  optional: string;
  desc: Inline[];
}
interface MemberVM {
  key: number;
  id: string;
  name: string;
  kind: string;
  flags: string;
  signature: string;
  summary: Inline[];
  deprecated: boolean;
  deprecatedText: Inline[];
  params: ParamVM[];
  returnsType: string;
  returnsDesc: Inline[];
  hasReturns: boolean;
}
interface TypeParamVM {
  key: number;
  name: string;
  detail: string;
  desc: Inline[];
}
interface ExampleVM {
  key: number;
  code: string;
}

const paramVM = (p: ApiParam, key: number): ParamVM => ({ key, name: p.name, type: p.type, optional: p.optional ? "optional" : "", desc: inlines(p.description) });

const memberVM = (m: ApiMember, key: number): MemberVM => ({
  key,
  id: `member-${slugify(m.name)}`,
  name: m.name,
  kind: m.kind,
  flags: [m.static ? "static" : "", m.readonly ? "readonly" : "", m.optional ? "optional" : ""].filter(Boolean).join(" "),
  signature: m.signature,
  summary: inlines(m.summary),
  deprecated: !!m.deprecated,
  deprecatedText: inlines(typeof m.deprecated === "string" ? m.deprecated : ""),
  params: (m.params ?? []).map(paramVM),
  returnsType: m.returns?.type ?? "",
  returnsDesc: inlines(m.returns?.description),
  hasReturns: !!m.returns?.type && m.returns.type !== "void",
});

/** The on-page contents of a symbol page: the sections it has, and its members. */
export function symbolToc(s: ApiSymbol): TocItem[] {
  const toc: TocItem[] = [];
  if (s.typeParams?.length) toc.push({ id: "type-parameters", text: "Type parameters", level: 2 });
  if (s.params?.length) toc.push({ id: "parameters", text: "Parameters", level: 2 });
  if (s.returns?.type && s.returns.type !== "void") toc.push({ id: "returns", text: "Returns", level: 2 });
  if (s.remarks) toc.push({ id: "remarks", text: "Remarks", level: 2 });
  if (s.examples.length) toc.push({ id: "examples", text: "Examples", level: 2 });
  if (s.members?.length) {
    toc.push({ id: "members", text: "Members", level: 2 });
    for (const m of s.members) toc.push({ id: `member-${slugify(m.name)}`, text: m.name, level: 3 });
  }
  if (s.see?.length) toc.push({ id: "see-also", text: "See also", level: 2 });
  return toc;
}

/** One documented symbol: signature, summary, parameters, return value, examples, members and a source link. */
export class SymbolView {
  static meta = {
    selector: "docs-symbol",
    imports: [DocCode, DocInline, DocMarkdown],
    template: html`
<article class="md api">
<p class="api-kind">{{ kind() }}</p>
<h1 class="md-h">{{ name() }}</h1>
@if (deprecated()) {
<div class="dep" role="note"><b>Deprecated.</b> <doc-inline [runs]="deprecatedText()"></doc-inline></div>
}
<doc-code [code]="signature()" language="ts"></doc-code>
<div class="api-sum"><doc-markdown [source]="summary()"></doc-markdown></div>
@if (extendsList().length) {
<p class="api-rel"><b>Extends</b> @for (e of extendsList(); track e) {<code>{{ e }}</code> }</p>
}
@if (implementsList().length) {
<p class="api-rel"><b>Implements</b> @for (e of implementsList(); track e) {<code>{{ e }}</code> }</p>
}
@if (typeParams().length) {
<h2 class="md-h" id="type-parameters">Type parameters</h2>
<div class="tbl"><table><thead><tr><th>Name</th><th>Details</th></tr></thead><tbody>@for (t of typeParams(); track t.key) {<tr><td><code>{{ t.name }}</code></td><td><code>{{ t.detail }}</code> <doc-inline [runs]="t.desc"></doc-inline></td></tr>}</tbody></table></div>
}
@if (params().length) {
<h2 class="md-h" id="parameters">Parameters</h2>
<div class="tbl"><table><thead><tr><th>Name</th><th>Type</th><th>Description</th></tr></thead><tbody>@for (p of params(); track p.key) {<tr><td><code>{{ p.name }}</code> <small class="mut">{{ p.optional }}</small></td><td><code>{{ p.type }}</code></td><td><doc-inline [runs]="p.desc"></doc-inline></td></tr>}</tbody></table></div>
}
@if (hasReturns()) {
<h2 class="md-h" id="returns">Returns</h2>
<p><code>{{ returnsType() }}</code> <doc-inline [runs]="returnsDesc()"></doc-inline></p>
}
@if (remarks()) {
<h2 class="md-h" id="remarks">Remarks</h2>
<doc-markdown [source]="remarks()"></doc-markdown>
}
@if (examples().length) {
<h2 class="md-h" id="examples">Examples</h2>
@for (ex of examples(); track ex.key) {
<doc-code [code]="ex.code" language="ts"></doc-code>
}
}
@if (members().length) {
<h2 class="md-h" id="members">Members</h2>
@for (m of members(); track m.key) {
<section class="member" [attr.aria-labelledby]="m.id">
<h3 class="md-h" [attr.id]="m.id"><code>{{ m.name }}</code><span class="api-kind">{{ m.kind }} {{ m.flags }}</span></h3>
@if (m.deprecated) {
<div class="dep" role="note"><b>Deprecated.</b> <doc-inline [runs]="m.deprecatedText"></doc-inline></div>
}
<pre class="sig"><code>{{ m.signature }}</code></pre>
<p><doc-inline [runs]="m.summary"></doc-inline></p>
@if (m.params.length) {
<div class="tbl"><table><thead><tr><th>Parameter</th><th>Type</th><th>Description</th></tr></thead><tbody>@for (p of m.params; track p.key) {<tr><td><code>{{ p.name }}</code> <small class="mut">{{ p.optional }}</small></td><td><code>{{ p.type }}</code></td><td><doc-inline [runs]="p.desc"></doc-inline></td></tr>}</tbody></table></div>
}
@if (m.hasReturns) {
<p><b>Returns</b> <code>{{ m.returnsType }}</code> <doc-inline [runs]="m.returnsDesc"></doc-inline></p>
}
</section>
}
}
@if (see().length) {
<h2 class="md-h" id="see-also">See also</h2>
<ul>@for (s of see(); track s) {<li>{{ s }}</li>}</ul>
}
@if (sourceUrl()) {
<p class="api-src"><a [attr.href]="sourceUrl()" rel="noopener">View source</a></p>
}
</article>
    `,
  };

  symbol = input.required<ApiSymbol>();

  name = computed(() => this.symbol().name);
  kind = computed(() => this.symbol().kind);
  signature = computed(() => this.symbol().signature);
  summary = computed(() => this.symbol().summary ?? "");
  remarks = computed(() => this.symbol().remarks ?? "");
  deprecated = computed(() => !!this.symbol().deprecated);
  deprecatedText = computed(() => inlines(typeof this.symbol().deprecated === "string" ? (this.symbol().deprecated as string) : ""));
  extendsList = computed(() => list(this.symbol().extends));
  implementsList = computed(() => list(this.symbol().implements));
  see = computed(() => this.symbol().see ?? []);
  params = computed(() => (this.symbol().params ?? []).map(paramVM));
  hasReturns = computed(() => !!this.symbol().returns?.type && this.symbol().returns?.type !== "void");
  returnsType = computed(() => this.symbol().returns?.type ?? "");
  returnsDesc = computed(() => inlines(this.symbol().returns?.description));
  typeParams = computed<TypeParamVM[]>(() =>
    (this.symbol().typeParams ?? []).map((t, key) =>
      typeof t === "string"
        ? { key, name: t, detail: "", desc: [] }
        : { key, name: t.name, detail: [t.constraint ? `extends ${t.constraint}` : "", t.default ? `= ${t.default}` : ""].filter(Boolean).join(" "), desc: inlines(t.description) },
    ),
  );
  examples = computed<ExampleVM[]>(() => (this.symbol().examples ?? []).map((code, key) => ({ key, code })));
  members = computed(() => (this.symbol().members ?? []).map(memberVM));
  sourceUrl = computed(() => {
    const file = this.symbol().sourceFile;
    return file ? `${REPO}/blob/main/${file.replace(/^\/+/, "")}` : "";
  });
}
