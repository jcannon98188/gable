/** Global (the mini app's pages are routed components, outside the demo's own template), so every class is `rd-` prefixed. */
export const demoStyles = `
site-router-demo{display:block}
.rd{display:flex;flex-direction:column;gap:14px;font-size:14px;color:var(--tx)}
.rd *{box-sizing:border-box}
.rd-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.rd-addr{display:flex;flex:1 1 260px;min-width:0;gap:8px}
.rd-addr input{flex:1;min-width:0;min-height:40px;padding:0 12px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--tx);font:13px 'JetBrains Mono',ui-monospace,monospace}
.rd-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;min-width:40px;padding:0 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--tx);font:600 13px Inter,system-ui,sans-serif;cursor:pointer}
.rd-btn:hover:not(:disabled){background:var(--card2)}
.rd-btn:disabled{opacity:.4;cursor:not-allowed}
.rd-btn[aria-pressed=true]{border-color:var(--ok);background:var(--okbg);color:var(--okfg)}
.rd-primary{background:var(--acc);border-color:var(--acc);color:var(--accfg)}
.rd-primary:hover:not(:disabled){background:var(--acc);opacity:.9}
.rd-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px;align-items:start}
.rd-app,.rd-state{border:1px solid var(--line);background:var(--card);border-radius:12px;overflow:hidden}
.rd-head{display:flex;align-items:center;gap:8px;min-height:38px;padding:0 14px;border-bottom:1px solid var(--line);font:12px 'JetBrains Mono',ui-monospace,monospace;color:var(--mut)}
.rd-nav{display:flex;flex-wrap:wrap;gap:4px;padding:8px 10px;border-bottom:1px solid var(--line);background:var(--card2)}
.rd a{color:var(--acc);text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.rd-nav a{display:inline-flex;align-items:center;min-height:34px;padding:0 10px;border-radius:6px;color:var(--mut);text-decoration:none;font-weight:600}
.rd-nav a:hover{color:var(--tx)}
.rd-nav a.on,.rd-tabs a.on{background:var(--icobg);color:var(--acc)}
.rd-tabs{display:flex;flex-wrap:wrap;gap:4px;margin:10px 0}
.rd-tabs a{display:inline-flex;align-items:center;min-height:32px;padding:0 10px;border-radius:6px;border:1px solid var(--line);text-decoration:none;color:var(--mut)}
.rd-view{position:relative;min-height:230px;padding:16px;line-height:1.55}
.rd-view h3{font-size:20px;margin:0 0 8px}
.rd-view h4{font-size:16px;margin:0 0 6px}
.rd-view p{margin:0 0 8px}
.rd-view code,.rd-state code{font:12px 'JetBrains Mono',ui-monospace,monospace;padding:1px 5px;border-radius:4px;background:var(--card2);border:1px solid var(--line)}
.rd-list{margin:8px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:6px}
.rd-mut{color:var(--mut)}
.rd-child{margin-top:6px;padding:10px 12px;border-radius:8px;border:1px dashed var(--line)}
.rd-loading{position:absolute;inset:0;display:flex;align-items:flex-start;justify-content:flex-end;padding:10px;pointer-events:none}
.rd-loading span{padding:3px 10px;border-radius:12px;background:var(--acc);color:var(--accfg);font:600 12px Inter,system-ui,sans-serif;animation:rd-pulse 1s ease-in-out infinite}
@keyframes rd-pulse{50%{opacity:.5}}
.rd-state dl{margin:0;padding:12px 14px;display:grid;grid-template-columns:92px minmax(0,1fr);gap:8px 12px;align-items:baseline}
.rd-state dt{font:12px 'JetBrains Mono',ui-monospace,monospace;color:var(--mut)}
.rd-state dd{margin:0;min-width:0;overflow-wrap:anywhere;font:13px 'JetBrains Mono',ui-monospace,monospace}
.rd-state ol,.rd-state ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px}
.rd-state li{padding:2px 8px;border-radius:5px}
.rd-state li.on{background:var(--icobg);color:var(--acc)}
.rd-state li.on:before{content:'\\25B8  '}
.rd-state li.future{color:var(--mut)}
.rd-err{color:var(--f)}
.rd-fallback{padding:16px;border:1px solid var(--badline);background:var(--badbg);border-radius:12px}
.rd-note{font-size:13px;color:var(--mut);margin:0}
@media (max-width:820px){.rd-grid{grid-template-columns:minmax(0,1fr)}}
@media (prefers-reduced-motion:reduce){.rd-loading span{animation:none}}
`;
