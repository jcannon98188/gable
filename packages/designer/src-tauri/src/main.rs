// Rust stays thin: it owns the window and the lifetime of the Node backend, nothing else. It spawns
// `node dist/server/cli.js [project] --watch-stdin`, waits for the `GABLE_DESIGNER_READY {json}` line, and opens one
// window on the backend's URL. The backend serves the shell (and hands it the per-session token), exactly as it does
// for a browser, so the desktop window and `gable-designer` in a browser run the same code path. When this process
// exits the backend's stdin closes and it shuts down, taking the project's Vite with it. Choosing, switching and
// installing projects and restarting their dev server all happen in the backend; the project argument is optional (without
// it the backend opens the most recent project).
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
};
use tauri::{WebviewUrl, WebviewWindowBuilder};

struct Backend(Mutex<Option<Child>>);

// Device emulation on Windows runs over the Chrome DevTools Protocol: WebView2 gets a debugging port (only the
// `additional_browser_args` route works; the env var is ignored) and the Node backend, which is the CDP client, is told it.
// `GABLE_CDP_PORT=<n>` picks the port, `GABLE_CDP_PORT=0` turns it off. Other platforms have no CDP and the Designer says so.
fn cdp_port() -> Option<u16> {
    if !cfg!(windows) {
        return None;
    }
    match std::env::var("GABLE_CDP_PORT").ok().and_then(|p| p.parse::<u16>().ok()) {
        Some(0) => None,
        Some(p) => Some(p),
        None => std::net::TcpListener::bind("127.0.0.1:0").ok().and_then(|l| l.local_addr().ok()).map(|a| a.port()),
    }
}

fn main() {
    let project = std::env::args().nth(1);
    let cdp = cdp_port();
    let package = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    tauri::Builder::default()
        .setup(move |app| {
            let mut command = Command::new("node");
            command.arg(package.join("dist/server/cli.js"));
            if let Some(project) = &project {
                command.arg(project);
            }
            command.arg("--watch-stdin");
            if let Some(port) = cdp {
                command.arg("--cdp-port").arg(port.to_string());
            }
            let mut child = command
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .spawn()?;
            let stdout = child.stdout.take().expect("piped stdout");
            tauri::Manager::manage(app, Backend(Mutex::new(Some(child))));
            let handle = app.handle().clone();
            // Waiting for the backend and building the window happen off the main thread: blocking `setup` starves the event loop.
            std::thread::spawn(move || {
                let mut url = None;
                let mut lines = BufReader::new(stdout).lines();
                while let Some(Ok(line)) = lines.next() {
                    if let Some(json) = line.strip_prefix("GABLE_DESIGNER_READY ") {
                        url = serde_json::from_str::<serde_json::Value>(json)
                            .ok()
                            .and_then(|v| v["url"].as_str().map(str::to_owned));
                        break;
                    }
                }
                let Some(url) = url else {
                    eprintln!("the Designer backend exited before it was ready (usage: gable-designer [projectDir])");
                    handle.exit(1);
                    return;
                };
                let mut win = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url.parse().unwrap()))
                    .title("Gable Designer")
                    .inner_size(1440.0, 900.0);
                if let Some(port) = cdp {
                    win = win.additional_browser_args(&format!(
                        "--remote-debugging-port={port} --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection"
                    ));
                }
                if let Err(e) = win.build() {
                    eprintln!("window build failed: {e}");
                }
                // Keep draining so the backend never blocks on a full pipe.
                for _ in lines {}
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("tauri build")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(b) = tauri::Manager::try_state::<Backend>(app) {
                    if let Some(mut c) = b.0.lock().unwrap().take() {
                        // Closing stdin is the backend's signal to stop (--watch-stdin): it closes the project's Vite and
                        // removes its MCP session file. Killing it at once would skip both; kill only if it does not exit.
                        drop(c.stdin.take());
                        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
                        while matches!(c.try_wait(), Ok(None)) && std::time::Instant::now() < deadline {
                            std::thread::sleep(std::time::Duration::from_millis(50));
                        }
                        let _ = c.kill();
                    }
                }
            }
        });
}
