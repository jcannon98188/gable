import { describe, expect, it } from "vitest";
import { I18n, i18n, html, inject, signal, computed } from "@gable/core";
import { extractTemplateMessages, messageId } from "@gable/core/tooling";
import { mount } from "@gable/testing";

const id = messageId;

class Greeting {
  static meta = {
    selector: "app-greeting",
    template: html`
      <h1 i18n="page title">Welcome</h1>
      <p i18n="greeting">Hello {{ name() }}, you have {{ count() }} messages</p>
      <input title="Search" i18n-title="search title" placeholder="Type here" i18n-placeholder="@@ph" />
      <span i18n="@@fixed">Fixed id</span>
      <b>Not translated</b>
    `,
  };
  name = signal("Ada");
  count = signal(3);
}

const fr = {
  [id("Welcome", "page title")]: "Bienvenue",
  [id("Hello {0}, you have {1} messages", "greeting")]: "{1, plural, one {# message} other {# messages}} pour {0}",
  [id("Search", "search title")]: "Rechercher",
  ph: "Tapez ici",
  fixed: "Id fixe",
};

describe("template markers", () => {
  it("render the source text with no catalog", () => {
    const f = mount(Greeting);
    expect(f.textOf(f.query("h1")!)).toBe("Welcome");
    expect(f.textOf(f.query("p")!)).toBe("Hello Ada, you have 3 messages");
    expect(f.query("input")!.attrs).toMatchObject({ title: "Search", placeholder: "Type here" });
    expect(f.query("input")!.attrs).not.toHaveProperty("i18n-title");
    expect(f.textOf(f.query("span")!)).toBe("Fixed id");
  });

  it("resolve against the catalog, reorder placeholders, and keep following signals", async () => {
    const f = mount(Greeting, { i18n: { locale: "fr", catalogs: { fr } } });
    expect(f.textOf(f.query("h1")!)).toBe("Bienvenue");
    expect(f.textOf(f.query("p")!)).toBe("3 messages pour Ada");
    expect(f.query("input")!.attrs).toMatchObject({ title: "Rechercher", placeholder: "Tapez ici" });
    expect(f.textOf(f.query("span")!)).toBe("Id fixe");
    expect(f.textOf(f.query("b")!)).toBe("Not translated");
    f.instance.count.set(1);
    f.instance.name.set("Bob");
    await f.flush();
    expect(f.textOf(f.query("p")!)).toBe("1 message pour Bob");
    expect(f.i18n.missing).toEqual([]);
  });

  it("re-render when the locale changes, loading the catalog first", async () => {
    const loaded: string[] = [];
    const f = mount(Greeting, {
      i18n: {
        loader: async (locale) => {
          loaded.push(locale);
          return { default: { locale, translations: fr } };
        },
      },
    });
    expect(f.i18n.locale()).toBe("en");
    const switching = f.i18n.setLocale("fr");
    expect(f.i18n.locale()).toBe("en"); // old locale until the catalog arrives
    await switching;
    await f.flush();
    expect(loaded).toEqual(["fr"]);
    expect(f.textOf(f.query("h1")!)).toBe("Bienvenue");
    expect(f.query("input")!.attrs.title).toBe("Rechercher");
    await f.i18n.setLocale("en");
    await f.flush();
    expect(f.textOf(f.query("h1")!)).toBe("Welcome");
    expect(f.textOf(f.query("p")!)).toBe("Hello Ada, you have 3 messages");
    expect(loaded).toEqual(["fr"]); // the source locale needs no catalog
  });

  it("update when a catalog is registered later, and fall back by language", async () => {
    const f = mount(Greeting, { i18n: { locale: "fr-CA" } });
    expect(f.textOf(f.query("h1")!)).toBe("Welcome");
    f.i18n.register("fr", fr);
    await f.flush();
    expect(f.textOf(f.query("h1")!)).toBe("Bienvenue");
  });

  it("falls back to the source text and records missing translations once", async () => {
    const f = mount(Greeting, { i18n: { locale: "de", catalogs: { de: { [id("Welcome", "page title")]: "Willkommen" } } } });
    expect(f.textOf(f.query("h1")!)).toBe("Willkommen");
    expect(f.textOf(f.query("span")!)).toBe("Fixed id");
    f.instance.count.set(4);
    await f.flush();
    expect(f.i18n.missing.map((m) => m.id).sort()).toEqual([id("Hello {0}, you have {1} messages", "greeting"), id("Search", "search title"), "fixed", "ph"].sort());
    expect(f.i18n.missing.find((m) => m.id === "fixed")).toMatchObject({ locale: "de", message: "Fixed id" });
  });

  it("does not report missing translations in the source locale", () => {
    const f = mount(Greeting, { i18n: { locale: "en-GB" } });
    expect(f.i18n.missing).toEqual([]);
  });

  it("falls back to the source for a malformed translation", () => {
    const f = mount(Greeting, { i18n: { locale: "fr", catalogs: { fr: { fixed: "Broken {" } } } });
    expect(f.textOf(f.query("span")!)).toBe("Fixed id");
    expect(f.i18n.missing).toHaveLength(5);
  });

  it("warns on the console in dev when nothing collects missing translations", () => {
    const calls: unknown[][] = [];
    const warn = console.warn;
    console.warn = (...a: unknown[]) => void calls.push(a);
    try {
      mount(Greeting, { i18n: { locale: "de", onMissing: undefined } });
    } finally {
      console.warn = warn;
    }
    expect(String(calls[0]![0])).toMatch(/\[gable\] i18n: no translation for de/);
  });
});

describe("i18n tag", () => {
  class Status {
    static meta = {
      selector: "app-status",
      template: html`<p>{{ summary() }}</p><i>{{ plain() }}</i><u>{{ named() }}</u>`,
    };
    items = signal(2);
    who = signal("Ada");
    summary = i18n`${this.who} has ${this.items} items`;
    named = i18n`:order status@@status:Ready`;
    #service = inject(I18n);
    plain = computed(() => this.#service.t`Total: ${this.items()}`);
  }

  it("is a signal that follows the locale and the signals in its holes", async () => {
    const f = mount(Status, {
      i18n: {
        catalogs: {
          fr: { [id("{0} has {1} items")]: "{0} a {1, plural, one {# objet} other {# objets}}", [id("Total: {0}")]: "Total : {0, number}", status: "Prêt" },
        },
      },
    });
    expect(f.textOf(f.query("p")!)).toBe("Ada has 2 items");
    expect(f.textOf(f.query("u")!)).toBe("Ready");
    await f.i18n.setLocale("fr");
    await f.flush();
    expect(f.textOf(f.query("p")!)).toBe("Ada a 2 objets");
    expect(f.textOf(f.query("i")!)).toBe("Total : 2");
    expect(f.textOf(f.query("u")!)).toBe("Prêt");
    f.instance.items.set(1);
    f.instance.who.set("Bob");
    await f.flush();
    expect(f.textOf(f.query("p")!)).toBe("Bob a 1 objet");
  });
});

describe("misuse is rejected at parse time", () => {
  class Bad1 {
    static meta = { selector: "app-bad1", template: html`<p i18n="x">Hello <b>there</b></p>` };
  }
  class Bad2 {
    static meta = { selector: "app-bad2", template: html`<input i18n-title="x" />` };
  }
  it("rejects element children other than text, and i18n-<attr> without the attribute", () => {
    expect(() => mount(Bad1)).toThrow(/may only contain text/);
    expect(() => mount(Bad2)).toThrow(/needs a static title/);
  });
});

describe("extraction", () => {
  const source = `
<h1 i18n="page title">Welcome</h1>
@if (ok()) {
  <p i18n>Hello {{ user.name }}, {{ count }} new</p>
}
<img alt="Logo" i18n-alt="@@logo" />
<span i18n="a @@kept">{ literal }</span>
<p>Untouched</p>`;

  it("finds every message with ids, placeholders and locations", () => {
    expect(extractTemplateMessages(source, { file: "a.ts", firstLine: 10 })).toEqual([
      { id: id("Welcome", "page title"), message: "Welcome", description: "page title", placeholders: [], location: "a.ts:11" },
      { id: id("Hello {0}, {1} new", ""), message: "Hello {0}, {1} new", description: "", placeholders: ["user.name", "count"], location: "a.ts:13" },
      { id: "logo", message: "Logo", description: "", placeholders: [], location: "a.ts:15" },
      { id: "kept", message: "\\{ literal \\}", description: "a", placeholders: [], location: "a.ts:16" },
    ]);
  });

  it("gives the ids the runtime looks up", () => {
    const [first] = extractTemplateMessages(`<h1 i18n="page title">Welcome</h1>`);
    const f = mount(Greeting, { i18n: { locale: "fr", catalogs: { fr } } });
    expect(f.textOf(f.query("h1")!)).toBe(fr[first!.id]);
  });
});

describe("i18n-ignore", () => {
  it("is a lint hint only: it is not rendered and adds no message", () => {
    class Brand {
      static meta = { selector: "app-brand", template: html`<p i18n-ignore class="x">Acme Inc</p>` };
    }
    const f = mount(Brand);
    expect(f.textOf(f.query("p")!)).toBe("Acme Inc");
    expect(f.query("p")!.attrs).not.toHaveProperty("i18n-ignore");
    expect(extractTemplateMessages(`<p i18n-ignore>Acme Inc</p>`)).toEqual([]);
  });
});
