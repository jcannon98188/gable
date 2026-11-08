//! PROTOTYPE (TASK-99.22): throwaway renderer-stack spike. Not production code.
use gable_renderer_spike::{gpu, math, paths, scene};

use gpu::*;
use paths::*;
use std::sync::Arc;

fn write_png(path: &str, w: u32, h: u32, rgba_premul: &[u8]) {
    // composite over white-ish checker-free: un-premultiply for inspection
    let mut out = Vec::with_capacity(rgba_premul.len());
    for p in rgba_premul.chunks_exact(4) {
        let a = p[3] as f32 / 255.0;
        if a > 0.0 {
            out.extend_from_slice(&[(p[0] as f32 / a).min(255.) as u8, (p[1] as f32 / a).min(255.) as u8, (p[2] as f32 / a).min(255.) as u8, p[3]]);
        } else {
            out.extend_from_slice(&[0, 0, 0, 0]);
        }
    }
    let f = std::fs::File::create(path).unwrap();
    let mut e = png::Encoder::new(std::io::BufWriter::new(f), w, h);
    e.set_color(png::ColorType::Rgba);
    e.set_depth(png::BitDepth::Eight);
    e.write_header().unwrap().write_image_data(&out).unwrap();
}

fn gpu_headless() -> Arc<Gpu> {
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle().with_env());
    Arc::new(pollster::block_on(init_gpu(None, &instance)))
}

fn diff_stats(a: &[u8], b: &[u8]) -> (f64, f64, f64) {
    // mean abs diff per channel (0..255), % pixels with any channel diff > 32, max
    let n = a.len() / 4;
    let (mut sum, mut bad, mut mx) = (0f64, 0usize, 0f64);
    for i in 0..n {
        let mut pd = 0f64;
        for c in 0..4 {
            let d = (a[i * 4 + c] as f64 - b[i * 4 + c] as f64).abs();
            sum += d;
            pd = pd.max(d);
        }
        if pd > 32.0 {
            bad += 1;
        }
        mx = mx.max(pd);
    }
    (sum / (n * 4) as f64, 100.0 * bad as f64 / n as f64, mx)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mode = args.get(1).map(String::as_str).unwrap_or("help");
    match mode {
        "render" => {
            // render <out.png> [scale] : main scene via the owned wgpu compositor, vello_cpu rasterizer
            let out = args.get(2).cloned().unwrap_or("scene.png".into());
            let scale: f32 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(1.0);
            let b = scene::main_scene(scale);
            std::fs::write(out.replace(".png", ".displaylist.json"), b.dl.canonical_json()).unwrap();
            let (w, h) = ((b.dl.size[0] * scale) as u32, (b.dl.size[1] * scale) as u32);
            let g = gpu_headless();
            println!("adapter: {:?} backend {:?}", g.info.name, g.info.backend);
            let mut c = Compositor::new(g, w, h, None);
            let mut r = VelloCpu;
            let px = c.render_to_rgba(&b.dl, &b.res, &mut r);
            write_png(&out, w, h, &px);
            println!("wrote {out} {w}x{h} stats {:?}", c.last_stats);
        }
        "sheet" => {
            let out = args.get(2).cloned().unwrap_or("sheet.png".into());
            let scale: f32 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(1.0);
            let b = scene::text_sheet(scale);
            let (w, h) = ((b.dl.size[0] * scale) as u32, (b.dl.size[1] * scale) as u32);
            let g = gpu_headless();
            let mut c = Compositor::new(g, w, h, None);
            let px = c.render_to_rgba(&b.dl, &b.res, &mut VelloCpu);
            // flatten onto white for diffing with Chromium
            let mut flat = vec![255u8; px.len()];
            for (i, p) in px.chunks_exact(4).enumerate() {
                let a = p[3] as f32 / 255.0;
                for k in 0..3 {
                    flat[i * 4 + k] = (p[k] as f32 + 255.0 * (1.0 - a)).min(255.0) as u8;
                }
            }
            write_png(&out, w, h, &flat);
            println!("wrote {out} {w}x{h}");
        }
        "diff" => {
            // diff <a.png> <b.png> [dx dy search]: compare two RGBA PNGs of equal size
            let load = |p: &str| {
                let d = png::Decoder::new(std::io::BufReader::new(std::fs::File::open(p).unwrap()));
                let mut r = d.read_info().unwrap();
                let mut buf = vec![0; r.output_buffer_size()];
                let info = r.next_frame(&mut buf).unwrap();
                let ch = info.color_type.samples();
                let mut rgba = Vec::new();
                for px in buf[..info.buffer_size()].chunks_exact(ch) {
                    rgba.extend_from_slice(&[px[0], px[1], px[2], if ch == 4 { px[3] } else { 255 }]);
                }
                (info.width, info.height, rgba)
            };
            let (aw, ah, a) = load(&args[2]);
            let (bw, bh, b) = load(&args[3]);
            let w = aw.min(bw);
            let h = ah.min(bh);
            // search small integer offsets (dx,dy) of b relative to a; report best
            let mut best = (f64::MAX, 0i32, 0i32, 0f64, 0f64);
            for dy in -6i32..=6 {
                for dx in -6i32..=6 {
                    let (mut sa, mut sb) = (Vec::new(), Vec::new());
                    for y in 8..(h as i32 - 8) {
                        for x in 8..(w as i32 - 8) {
                            let (bx, by) = (x + dx, y + dy);
                            if bx < 0 || by < 0 || bx >= bw as i32 || by >= bh as i32 {
                                continue;
                            }
                            sa.extend_from_slice(&a[((y as u32 * aw + x as u32) * 4) as usize..][..4]);
                            sb.extend_from_slice(&b[((by as u32 * bw + bx as u32) * 4) as usize..][..4]);
                        }
                    }
                    let (m, p, _) = diff_stats(&sa, &sb);
                    if m < best.0 {
                        best = (m, dx, dy, p, 0.0);
                    }
                }
            }
            let (m0, p0, _) = {
                let (mut sa, mut sb) = (Vec::new(), Vec::new());
                for y in 8..(h - 8) {
                    for x in 8..(w - 8) {
                        sa.extend_from_slice(&a[((y * aw + x) * 4) as usize..][..4]);
                        sb.extend_from_slice(&b[((y * bw + x) * 4) as usize..][..4]);
                    }
                }
                diff_stats(&sa, &sb)
            };
            println!("aligned(0,0): mean_abs_diff={m0:.3}/255 pct_pixels_gt32={p0:.2}%");
            println!("best offset dx={} dy={}: mean_abs_diff={:.3}/255 pct_pixels_gt32={:.2}%", best.1, best.2, best.0, best.3);
        }
        "sbs" => {
            // sbs <gable.png> <chromium.png> <out.png> [crop_h]: top = Gable, bottom = Chromium, plus abs-diff strip
            let load = |p: &str| {
                let d = png::Decoder::new(std::io::BufReader::new(std::fs::File::open(p).unwrap()));
                let mut r = d.read_info().unwrap();
                let mut buf = vec![0; r.output_buffer_size()];
                let info = r.next_frame(&mut buf).unwrap();
                let ch = info.color_type.samples();
                let mut rgba = Vec::new();
                for px in buf[..info.buffer_size()].chunks_exact(ch) {
                    rgba.extend_from_slice(&[px[0], px[1], px[2], 255]);
                }
                (info.width, info.height, rgba)
            };
            let (w, h, a) = load(&args[2]);
            let (_, _, b) = load(&args[3]);
            let ch: u32 = args.get(5).and_then(|s| s.parse().ok()).unwrap_or(h).min(h);
            let mut out = vec![200u8; (w * (ch * 3 + 8) * 4) as usize];
            for y in 0..ch {
                for x in 0..w {
                    let i = ((y * w + x) * 4) as usize;
                    let o0 = ((y * w + x) * 4) as usize;
                    let o1 = (((y + ch + 4) * w + x) * 4) as usize;
                    let o2 = (((y + 2 * ch + 8) * w + x) * 4) as usize;
                    out[o0..o0 + 4].copy_from_slice(&a[i..i + 4]);
                    out[o1..o1 + 4].copy_from_slice(&b[i..i + 4]);
                    for c in 0..3 {
                        let d = (a[i + c] as i32 - b[i + c] as i32).unsigned_abs().min(255) as u8;
                        out[o2 + c] = 255 - d; // darker = bigger difference
                    }
                    out[o2 + 3] = 255;
                }
            }
            write_png(&args[4], w, ch * 3 + 8, &out);
        }
        "hit" => hit_table(),
        "paths" => paths_compare(&args.get(2).cloned().unwrap_or(".".into())),
        "bench" => bench(&args),
        "window" => gable_renderer_spike::app::run_desktop(args.get(2).and_then(|s| s.parse().ok()).unwrap_or(300)),
        _ => println!("usage: spike render|sheet|diff|hit|paths|bench"),
    }
}

fn hit_table() {
    // P3: perspective + nested clips + picking from the same transform/clip trees.
    let b = scene::main_scene(1.0);
    let dl = &b.dl;
    let mut rows = vec![];
    let mut fail = 0;
    let t3 = dl.hit.iter().find(|h| h.name == "card3d").unwrap().transform;
    let world = {
        let w3 = dl.world(t3);
        move |x: f32, y: f32| math::project(&w3, x, y).unwrap()
    };
    let card = dl.hit.iter().find(|h| h.name == "card3d").unwrap().bounds;
    let btn = dl.hit.iter().find(|h| h.name == "button").unwrap().bounds;
    // expected = name or "none"
    let mut cases: Vec<(String, (f32, f32), String)> = vec![];
    cases.push(("button centre".into(), world(btn[0] + btn[2] / 2., btn[1] + btn[3] / 2.), "button".into()));
    cases.push(("card body (empty area)".into(), world(card[0] + 20., card[1] + 8.), "card3d".into()));
    for i in 0..6 {
        let r = dl.hit.iter().find(|h| h.name == format!("row-{i}")).unwrap().bounds;
        // scroller inner clip: sc = [card.x+16, card.y+222, card.w-32, 130], inner inset 6
        let inner = [card[0] + 16. + 6., card[1] + 222. + 6., card[2] - 32. - 12., 130. - 12.];
        let cy = r[1] + r[3] / 2.;
        let visible = cy > inner[1] && cy < inner[1] + inner[3];
        let in_card = cy > card[1] && cy < card[1] + card[3];
        cases.push((format!("row-{i} centre"), world(r[0] + r[2] / 2., cy), if visible { format!("row-{i}") } else if in_card { "card3d".into() } else { "none".into() }));
    }
    // row 0 spans y = inner.y - 6 .. : its top 6px sits outside the inner clip -> must not hit row-0
    let r0 = dl.hit.iter().find(|h| h.name == "row-0").unwrap().bounds;
    let inner_top = card[1] + 222. + 6.;
    cases.push(("row-0 portion above inner clip".into(), world(r0[0] + r0[2] / 2., inner_top - 3.), "card3d".into()));
    cases.push(("row-0 portion inside inner clip".into(), world(r0[0] + r0[2] / 2., inner_top + 8.), "row-0".into()));
    // rounded corner of the outer scroller clip: top-left corner point lies outside the 18px radius
    cases.push(("inside card, outside scroller rounded corner".into(), world(card[0] + 16. + 2., card[1] + 222. + 2.), "card3d".into()));
    // outside the card entirely (left of the projected quad)
    let tl = world(card[0], card[1]);
    cases.push(("outside quad (left of top-left corner)".into(), (tl.0 - 6.0, tl.1), "none".into()));
    // A point inside the *unrotated* card rect but outside the rotated quad: must miss
    cases.push(("inside unrotated rect, outside rotated quad".into(), (card[0] + 2., card[1] + card[3] - 2.), "none-or-other".into()));
    println!("| case | screen point | expected | got | ok |\n|---|---|---|---|---|");
    for (name, (x, y), exp) in cases {
        let got = dl.hit_test(x, y).map(|h| h.name.clone()).unwrap_or("none".into());
        let ok = if exp == "none-or-other" { got != "card3d" && got != "button" && !got.starts_with("row-") } else { got == exp };
        if !ok {
            fail += 1;
        }
        rows.push(format!("| {name} | ({x:.1}, {y:.1}) | {exp} | {got} | {} |", if ok { "PASS" } else { "FAIL" }));
    }
    for r in &rows {
        println!("{r}");
    }
    println!("\nfailures: {fail}");
    // perspective check: projected quad is a trapezoid (opposite edges not parallel in length)
    let a = world(card[0], card[1]);
    let bb = world(card[0] + card[2], card[1]);
    let c = world(card[0], card[1] + card[3]);
    let d = world(card[0] + card[2], card[1] + card[3]);
    let left = ((a.0 - c.0).powi(2) + (a.1 - c.1).powi(2)).sqrt();
    let right = ((bb.0 - d.0).powi(2) + (bb.1 - d.1).powi(2)).sqrt();
    println!("projected left edge {left:.1}px vs right edge {right:.1}px (perspective foreshortening)");
}

fn paths_compare(dir: &str) {
    // P5: same scene through vello_cpu, vello_gpu and lyon behind the Gable-owned seam.
    let g = gpu_headless();
    let fills = scene::star_paths();
    let (w, h) = (160u32, 160u32);
    let mut cpu = VelloCpu;
    let mut gpuq = VelloGpu { device: g.device.clone(), queue: g.queue.clone() };
    let mut lyon = Lyon;
    let t = std::time::Instant::now();
    let a = cpu.rasterize(&fills, w, h);
    let ta = t.elapsed();
    let t = std::time::Instant::now();
    let b = gpuq.rasterize(&fills, w, h);
    let tb = t.elapsed();
    let t = std::time::Instant::now();
    let c = lyon.rasterize(&fills, w, h);
    let tc = t.elapsed();
    write_png(&format!("{dir}/paths-vello_cpu.png"), w, h, &a);
    write_png(&format!("{dir}/paths-vello_gpu.png"), w, h, &b);
    write_png(&format!("{dir}/paths-lyon.png"), w, h, &c);
    for (n, x, y) in [("vello_cpu vs vello_gpu", &a, &b), ("vello_cpu vs lyon", &a, &c), ("vello_gpu vs lyon", &b, &c)] {
        let (m, p, mx) = diff_stats(x, y);
        println!("{n}: mean_abs_diff={m:.3}/255 pct_pixels_gt32={p:.3}% max={mx}");
    }
    println!("times: vello_cpu {ta:?}, vello_gpu (incl. renderer setup) {tb:?}, lyon {tc:?}");
}

fn bench(args: &[String]) {
    // P2: frame time at 1920x1080 (1280x720 @1.5x) for the main scene, with and without blur/backdrop.
    let frames: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(200);
    let g = gpu_headless();
    println!("adapter: {} ({:?}) backend {:?}", g.info.name, g.info.device_type, g.info.backend);
    for (label, strip) in [("full scene", false), ("no blur/backdrop (baseline)", true)] {
        let mut b = scene::main_scene(1.5);
        if strip {
            for e in b.dl.effects.iter_mut() {
                e.blur = 0.0;
                e.backdrop_blur = 0.0;
            }
        }
        let (w, h) = ((b.dl.size[0] * 1.5) as u32, (b.dl.size[1] * 1.5) as u32);
        let mut c = Compositor::new(g.clone(), w, h, None);
        let mut r = VelloCpu;
        // warm up (rasterizes paths, builds atlas)
        for _ in 0..5 {
            let enc = c.render(&b.dl, &b.res, &mut r);
            g.queue.submit([enc.finish()]);
            g.device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
        }
        let mut ts = vec![];
        for _ in 0..frames {
            let t = std::time::Instant::now();
            let enc = c.render(&b.dl, &b.res, &mut r);
            g.queue.submit([enc.finish()]);
            g.device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
            ts.push(t.elapsed().as_secs_f64() * 1000.0);
        }
        ts.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let avg = ts.iter().sum::<f64>() / ts.len() as f64;
        println!(
            "{label}: {w}x{h} frames={frames} avg={avg:.2}ms p50={:.2} p95={:.2} p99={:.2} max={:.2} (=> {:.0} fps avg) stats {:?}",
            ts[ts.len() / 2],
            ts[(ts.len() as f64 * 0.95) as usize],
            ts[(ts.len() as f64 * 0.99) as usize],
            ts[ts.len() - 1],
            1000.0 / avg,
            c.last_stats
        );
    }
}
