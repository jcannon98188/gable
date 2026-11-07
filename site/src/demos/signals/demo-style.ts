/**
 * Styles shared by the Framework section demos. Each demo component lists this in its own `styles`, so it is scoped to
 * that component's template and reads the site's theme variables (light and dark follow `<html data-theme>`).
 */
export const demoStyles = `
:host{display:block;min-width:0}
.demo{border:1px solid var(--line);background:var(--card);border-radius:12px;overflow:hidden;min-width:0;color:var(--tx)}
.dh{padding:18px 20px 4px}
.dh h3{margin:0 0 6px;font-size:18px}
.dh p{margin:0;font-size:14px;color:var(--mut)}
.db{padding:14px 20px 20px;display:flex;flex-direction:column;gap:14px;min-width:0}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
code{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:.92em;color:var(--t)}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 14px;border-radius:8px;border:1px solid var(--line);background:var(--card2);color:var(--tx);font:500 14px Inter,system-ui,sans-serif;cursor:pointer}
.btn:hover{background:var(--bg2)}
.btn:focus-visible,.expr:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.btn.pri{background:var(--acc);color:var(--accfg);border-color:var(--acc)}
.btn.code{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12.5px;text-align:left;justify-content:flex-start}
.btn.good{border-color:var(--ok)}
.btn.rej{border-color:var(--badline)}
.note{font-size:13px;color:var(--mut);margin:0}
.tbl{overflow-x:auto}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
