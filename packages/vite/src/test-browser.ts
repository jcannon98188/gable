import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const candidates = [
  process.env.GABLE_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((p): p is string => !!p);

/** A headless Chromium (Edge or Chrome) found on this machine, if any. Tests that need one skip without it. */
export const browserPath = candidates.find((p) => existsSync(p));

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Page {
  goto(url: string): Promise<void>;
  /** Evaluates an expression in the page and returns its JSON value. */
  eval<T = unknown>(expression: string): Promise<T>;
  /** Polls an expression until it is truthy. */
  waitFor(expression: string, timeout?: number): Promise<void>;
  close(): void;
}

/** Drives a headless browser over the DevTools protocol, without Playwright. */
export async function openPage(): Promise<Page> {
  const dir = mkdtempSync(join(tmpdir(), "gable-vite-browser-"));
  const child: ChildProcess = spawn(
    browserPath!,
    ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "about:blank"],
    { stdio: "ignore" },
  );
  const close = () => {
    child.kill();
    setTimeout(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }), 500).unref();
  };
  try {
    let port = "";
    for (let i = 0; i < 100 && !port; i++) {
      await sleep(100);
      try {
        port = readFileSync(join(dir, "DevToolsActivePort"), "utf8").split("\n")[0]!;
      } catch {}
    }
    if (!port) throw new Error("browser did not start");
    const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
    const ws = new WebSocket(targets.find((t) => t.type === "page")!.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)));
    let id = 0;
    const waiting = new Map<number, (m: any) => void>();
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      waiting.get(m.id)?.(m);
    };
    const send = (method: string, params: object = {}) =>
      new Promise<any>((resolve) => {
        const n = ++id;
        waiting.set(n, resolve);
        ws.send(JSON.stringify({ id: n, method, params }));
      });
    const evaluate = async <T>(expression: string): Promise<T> => {
      const { result, error } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (error || result.exceptionDetails) throw new Error(`page eval failed: ${JSON.stringify(error ?? result.exceptionDetails)}`);
      return result.result.value as T;
    };
    return {
      async goto(url) {
        await send("Page.navigate", { url });
      },
      eval: evaluate,
      async waitFor(expression, timeout = 15_000) {
        const end = Date.now() + timeout;
        for (;;) {
          const ok = await evaluate<boolean>(`Boolean(${expression})`).catch(() => false);
          if (ok) return;
          if (Date.now() > end) throw new Error(`timed out waiting for: ${expression}`);
          await sleep(100);
        }
      },
      close() {
        ws.close();
        close();
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}
