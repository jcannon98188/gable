const ID = "gable-editor-content-styles";

/** Typography and structure for the document: headings, lists, quotes, code, tables, images. Colours come from the gable-ui theme. */
export const CONTENT_CSS = `
.prose-editor .ProseMirror > * + * { margin-top: .6em; }
.prose-editor .ProseMirror p { margin: 0; }
.prose-editor .ProseMirror p + p { margin-top: .6em; }
.prose-editor .ProseMirror h1 { font-size: 1.75em; font-weight: 700; line-height: 1.2; margin: .2em 0 .3em; }
.prose-editor .ProseMirror h2 { font-size: 1.4em; font-weight: 650; line-height: 1.25; margin: .6em 0 .3em; }
.prose-editor .ProseMirror h3 { font-size: 1.15em; font-weight: 600; line-height: 1.3; margin: .6em 0 .3em; }
.prose-editor .ProseMirror ul, .prose-editor .ProseMirror ol { padding-left: 1.5em; margin: .4em 0; }
.prose-editor .ProseMirror ul { list-style: disc; }
.prose-editor .ProseMirror ol { list-style: decimal; }
.prose-editor .ProseMirror li > p { margin: 0; }
.prose-editor .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: .25em; }
.prose-editor .ProseMirror ul[data-type="taskList"] > li { display: flex; gap: .5em; align-items: flex-start; }
.prose-editor .ProseMirror ul[data-type="taskList"] > li > label { margin-top: .2em; }
.prose-editor .ProseMirror ul[data-type="taskList"] > li > div { flex: 1; }
.prose-editor .ProseMirror blockquote { border-left: 3px solid var(--color-border, #d4d4d8); padding-left: 1em; color: var(--color-muted-foreground, #71717a); margin: .6em 0; }
.prose-editor .ProseMirror code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; background: var(--color-muted, #f4f4f5); border-radius: 4px; padding: .1em .3em; }
.prose-editor .ProseMirror pre { background: var(--color-muted, #f4f4f5); border-radius: 6px; padding: .75em 1em; overflow-x: auto; }
.prose-editor .ProseMirror pre code { background: none; padding: 0; }
.prose-editor .ProseMirror hr { border: 0; border-top: 1px solid var(--color-border, #d4d4d8); margin: 1em 0; }
.prose-editor .ProseMirror a { color: var(--color-primary, #2563eb); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.prose-editor .ProseMirror table { border-collapse: collapse; table-layout: fixed; width: 100%; margin: .8em 0; overflow: hidden; }
.prose-editor .ProseMirror th, .prose-editor .ProseMirror td { border: 1px solid var(--color-border, #d4d4d8); padding: .4em .6em; vertical-align: top; position: relative; min-width: 3em; }
.prose-editor .ProseMirror th { background: var(--color-muted, #f4f4f5); font-weight: 600; text-align: left; }
.prose-editor .ProseMirror .selectedCell::after { content: ""; position: absolute; inset: 0; background: color-mix(in srgb, var(--color-primary, #2563eb) 15%, transparent); pointer-events: none; }
.prose-editor .ProseMirror .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; background: var(--color-primary, #2563eb); pointer-events: none; }
.prose-editor .ProseMirror.resize-cursor { cursor: col-resize; }
.prose-editor .ProseMirror figure { margin: .8em 0; text-align: center; }
.prose-editor .ProseMirror figure [data-image-figure] { max-width: 100%; }
.prose-editor .ProseMirror figcaption { margin-top: .3em; min-height: 1.2em; }
.prose-editor .ProseMirror figcaption:empty::before { content: "Add a caption"; color: var(--color-muted-foreground, #71717a); opacity: .7; }
.prose-editor .ProseMirror img.ProseMirror-selectednode, .prose-editor .ProseMirror .ProseMirror-selectednode img { outline: 2px solid var(--color-primary, #2563eb); }
`;

/** Adds the content styles to the document once (idempotent), so the editor looks right without any stylesheet import. */
export function installContentStyles(doc: Document): void {
  if (doc.getElementById(ID)) return;
  const style = doc.createElement("style");
  style.id = ID;
  style.textContent = CONTENT_CSS;
  doc.head.prepend(style); // first, so an app's own rules win
}
