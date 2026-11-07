import type { Editor } from "@tiptap/core";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold } from "@tiptap/extension-bold";
import { Code } from "@tiptap/extension-code";
import { CodeBlock } from "@tiptap/extension-code-block";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Heading } from "@tiptap/extension-heading";
import { HorizontalRule } from "@tiptap/extension-horizontal-rule";
import { Italic } from "@tiptap/extension-italic";
import { Link } from "@tiptap/extension-link";
import { BulletList, ListItem, OrderedList, TaskItem, TaskList } from "@tiptap/extension-list";
import { Strike } from "@tiptap/extension-strike";
import { Underline } from "@tiptap/extension-underline";
import { UndoRedo } from "@tiptap/extensions";
import { definePlugin, type ToolbarItem } from "../plugin.js";

const toggle = (
  id: string,
  label: string,
  order: number,
  group: string,
  run: (e: Editor) => boolean,
  isActive: (e: Editor) => boolean,
): ToolbarItem => ({ id, label, order, group, run, isActive });

/** Bold, italic, underline, strike and inline code, with the usual shortcuts and markdown input rules. */
export const basicStylesPlugin = definePlugin({
  name: "basicStyles",
  requires: ["core"],
  extensions: [Bold, Italic, Underline, Strike, Code],
  toolbar: [
    toggle("bold", "Bold", 10, "styles", (e) => e.chain().focus().toggleBold().run(), (e) => e.isActive("bold")),
    toggle("italic", "Italic", 11, "styles", (e) => e.chain().focus().toggleItalic().run(), (e) => e.isActive("italic")),
    toggle("underline", "Underline", 12, "styles", (e) => e.chain().focus().toggleUnderline().run(), (e) => e.isActive("underline")),
    toggle("strike", "Strikethrough", 13, "styles", (e) => e.chain().focus().toggleStrike().run(), (e) => e.isActive("strike")),
    toggle("code", "Code", 14, "styles", (e) => e.chain().focus().toggleCode().run(), (e) => e.isActive("code")),
  ],
});

export const linkPlugin = definePlugin({
  name: "link",
  requires: ["core"],
  extensions: [Link.configure({ openOnClick: false, autolink: true })],
  toolbar: [
    {
      id: "link",
      label: "Link",
      group: "insert",
      order: 20,
      // Active link: remove it. Otherwise the UI collects a URL (see `input`) and calls runWith.
      run: (e) => (e.isActive("link") ? e.chain().focus().extendMarkRange("link").unsetLink().run() : false),
      input: { kind: "url", label: "Link URL" },
      runWith: (e, href) => e.chain().focus().extendMarkRange("link").setLink({ href }).run(),
      isActive: (e) => e.isActive("link"),
    },
  ],
});

export const headingPlugin = definePlugin({
  name: "heading",
  requires: ["core"],
  extensions: [Heading.configure({ levels: [1, 2, 3, 4] })],
  toolbar: ([1, 2, 3] as const).map((level) =>
    toggle(
      `heading${level}`,
      `Heading ${level}`,
      30 + level,
      "blocks",
      (e) => e.chain().focus().toggleHeading({ level }).run(),
      (e) => e.isActive("heading", { level }),
    ),
  ),
});

export const blockPlugin = definePlugin({
  name: "blocks",
  requires: ["core"],
  extensions: [Blockquote, CodeBlock, HorizontalRule, HardBreak],
  toolbar: [
    toggle("blockquote", "Block quote", 40, "blocks", (e) => e.chain().focus().toggleBlockquote().run(), (e) => e.isActive("blockquote")),
    toggle("codeBlock", "Code block", 41, "blocks", (e) => e.chain().focus().toggleCodeBlock().run(), (e) => e.isActive("codeBlock")),
    toggle("horizontalRule", "Horizontal line", 42, "insert", (e) => e.chain().focus().setHorizontalRule().run(), () => false),
  ],
});

export const listPlugin = definePlugin({
  name: "lists",
  requires: ["core"],
  extensions: [BulletList, OrderedList, ListItem, TaskList, TaskItem.configure({ nested: true })],
  toolbar: [
    toggle("bulletList", "Bulleted list", 50, "lists", (e) => e.chain().focus().toggleBulletList().run(), (e) => e.isActive("bulletList")),
    toggle("orderedList", "Numbered list", 51, "lists", (e) => e.chain().focus().toggleOrderedList().run(), (e) => e.isActive("orderedList")),
    toggle("taskList", "To-do list", 52, "lists", (e) => e.chain().focus().toggleTaskList().run(), (e) => e.isActive("taskList")),
  ],
});

/** Local undo/redo. Do not combine with `collabPlugin`, which supplies per-user undo through Yjs. */
export const historyPlugin = definePlugin({
  name: "history",
  requires: ["core"],
  extensions: [UndoRedo],
  toolbar: [
    { id: "undo", label: "Undo", group: "history", order: 0, run: (e) => e.chain().focus().undo().run(), isEnabled: (e) => e.can().undo() },
    { id: "redo", label: "Redo", group: "history", order: 1, run: (e) => e.chain().focus().redo().run(), isEnabled: (e) => e.can().redo() },
  ],
});

/** Everything a typical document editor needs, minus history/collab. */
export const formattingPlugins = [basicStylesPlugin, linkPlugin, headingPlugin, blockPlugin, listPlugin];
