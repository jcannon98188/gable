import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
// @ts-expect-error plain ESM build script
import { buildPlugin } from "../build-plugin.mjs";

// Drives a real tsserver over its JSON protocol; shared by the plugin and extension tests.

const tsserverJs = createRequire(import.meta.url).resolve("@typescript/old/lib/tsserver.js");

/** Installs the bundled plugin where tsserver's plugin probe finds it. */
export async function installPlugin(probe: string, name = "@gable/language-service") {
  const dir = path.join(probe, "node_modules", ...name.split("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: "0.0.0", main: "index.cjs" }));
  await buildPlugin({ outFile: path.join(dir, "index.cjs"), bundleTypescript: true });
}

export class Server {
  private seq = 0;
  private buffer = "";
  private pending = new Map<number, (message: any) => void>();
  private proc: ChildProcessWithoutNullStreams;

  constructor(args: string[] = []) {
    this.proc = spawn(process.execPath, [tsserverJs, "--disableAutomaticTypingAcquisition", ...args], { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stdout.setEncoding("utf8").on("data", (chunk: string) => this.read(chunk));
  }

  private read(chunk: string) {
    this.buffer += chunk;
    for (;;) {
      const header = /Content-Length: (\d+)\r?\n\r?\n/.exec(this.buffer);
      if (!header) return;
      const start = header.index + header[0].length;
      const length = Number(header[1]);
      if (Buffer.byteLength(this.buffer.slice(start)) < length) return;
      const body = this.buffer.slice(start, start + length);
      this.buffer = this.buffer.slice(start + length);
      const message = JSON.parse(body);
      if (message.type === "response") this.pending.get(message.request_seq)?.(message);
    }
  }

  request<T = any>(command: string, args: object): Promise<T> {
    const seq = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`tsserver timed out on ${command}`)), 60_000);
      this.pending.set(seq, (message) => {
        clearTimeout(timer);
        message.success ? resolve(message.body) : reject(new Error(`${command}: ${message.message}`));
      });
      this.proc.stdin.write(JSON.stringify({ seq, type: "request", command, arguments: args }) + "\n");
    });
  }

  stop() {
    this.proc.kill();
  }
}
