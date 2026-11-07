import { describe, expect, it } from "vitest";
import {
  MessageSyntaxError,
  escapeMessageText,
  formatMessage,
  fromXliff,
  mergeExtracted,
  messageArguments,
  messageFromParts,
  messageFromStrings,
  messageId,
  parseMarker,
  readCatalog,
  sourceCatalogJson,
  toXliff,
  type ExtractedMessage,
} from "./i18n-message.js";

describe("placeholders", () => {
  it("fills numbered and named placeholders, and lets translators reorder them", () => {
    expect(formatMessage("Hello {0}, you have {1} messages", ["Ada", 3])).toBe("Hello Ada, you have 3 messages");
    expect(formatMessage("{1} Nachrichten für {0}", ["Ada", 3], "de")).toBe("3 Nachrichten für Ada");
    expect(formatMessage("Hi {name}", { name: "Ada" })).toBe("Hi Ada");
    expect(formatMessage("a{0}b", [])).toBe("ab");
  });

  it("escapes braces with a backslash", () => {
    expect(formatMessage("use \\{x\\} and \\\\ and \\# and a\\b")).toBe("use {x} and \\ and # and a\\b");
    expect(formatMessage(escapeMessageText("{ \\ }"))).toBe("{ \\ }");
  });

  it("lists the arguments a message uses", () => {
    expect(messageArguments("{0} {n, plural, one {# a {1}} other {{0}}}")).toEqual(["0", "n", "1"]);
  });
});

describe("plural", () => {
  const msg = "{n, plural, =0 {No items} one {# item} other {# items}}";
  it("selects by Intl.PluralRules and exact matches, formatting #", () => {
    expect(formatMessage(msg, { n: 0 })).toBe("No items");
    expect(formatMessage(msg, { n: 1 })).toBe("1 item");
    expect(formatMessage(msg, { n: 1234 })).toBe("1,234 items");
  });

  it("uses the locale's categories", () => {
    const ru = "{0, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}";
    expect(formatMessage(ru, [1], "ru")).toBe("1 файл");
    expect(formatMessage(ru, [3], "ru")).toBe("3 файла");
    expect(formatMessage(ru, [5], "ru")).toBe("5 файлов");
  });

  it("supports offset and selectordinal", () => {
    const m = "{n, plural, offset:1 =0 {nobody} =1 {just you} one {you and # other} other {you and # others}}";
    expect(formatMessage(m, { n: 0 })).toBe("nobody");
    expect(formatMessage(m, { n: 2 })).toBe("you and 1 other");
    expect(formatMessage(m, { n: 4 })).toBe("you and 3 others");
    const o = "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}";
    expect([1, 2, 3, 4, 11, 22].map((n) => formatMessage(o, { n }))).toEqual(["1st", "2nd", "3rd", "4th", "11th", "22nd"]);
  });
});

describe("select", () => {
  const m = "{who, select, male {He left} female {She left} other {They left}}";
  it("picks the branch, else other", () => {
    expect(formatMessage(m, { who: "female" })).toBe("She left");
    expect(formatMessage(m, { who: "x" })).toBe("They left");
    expect(formatMessage(m, {})).toBe("They left");
  });

  it("nests inside plural with # and placeholders", () => {
    const n = "{n, plural, one {{who, select, a {A has # item} other {# item for {who}}}} other {# items}}";
    expect(formatMessage(n, { n: 1, who: "a" })).toBe("A has 1 item");
    expect(formatMessage(n, { n: 1, who: "bo" })).toBe("1 item for bo");
  });
});

describe("number and date", () => {
  it("formats with Intl", () => {
    expect(formatMessage("{0, number}", [1234.5])).toBe("1,234.5");
    expect(formatMessage("{0, number}", [1234.5], "de")).toBe("1.234,5");
    expect(formatMessage("{0, number, percent}", [0.25])).toBe("25%");
    expect(formatMessage("{0, number, currency:EUR}", [5], "en")).toBe("€5.00");
    expect(formatMessage("{0, number, integer}", [2.6])).toBe("3");
  });

  it("formats dates and times in the locale", () => {
    const d = new Date(Date.UTC(2024, 2, 5, 12, 0));
    expect(formatMessage("{0, date, long}", [d], "en")).toBe(new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(d));
    expect(formatMessage("{0, date}", [d], "de")).toBe(new Intl.DateTimeFormat("de", { dateStyle: "medium" }).format(d));
    expect(formatMessage("{0, time, short}", [d], "en")).toBe(new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(d));
  });

  it("falls back to English for an invalid locale", () => {
    expect(formatMessage("{0, number}", [1234], "not a locale")).toBe("1,234");
  });
});

describe("syntax errors", () => {
  it.each([
    ["{", "Unterminated"],
    ["}", "Unmatched"],
    ["{n, plural, one {x}}", 'needs an "other"'],
    ["{n, plural, many2 {x} other {y}}", "not a plural category"],
    ["{n, bogus}", "Unknown argument type"],
    ["{}", "Empty placeholder"],
    ["{n, select, a {x}", "Unterminated"],
  ])("rejects %j", (source, text) => {
    expect(() => formatMessage(source)).toThrow(MessageSyntaxError);
    expect(() => formatMessage(source)).toThrow(text);
  });
});

describe("ids", () => {
  it("is a stable 16-digit hex hash of message and description", () => {
    expect(messageId("Hello")).toMatch(/^[0-9a-f]{16}$/);
    expect(messageId("Hello")).toBe(messageId("Hello", ""));
    expect(messageId("Hello")).not.toBe(messageId("Hello", "greeting"));
    expect(messageId("Hello")).not.toBe(messageId("hello"));
    // Pinned: changing the algorithm invalidates every catalog.
    expect(messageId("Hello")).toBe("92251de07c5a32d1");
    expect(messageId("", "")).toBe("af63bd4c8601b7df");
  });

  it("parses markers", () => {
    expect(parseMarker("")).toEqual({ description: "" });
    expect(parseMarker("a greeting")).toEqual({ description: "a greeting" });
    expect(parseMarker("a greeting@@hello")).toEqual({ description: "a greeting", id: "hello" });
    expect(parseMarker("@@hello")).toEqual({ description: "", id: "hello" });
    expect(() => parseMarker("x@@")).toThrow(/Empty id/);
  });

  it("builds messages from template parts and from tagged template strings", () => {
    expect(messageFromParts(["  Hello ", { placeholder: true }, ", {ok}\n  bye "])).toBe("Hello {0}, \\{ok\\} bye");
    expect(messageFromStrings(["Hi ", " and ", "!"])).toEqual({ message: "Hi {0} and {1}!", marker: { description: "" } });
    expect(messageFromStrings([":greeting@@hi:Hello ", ""], [":greeting@@hi:Hello ", ""])).toEqual({
      message: "Hello {0}",
      marker: { description: "greeting", id: "hi" },
    });
  });
});

describe("catalogs", () => {
  it("reads both JSON shapes and rejects non-strings", () => {
    expect(readCatalog({ locale: "fr", translations: { a: "A" } })).toEqual({ locale: "fr", messages: { a: "A" } });
    expect(readCatalog({ a: "A" })).toEqual({ messages: { a: "A" } });
    expect(() => readCatalog({ a: 1 })).toThrow(/must be a string/);
    expect(() => readCatalog([])).toThrow();
  });

  const messages: ExtractedMessage[] = [
    { id: "b", message: "Bye {0}", description: "farewell", placeholders: ["user.name"], location: "a.ts:3" },
    { id: "a", message: 'Hello <b> & "you"', description: "", placeholders: [] },
    { id: "b", message: "Bye {0}", description: "farewell", placeholders: ["user.name"], location: "b.ts:9" },
  ];

  it("merges extraction results by id, sorted, joining locations", () => {
    const merged = mergeExtracted(messages);
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
    expect(merged[1]!.location).toBe("a.ts:3, b.ts:9");
    const clashes: string[] = [];
    mergeExtracted([{ ...messages[0]! }, { ...messages[0]!, message: "other" }], (a, b) => clashes.push(`${a.message}|${b.message}`));
    expect(clashes).toEqual(["Bye {0}|other"]);
  });

  it("writes the source catalog as JSON", () => {
    expect(JSON.parse(sourceCatalogJson(messages, "en"))).toEqual({ locale: "en", translations: { a: 'Hello <b> & "you"', b: "Bye {0}" } });
  });

  it("round-trips through XLIFF 1.2", () => {
    const xml = toXliff(messages, { sourceLocale: "en", targetLocale: "fr", translations: { a: 'Salut <b> & "toi"', b: "Au revoir {0}" } });
    expect(xml).toContain('<trans-unit id="b" datatype="plaintext">');
    expect(xml).toContain("&lt;b&gt; &amp; &quot;you&quot;");
    expect(xml).toContain('from="description">farewell');
    expect(xml).toContain("{0} = user.name");
    expect(fromXliff(xml)).toEqual({ locale: "fr", messages: { a: 'Salut <b> & "toi"', b: "Au revoir {0}" } });
    // No target yet: nothing imported.
    expect(fromXliff(toXliff(messages, { sourceLocale: "en" })).messages).toEqual({});
  });
});
