import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { ICONS } from "@gable/ui";
import { ITEM_ICONS } from "./icons.js";
import { defaultPlugins } from "./component/editor-element.js";
import { tablePlugin } from "./plugins/table.js";
import { imagePlugin } from "./plugins/image.js";
import { commentsPlugin } from "./plugins/comments.js";
import { suggestionsPlugin } from "./plugins/suggestions.js";

describe("toolbar icons", () => {
  it("every built-in toolbar item has a registered lucide glyph", () => {
    const user = { name: "A", color: "#000" };
    const plugins = [...defaultPlugins, tablePlugin, imagePlugin(), commentsPlugin({ ydoc: new Y.Doc(), user }), suggestionsPlugin({ user })];
    const items = plugins.flatMap((p) => p.toolbar ?? []);
    expect(items.length).toBeGreaterThan(30);
    for (const item of items) {
      const name = item.icon ?? ITEM_ICONS[item.id];
      expect(name, item.id).toBeTruthy();
      expect(ICONS[name!], `${item.id} -> ${name}`).toBeDefined();
    }
  });
});
