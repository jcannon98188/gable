// THROWAWAY SPIKE: drives the real Tauri/WebView2 window over CDP (WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333),
// clicks the new-todo input inside the preview iframe and prints what the shell resolved.
const targets = await (await fetch("http://127.0.0.1:9333/json")).json();
const page = targets.find((t) => t.type === "page" && t.url.includes("5190"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); };
const cdp = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => (await cdp("Runtime.evaluate", { expression, returnByValue: true })).result.result.value;
console.log("ua:", await ev("navigator.userAgent"));
console.log("messages:", await ev("JSON.stringify(window.__lastMessages)"));
for (const [x, y] of [[450, 160], [400, 225]]) {
  for (const type of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  await new Promise((r) => setTimeout(r, 500));
  const p = JSON.parse(await ev("JSON.stringify(window.__picked)"));
  console.log(`click(${x},${y}) ->`, p.tag, "in", p.template?.component?.name, p.resolved.file?.split("/").slice(-2).join("/"), JSON.stringify(p.resolved.range), JSON.stringify(p.resolved.text));
}
ws.close();
