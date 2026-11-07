// THROWAWAY SPIKE. Rust stays thin: pick the project folder (argv[1]), spawn the Node backend (which spawns the
// PROJECT'S OWN Vite and serves the shell), wait for the port, open one window on it. In the real app the Node
// backend's two jobs (file read, range resolve) become Rust commands / TS in the shell, and Rust spawns Vite directly.
use std::{net::TcpStream, path::PathBuf, process::{Child, Command}, sync::Mutex, time::Duration};
use tauri::{WebviewUrl, WebviewWindowBuilder};

struct Backend(Mutex<Option<Child>>);

fn main() {
    let project = std::env::args().nth(1).unwrap_or_else(|| "../../examples/todomvc".into());
    let here = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    tauri::Builder::default()
        .setup(move |app| {
            let child = Command::new("node").arg("server.mjs").arg(&project).arg("5190").arg("5191").current_dir(&here).spawn()?;
            tauri::Manager::manage(app, Backend(Mutex::new(Some(child))));
            let handle = app.handle().clone();
            // Waiting + window creation happen off the main thread: blocking the setup closure starves the event loop.
            std::thread::spawn(move || {
                for _ in 0..200 {
                    if TcpStream::connect(("localhost", 5190)).is_ok() && TcpStream::connect(("localhost", 5191)).is_ok() { break; }
                    std::thread::sleep(Duration::from_millis(100));
                }
                let mut win = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External("http://localhost:5190/".parse().unwrap()))
                    .title("Gable Designer (spike)").inner_size(1280.0, 800.0);
                // Test hook: lets a script drive the real WebView2 over CDP.
                if let Ok(port) = std::env::var("GABLE_CDP_PORT") { win = win.additional_browser_args(&format!("--remote-debugging-port={port} --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection")); }
                if let Err(e) = win.build() { eprintln!("window build failed: {e}"); }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("tauri build")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(b) = tauri::Manager::try_state::<Backend>(app) { if let Some(mut c) = b.0.lock().unwrap().take() { let _ = c.kill(); } }
            }
        });
}
