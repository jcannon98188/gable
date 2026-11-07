import { demoStyles } from "../signals/demo-style.js";

/**
 * Styles for the ui-primitives demos. Primitives are headless, so each demo brings its own minimal CSS: this is the
 * whole of it. The primitives only set attributes (`role`, `aria-*`, `data-state`, `hidden`, `tabindex`); every rule below
 * keys off those.
 */
export const primitivesStyles = [
  demoStyles,
  `
[hidden]{display:none!important}
.stage{position:relative;min-height:230px;border:1px dashed var(--line);border-radius:10px;padding:14px;overflow:hidden;display:flex;flex-direction:column;gap:12px}
.keys{margin:0;font-size:13px;color:var(--mut)}
kbd{font:600 11px 'JetBrains Mono',ui-monospace,monospace;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:1px 5px;background:var(--card2);color:var(--tx)}
.status{margin:0;font-size:13px;padding:8px 10px;border-radius:8px;background:var(--bg2);color:var(--tx);min-height:2.4em}
`,
];
