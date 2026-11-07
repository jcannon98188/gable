# @gable/designer

The Gable Designer is a tool for working on a Gable app while it runs. It frames your app, lets you select an element and see the template that renders it, edits that template (and styles, design tokens, routes and more) by writing a minimal patch to your own source files, and mounts a single component in isolation with named scenarios. It is an application, not a library: it is private to this repository, has no entry module and publishes no API, so there is no reference page for it. What it does lives in the README at `packages/designer/README.md`; this page is the short version.

## What it is made of

- The **Preview agent** (`src/agent`) is a dev-only script the Designer injects into your pages through a Vite plugin. It stays dormant unless the Designer framed the page, and it talks over `postMessage` with a versioned, nonce-checked and origin-checked protocol.
- The **backend** (`src/server`) is a Node process. It spawns your project's own Vite with a wrapper config (nothing is written to your project), maps rendered nodes to template source positions, runs the language service and serves the HTTP API, which checks a token and the Host header.
- The **shell** (`shell`) is the Designer's own UI. It is itself a Gable app, built from gable-ui components copied in with the [gable-ui CLI](../gable-ui-cli.md).
- The **desktop host** (`src-tauri`) is a thin Rust (Tauri) window that owns the window and the process lifetime. You can also run everything in an ordinary browser.

## Run it

From a checkout of the repository:

```
npm install
npm run build -w packages/designer
node packages/designer/dist/server/cli.js examples/todomvc
```

The CLI prints a URL; open it in a browser. Without a folder, `cli.js` reopens the most recent project. The package also declares a `gable-designer` bin pointing at the same file. For the desktop window, run `cargo build` in `packages/designer/src-tauri`, then start `packages/designer/src-tauri/target/debug/gable-designer.exe examples/todomvc` (on Windows). The project name in the top bar opens a project picker with your recent projects.

The Designer works on Gable apps only. Its **Connect** dialog checks that the project has a `package.json`, Vite and a new enough `@gable/core`, and can install missing dependencies with the project's own package manager. If the project's dev server fails, the canvas shows why and offers to restart it.

## What you can do with it

- **Select and edit.** Click an element in a frame to see its template node. The Content and Style tabs change your files: text, attributes, bindings from a signal picker, inserting, deleting, moving and wrapping elements in `@if` or `@for`, component metadata and CSS. Each edit is a minimal text patch, then Vite hot-updates the canvas. Undo and redo are on the same stack, and the Code tab shows the diff of the last patch. Events, refs, i18n and opaque expressions are shown but never rewritten.
- **Frames and devices.** Up to six frames, each its own app instance, sized by preset or custom size, with touch and media emulation in the desktop window.
- **Scenarios.** Mount one component alone. Scenarios are `*.scenes.ts` files beside a component, and the same files run in tests with `mountScene` from `@gable/testing`.
- **Inspect the running app.** The component tree, signal values (editable), a signal state timeline, a view of why a binding updated, an accessibility check powered by axe-core, focus order, performance and the network (with conditions and mocks).
- **Language-service problems** appear on the canvas.
- **Tailwind mode** edits an element's classes against your project's own Tailwind v4 design system, when a stylesheet starts with `@import "tailwindcss"`. Design tokens, route editing and refactors such as extracting a component are covered in the README.
- **Source control.** A Changes tab shows the working tree changes since the last commit, so the edits the Designer or an agent wrote can be reviewed and committed.

## Drive it from a coding agent

The backend hosts an MCP server, so an agent can read the project, change what the window shows, select and edit elements and take screenshots, sharing one Designer with the person. Every edit goes through the same edit service as a click, on the same undo stack, and each answers with the diff it wrote.

Transport is Streamable HTTP at `<backend>/mcp` on 127.0.0.1 only, with a per-session bearer token printed in the `GABLE_DESIGNER_READY` line and written to a session file that only you can read. For clients that start their own server, `gable-designer mcp <projectDir>` is a stdio proxy:

```json
{
  "mcpServers": {
    "gable-designer": {
      "command": "node",
      "args": ["<repo>/packages/designer/dist/server/cli.js", "mcp", "<path to the project>"]
    }
  }
}
```

Call `get_status` first. The tool groups (read, window, app state, edit, network, storage, matrix, accessibility, screenshots) are listed in the README.

## Why there is no live demo here

The Designer needs a Node backend that spawns Vite and writes to your files, so it cannot run inside this page. The Gable site's own demos cover the framework features it builds on.
