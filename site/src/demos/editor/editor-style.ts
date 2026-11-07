/**
 * Styles for the editor demo. Not scoped: ProseMirror creates the document's elements itself, so a scoped selector would
 * never reach them. Every class is prefixed `ed-` and reads the site's theme variables.
 */
export const editorStyles = `
editor-demo{display:block;min-width:0}
.ed-panel{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px;min-width:0;color:var(--tx)}
.ed-bar{display:flex;flex-wrap:wrap;gap:6px}
.ed-btn{font:600 13px Inter,system-ui,sans-serif;min-width:36px;min-height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--card2);color:var(--tx);cursor:pointer}
.ed-btn:hover:not([disabled]){border-color:var(--acc)}
.ed-btn[aria-pressed="true"]{background:var(--acc);color:var(--accfg);border-color:var(--acc)}
.ed-btn[disabled]{opacity:.5;cursor:default}
.ed-btn:focus-visible,.ed-surface :focus-visible,.ed-check input:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.ed-surface{border:1px solid var(--line);border-radius:8px;background:var(--bg2);min-width:0;overflow-wrap:anywhere}
.ed-surface .ProseMirror{min-height:150px;padding:12px 14px;outline:none;line-height:1.55}
.ed-surface .ProseMirror>*+*{margin-top:.6em}
.ed-surface .ProseMirror h1,.ed-surface .ProseMirror h2,.ed-surface .ProseMirror h3{margin:.2em 0 .3em;line-height:1.25}
.ed-surface .ProseMirror h2{font-size:1.35em}
.ed-surface .ProseMirror p{margin:0}
.ed-surface .ProseMirror ul,.ed-surface .ProseMirror ol{padding-left:1.5em}
.ed-surface .ProseMirror ul{list-style:disc}
.ed-surface .ProseMirror ol{list-style:decimal}
.ed-surface .ProseMirror li>p{margin:0}
.ed-surface .ProseMirror ul[data-type="taskList"]{list-style:none;padding-left:.25em}
.ed-surface .ProseMirror ul[data-type="taskList"]>li{display:flex;gap:.5em}
.ed-surface .ProseMirror code{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:.9em;background:var(--card2);border-radius:4px;padding:.1em .3em}
.ed-surface .ProseMirror mark{background:color-mix(in srgb,var(--acc) 30%,transparent);color:inherit;border-radius:3px;padding:0 .1em}
.ed-row{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;font-size:13px;color:var(--mut)}
.ed-check{display:flex;align-items:center;gap:8px;color:var(--tx)}
.ed-det summary{cursor:pointer;font-size:13px;color:var(--mut)}
.ed-pre{margin:8px 0 0;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg2);font:12.5px/1.5 'JetBrains Mono',ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto}
@media (prefers-reduced-motion:reduce){.ed-panel *{animation:none!important;transition:none!important}}
`;
