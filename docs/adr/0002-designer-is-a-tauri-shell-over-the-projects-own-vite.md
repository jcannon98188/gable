# Designer is a Tauri shell over the project's own Vite

The Designer is a standalone desktop app on Tauri, so it uses the operating system's webview instead of shipping a browser. The Rust layer stays thin (file access and watching, spawning the dev server, windowing); the shell UI is itself a Gable app so it reuses the template formatter, Template language service and testing package in TypeScript rather than reimplementing the template grammar in Rust. It assumes a normal development environment and runs the project's own Vite; a self-contained dev server was rejected for losing the project's Vite plugins and config.

## Consequences

Preview fidelity depends on the platform's webview (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux), and full device emulation over the Chrome DevTools Protocol is only available on WebView2. The Designer therefore offers opening the page in the system browser against the same dev server, and labels emulation that a platform cannot provide.

The CDP path has three constraints that shape the implementation. The preview is a cross-site iframe of the shell, which Chromium runs as its own `iframe` target: the Node backend (the CDP client; Rust only enables the debugging port) attaches to it and tells frames apart by the session nonce the agent keeps in `window.name`. `Emulation.setDeviceMetricsOverride` and `setEmitTouchEventsForMouse` are only allowed on top-level targets, so a Frame's size is CSS on the iframe and its pixel ratio is only reported to scripts, not applied to resolution media queries. Touch, pointer/hover and media emulation are process-wide, so each Frame runs on its own `*.localhost` origin to get its own renderer process. The open debugging port is loopback only and is turned on by the desktop host alone.
