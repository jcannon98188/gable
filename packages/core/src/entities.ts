// Character references in template text and static attribute values (TASK-92).
// Only `&lt; &gt; &amp; &quot; &apos; &nbsp;` and numeric `&#N;` / `&#xH;` are known. Anything else (a lone `&`, `&&`,
// `a & b`, an unknown name, an out-of-range number) stays exactly as written.
const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };
const REFERENCE = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z]+));/g;

/** `text` with its character references replaced by the characters they stand for. */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(REFERENCE, (whole, dec?: string, hex?: string, name?: string) => {
    if (name !== undefined) return NAMED[name] ?? whole;
    const code = dec !== undefined ? Number(dec) : parseInt(hex!, 16);
    if (!(code >= 1 && code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff)) return whole;
    return String.fromCodePoint(code);
  });
}

/** The inverse for baking decoded text back into template source: `<` and any `&` that would read as a reference. */
export function encodeEntities(text: string): string {
  return text.replace(/&(?=(?:#\d+|#[xX][0-9a-fA-F]+|[A-Za-z]+);)/g, "&amp;").replace(/</g, "&lt;");
}
