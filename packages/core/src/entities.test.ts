import { describe, expect, it } from "vitest";
import { decodeEntities, encodeEntities } from "./entities.js";
import { extractTemplateMessages } from "./i18n-extract.js";
import { html, parseTemplate, type ElementNode, type TextNode } from "./template.js";

const parse = (src: string) => parseTemplate({ strings: Object.assign([src], { raw: [src] }) as unknown as TemplateStringsArray, values: [] });

describe("decodeEntities", () => {
  it("decodes the named and numeric references", () => {
    expect(decodeEntities("a &lt; b &gt; c &amp; d &quot;e&quot; &apos;f&apos;")).toBe(`a < b > c & d "e" 'f'`);
    expect(decodeEntities("&nbsp;")).toBe(" ");
    expect(decodeEntities("&#60;&#x3C;&#x3c;&#128512;")).toBe("<<<\u{1F600}");
  });

  it("leaves lone ampersands, unknown names and invalid numbers as written", () => {
    for (const s of ["a && b", "a & b", "&", "&;", "&copy;", "&#0;", "&#xD800;", "&#99999999;", "&amp", "&lt"]) expect(decodeEntities(s)).toBe(s);
  });

  it("decodes once: &amp;lt; is the text &lt;", () => {
    expect(decodeEntities("&amp;lt;")).toBe("&lt;");
  });

  it("encodes text back so decoding restores it", () => {
    for (const s of ["a < b", "&lt;", "Tom & Jerry", "&&", "&#60; &amp;"]) expect(decodeEntities(encodeEntities(s))).toBe(s);
    expect(encodeEntities("Tom & Jerry")).toBe("Tom & Jerry");
  });
});

describe("character references in templates", () => {
  it("decodes static text but not the {{ }} expressions", () => {
    const [p] = parse(`<p>a &lt; b &amp;&amp; {{ x && y }} &#65;&#x42;</p>`) as ElementNode[];
    const text = p!.children[0] as TextNode;
    expect(text.parts[0]).toBe("a < b && ");
    expect(typeof text.parts[1]).toBe("object");
    expect(text.parts[2]).toBe(" AB");
  });

  it("keeps lone ampersands as written", () => {
    const [p] = parse(`<p>a && b & c</p>`) as ElementNode[];
    expect((p!.children[0] as TextNode).parts).toEqual(["a && b & c"]);
  });

  it("decodes static attribute values, and leaves binding and event expressions alone", () => {
    const [el] = parse(`<a title="a &quot;b&quot; &lt;c&gt;" [hidden]="a && b" (click)="go(1 < 2)"></a>`) as ElementNode[];
    expect(el!.attrs).toEqual([{ name: "title", value: `a "b" <c>` }]);
    expect(el!.bindings[0]!.expr).toBeDefined();
    expect(el!.events[0]!.name).toBe("click");
  });

  it("does not let a decoded {{ become an interpolation", () => {
    const [p] = parse(`<p>&#123;&#123; x }}</p>`) as ElementNode[];
    expect((p!.children[0] as TextNode).parts).toEqual(["{{ x }}"]);
  });

  it("html`` still returns the source string untouched", () => {
    expect(html`<p>&lt;</p>`.strings[0]).toBe("<p>&lt;</p>");
  });
});

describe("i18n messages with character references", () => {
  it("extracts the decoded text, so a message with &lt; round-trips", () => {
    const [text, attr] = extractTemplateMessages(`<p i18n>if a &lt; b then {{ x }} &amp; more</p><i title="1 &lt; 2" i18n-title></i>`);
    expect(text!.message).toBe("if a < b then {0} & more");
    expect(attr!.message).toBe("1 < 2");
  });
});
