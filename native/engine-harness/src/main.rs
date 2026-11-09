//! `gable-harness`: run bundled Gable test suites and benchmarks on an
//! engine. The JavaScript side (bundling, the vitest shim, comparing
//! results) lives in `js/`; this binary only embeds the engine.

use anyhow::{bail, Result};
use clap::{Parser, Subcommand};
use gable_engine_harness::{EngineChoice, Options, Runtime};
use std::path::PathBuf;
use std::time::{Duration, Instant};

#[derive(Parser)]
#[command(name = "gable-harness", about = "Run Gable suites and benchmarks inside an embedded JS engine")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run each module in its own fresh engine and print what it logs.
    Run {
        /// `agnijs` (default) or `quickjs` (the interim engine).
        #[arg(long)]
        engine: Option<String>,
        /// Wall-clock limit per module, in seconds.
        #[arg(long, default_value_t = 300)]
        timeout_s: u64,
        files: Vec<PathBuf>,
    },
    /// Print the names in a bundle's `benchmarks` export, one per line.
    List {
        #[arg(long)]
        engine: Option<String>,
        file: PathBuf,
    },
    /// Time one benchmark of a bundle; prints one JSON line.
    Bench {
        #[arg(long)]
        engine: Option<String>,
        #[arg(long)]
        name: String,
        #[arg(long, default_value_t = 1)]
        warmup: usize,
        #[arg(long, default_value_t = 5)]
        iterations: usize,
        file: PathBuf,
    },
    /// Time engine creation plus loading and evaluating a bundle; prints one
    /// JSON line.
    Startup {
        #[arg(long)]
        engine: Option<String>,
        #[arg(long, default_value_t = 1)]
        warmup: usize,
        #[arg(long, default_value_t = 5)]
        iterations: usize,
        file: PathBuf,
    },
}

fn engine(name: Option<String>) -> Result<EngineChoice> {
    let choice = match name {
        None => EngineChoice::default(),
        Some(n) => match EngineChoice::parse(&n) {
            Some(c) => c,
            None => bail!("unknown engine {n:?} (expected agnijs or quickjs)"),
        },
    };
    if choice.is_interim() {
        eprintln!("note: the interim engine (quickjs) stays selectable for one release after the switch-over; the default is agnijs");
    }
    Ok(choice)
}

fn peak_rss() -> Option<u64> {
    agnijs_js_bench::memory::peak_rss_bytes()
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Run { engine: e, timeout_s, files } => {
            let choice = engine(e)?;
            let mut failed = false;
            for file in files {
                let mut rt = Runtime::new(choice, Options { capture_console: false, timeout: Some(Duration::from_secs(timeout_s)) })?;
                let outcome = rt.run_module(&file)?;
                let report = serde_json::json!({
                    "file": file.to_string_lossy(),
                    "engine": choice.name(),
                    "error": outcome.error,
                    "uncaught": outcome.uncaught,
                    "unhandled": outcome.unhandled,
                });
                println!("@@gable-module {report}");
                failed |= outcome.error.is_some();
            }
            if failed {
                std::process::exit(1);
            }
        }
        Command::List { engine: e, file } => {
            let mut rt = Runtime::new(engine(e)?, Options::default())?;
            let ns = rt.load_namespace(&file)?;
            for n in rt.benchmark_names(&ns)? {
                println!("{n}");
            }
        }
        Command::Bench { engine: e, name, warmup, iterations, file } => {
            let choice = engine(e)?;
            let mut rt = Runtime::new(choice, Options::default())?;
            let ns = rt.load_namespace(&file)?;
            let mut b = rt.benchmark(&ns, &name)?;
            let mut samples = Vec::with_capacity(iterations);
            let mut checksum = String::new();
            for i in 0..warmup + iterations {
                let start = Instant::now();
                checksum = rt.run_benchmark_iteration(&mut b)?;
                if i >= warmup {
                    samples.push(start.elapsed().as_nanos() as u64);
                }
            }
            let usage = rt.engine().memory_usage();
            println!(
                "{}",
                serde_json::json!({
                    "engine": choice.name(), "name": name, "samples_ns": samples, "checksum": checksum,
                    "heap_bytes": usage.heap_bytes, "peak_rss_bytes": peak_rss(),
                })
            );
        }
        Command::Startup { engine: e, warmup, iterations, file } => {
            let choice = engine(e)?;
            let mut samples = Vec::with_capacity(iterations);
            let mut heap = 0;
            for i in 0..warmup + iterations {
                let start = Instant::now();
                let mut rt = Runtime::new(choice, Options::default())?;
                let ns = rt.load_namespace(&file)?;
                drop(ns);
                if i >= warmup {
                    samples.push(start.elapsed().as_nanos() as u64);
                }
                heap = rt.engine().memory_usage().heap_bytes;
            }
            println!(
                "{}",
                serde_json::json!({
                    "engine": choice.name(), "name": "startup", "samples_ns": samples, "checksum": "loaded",
                    "heap_bytes": heap, "peak_rss_bytes": peak_rss(),
                })
            );
        }
    }
    Ok(())
}
