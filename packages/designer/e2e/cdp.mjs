// Tiny CDP drivers shared by the driven checks.

/** Connects to the page whose URL contains `urlPart` (the Designer shell) and evaluates in it. */
export async function connect(port, urlPart) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === "page" && t.url.includes(urlPart));
  if (!page) throw new Error(`no page matching ${urlPart}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    pending.get(d.id)?.(d);
  };
  const cdp = (method, params = {}) => new Promise((r) => (pending.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
  const ev = async (expression) => {
    const r = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "evaluate failed");
    return r.result.result.value;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, what, ms = 15000) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      const v = await fn();
      if (v) return v;
      await sleep(150);
    }
    throw new Error(`timed out: ${what}`);
  };
  return { cdp, ev, sleep, until, close: () => ws.close() };
}

/** A browser-level connection: lists the iframe targets (each preview frame is one) and evaluates inside them. */
export async function connectBrowser(port) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    pending.get(d.id)?.(d);
  };
  const send = (method, params = {}, sessionId) => new Promise((r) => (pending.set(++id, r), ws.send(JSON.stringify({ id, method, params, sessionId }))));
  const sessions = new Map();
  const frames = async () => {
    const { result } = await send("Target.getTargets");
    const out = [];
    for (const t of result.targetInfos.filter((t) => t.type === "iframe")) {
      let sessionId = sessions.get(t.targetId);
      if (!sessionId) {
        sessionId = (await send("Target.attachToTarget", { targetId: t.targetId, flatten: true })).result.sessionId;
        sessions.set(t.targetId, sessionId);
      }
      const ev = async (expression) => {
        const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
        if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "evaluate failed");
        return r.result.result.value;
      };
      out.push({ targetId: t.targetId, url: t.url, ev });
    }
    return out;
  };
  return { send, frames, close: () => ws.close() };
}
