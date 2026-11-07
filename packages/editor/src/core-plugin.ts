import { Node } from "@tiptap/core";
import { definePlugin } from "./plugin.js";

const Doc = Node.create({ name: "doc", topNode: true, content: "block+" });
const Text = Node.create({ name: "text", group: "inline" });
const Paragraph = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",
  parseHTML: () => [{ tag: "p" }],
  renderHTML: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
});

/** The minimal schema every editor needs: doc, paragraph, text. Other plugins `require` it. */
export const corePlugin = definePlugin({
  name: "core",
  priority: 1000,
  extensions: [Doc, Text, Paragraph],
});
