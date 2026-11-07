import { describe, expect, it } from "vitest";
import { formatTemplate } from "./index.js";

const lines = (...l: string[]) => l.join("\n");

describe("formatTemplate: elements and text", () => {
  it("indents nested block elements and keeps inline-only children on one line", () => {
    expect(formatTemplate("<div><p>hi</p><span>x</span></div>")).toBe(
      lines("<div>", "  <p>hi</p>", "  <span>x</span>", "</div>"),
    );
    expect(formatTemplate("<p>  hello \n   <b>big</b>   world </p>")).toBe("<p>hello <b>big</b> world</p>");
  });

  it("honours indent size, tabs and base indent", () => {
    const src = "<ul><li>a</li></ul>";
    expect(formatTemplate(src, { indentSize: 4 })).toBe(lines("<ul>", "    <li>a</li>", "</ul>"));
    expect(formatTemplate(src, { useTabs: true })).toBe(lines("<ul>", "\t<li>a</li>", "</ul>"));
    expect(formatTemplate(src, { baseIndent: "    " })).toBe(lines("    <ul>", "      <li>a</li>", "    </ul>"));
  });

  it("fills text to the print width without breaking where there was no whitespace", () => {
    const out = formatTemplate("<p>aaaa bbbb cccc dddd eeee</p>", { printWidth: 20 });
    expect(out).toBe(lines("<p>", "  aaaa bbbb cccc", "  dddd eeee", "</p>"));
    expect(formatTemplate("<p>a<b>b</b>,c</p>")).toBe("<p>a<b>b</b>,c</p>");
  });

  it("wraps attributes one per line when the tag is too wide, and keeps values verbatim", () => {
    const out = formatTemplate(`<input   [value]="name()"  (input)="set($event)"  #box disabled>`, { printWidth: 40 });
    expect(out).toBe(lines("<input", `  [value]="name()"`, `  (input)="set($event)"`, "  #box", "  disabled", ">"));
    expect(formatTemplate(`<input   [value]="name()"  #box >`)).toBe(`<input [value]="name()" #box>`);
    expect(formatTemplate(`<br/>`)).toBe("<br />");
    expect(formatTemplate(`<app-x [(m)]='a'/>`)).toBe(`<app-x [(m)]='a' />`);
  });

  it("leaves pre contents and comments alone", () => {
    expect(formatTemplate("<div><pre>  a\n   b</pre></div>")).toBe(lines("<div>", "  <pre>  a\n   b</pre>", "</div>"));
    expect(formatTemplate("<div><!--  keep   me --></div>")).toBe(lines("<div>", "  <!--  keep   me -->", "</div>"));
  });

  it("normalises {{ }} interpolation padding and keeps ${} holes opaque", () => {
    expect(formatTemplate("<p>{{a()}} and {{   b   }}</p>")).toBe("<p>{{ a() }} and {{ b }}</p>");
    expect(formatTemplate("<p>x ${ a  +  b } y</p>")).toBe("<p>x ${ a  +  b } y</p>");
    expect(formatTemplate(`<a href="\${ url }"   class="a">x</a>`)).toBe(`<a href="\${ url }" class="a">x</a>`);
    expect(formatTemplate("<div>${ html`<b> z </b>` }</div>")).toBe("<div>${ html`<b> z </b>` }</div>");
  });
});

describe("formatTemplate: control flow", () => {
  it("formats @if / @else if / @else chains with joined braces", () => {
    const src = "@if(a()){<p>A</p>}@else   if (b()) {<p>B</p>}\n@else{<p>none</p>}";
    expect(formatTemplate(src)).toBe(
      lines("@if (a()) {", "  <p>A</p>", "} @else if (b()) {", "  <p>B</p>", "} @else {", "  <p>none</p>", "}"),
    );
  });

  it("formats @for with @empty, @switch with @case/@default, @let", () => {
    const src =
      "@let n = items().length;@for (i of items();track i.id){<li>{{i.name}}</li>}@empty{<li>none</li>}@switch(k()){@case('a'){<p>a</p>}@default{<p>d</p>}}";
    expect(formatTemplate(src)).toBe(
      lines(
        "@let n = items().length;",
        "@for (i of items(); track i.id) {",
        "  <li>{{ i.name }}</li>",
        "} @empty {",
        "  <li>none</li>",
        "}",
        "@switch (k()) {",
        "  @case ('a') {",
        "    <p>a</p>",
        "  }",
        "  @default {",
        "    <p>d</p>",
        "  }",
        "}",
      ),
    );
  });

  it("puts block statements on their own lines inside elements", () => {
    expect(formatTemplate("<div>@if(x()){<b>y</b>}</div>")).toBe(
      lines("<div>", "  @if (x()) {", "    <b>y</b>", "  }", "</div>"),
    );
  });

  it("collapses runs of blank lines to at most one between siblings", () => {
    expect(formatTemplate("<h1>a</h1>\n\n\n\n<h2>b</h2>\n<h3>c</h3>")).toBe(
      lines("<h1>a</h1>", "", "<h2>b</h2>", "<h3>c</h3>"),
    );
  });
});

describe("formatTemplate: determinism", () => {
  const corpus = [
    "",
    "plain text only",
    "<div><p>hi</p><span>x</span></div>",
    "<p>aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm nnnn oooo pppp qqqq rrrr ssss</p>",
    `<input [value]="name()" (input)="set($event)" #box disabled class="some long class names here to force wrapping">`,
    "@if(a()){<p>A</p>}@else if(b()){<p>B</p>}@else{<p>none</p>}",
    "<ul>@for(i of xs();track i){<li>{{i}}</li>}@empty{<li>-</li>}</ul>",
    "<div><pre>  x\n  y</pre><!-- c --><br></div>",
    "<p>${ a } <a href='${u}'>link</a> {{ b }}</p>",
    "<table><tr><td>1</td><td>2</td></tr></table>",
    "<p>text <b>bold <i>both</i></b> and a much longer tail of words that wraps around the width limit</p>",
  ];
  for (const src of corpus) {
    it(`is idempotent and deterministic for ${JSON.stringify(src.slice(0, 40))}`, () => {
      for (const opts of [{}, { printWidth: 30 }, { useTabs: true, indentSize: 4, baseIndent: "\t\t" }]) {
        const once = formatTemplate(src, opts);
        expect(formatTemplate(src, opts)).toBe(once);
        expect(formatTemplate(once, opts)).toBe(once);
      }
    });
  }
});

describe("formatTemplate: character references", () => {
  it("leaves entities as written in text and attributes", () => {
    const src = '<p title="a &lt; b &quot;c&quot;">1 &lt; 2 &amp;&amp; &#65; a & b</p>';
    expect(formatTemplate(src)).toBe(src);
    expect(formatTemplate("<p>\n  a   &lt;   b\n</p>")).toBe("<p>a &lt; b</p>");
  });

  it("does not split or reflow a reference, and is idempotent", () => {
    const once = formatTemplate("<p>aaaa &amp;&amp; bbbb &lt;c&gt; dddd</p>", { printWidth: 16 });
    expect(once).toContain("&amp;&amp;");
    expect(once).toContain("&lt;c&gt;");
    expect(formatTemplate(once, { printWidth: 16 })).toBe(once);
  });
});
