//! PROTOTYPE: the Gable-owned path-rasterization seam (ADR 0005) with three implementations:
//! vello_cpu, vello_gpu (pinned git rev) and lyon (tessellation + 4x4 supersampled triangle fill).
use crate::dl::{PathCmd, PathFill};
use vello_common::kurbo::BezPath;
use vello_common::color::{AlphaColor, Srgb};

/// Returns premultiplied RGBA8, row-major, w*h*4 bytes.
pub trait PathRasterizer {
    fn name(&self) -> &'static str;
    fn rasterize(&mut self, fills: &[PathFill], w: u32, h: u32) -> Vec<u8>;
}

fn to_bez(cmds: &[PathCmd]) -> BezPath {
    let mut p = BezPath::new();
    for c in cmds {
        match *c {
            PathCmd::M(x, y) => p.move_to((x as f64, y as f64)),
            PathCmd::L(x, y) => p.line_to((x as f64, y as f64)),
            PathCmd::Q(a, b, x, y) => p.quad_to((a as f64, b as f64), (x as f64, y as f64)),
            PathCmd::C(a, b, c2, d, x, y) => {
                p.curve_to((a as f64, b as f64), (c2 as f64, d as f64), (x as f64, y as f64))
            }
            PathCmd::Z => p.close_path(),
        }
    }
    p
}
fn col(c: [f32; 4]) -> AlphaColor<Srgb> {
    AlphaColor::new(c)
}

pub struct VelloCpu;
impl PathRasterizer for VelloCpu {
    fn name(&self) -> &'static str {
        "vello_cpu"
    }
    fn rasterize(&mut self, fills: &[PathFill], w: u32, h: u32) -> Vec<u8> {
        let mut ctx = vello_cpu::RenderContext::new(w as u16, h as u16);
        let mut res = vello_cpu::Resources::new();
        for f in fills {
            ctx.set_paint(col(f.color));
            ctx.fill_path(&to_bez(&f.cmds));
        }
        ctx.flush();
        let mut pm = vello_cpu::Pixmap::new(w as u16, h as u16);
        ctx.render(&mut pm, &mut res);
        pm.data_as_u8_slice().to_vec()
    }
}

pub struct VelloGpu {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
}
impl PathRasterizer for VelloGpu {
    fn name(&self) -> &'static str {
        "vello_gpu"
    }
    fn rasterize(&mut self, fills: &[PathFill], w: u32, h: u32) -> Vec<u8> {
        let mut scene = vello_gpu::Scene::new(w as u16, h as u16);
        for f in fills {
            scene.set_paint(col(f.color));
            scene.fill_path(&to_bez(&f.cmds));
        }
        let tex = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("vello_gpu target"),
            size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = tex.create_view(&wgpu::TextureViewDescriptor::default());
        let (mut renderer, mut resources) = vello_gpu::Renderer::new(
            &self.device,
            &self.queue,
            &vello_gpu::RenderTargetConfig { format: tex.format(), width: w as u16, height: h as u16 },
        );
        let size = vello_gpu::RenderSize { width: w as u16, height: h as u16 };
        let depth = renderer.create_depth_texture_view(&size);
        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
        renderer
            .render(
                &scene,
                &mut resources,
                &mut enc,
                vello_gpu::RenderTarget { view: &view, depth_view: Some(&depth) },
                &vello_gpu::TextureBindings::new(),
                vello_gpu::RenderOptions::default(),
            )
            .unwrap();
        crate::gpu::readback_rgba(&self.device, &self.queue, enc, &tex, w, h)
    }
}

pub struct Lyon;
impl PathRasterizer for Lyon {
    fn name(&self) -> &'static str {
        "lyon (tessellate + 4x4 supersampled triangles)"
    }
    fn rasterize(&mut self, fills: &[PathFill], w: u32, h: u32) -> Vec<u8> {
        use lyon::math::point;
        use lyon::path::Path;
        use lyon::tessellation::*;
        let mut out = vec![0f32; (w * h * 4) as usize];
        for f in fills {
            let mut b = Path::builder();
            let mut open = false;
            for c in &f.cmds {
                match *c {
                    PathCmd::M(x, y) => {
                        if open {
                            b.end(false);
                        }
                        b.begin(point(x, y));
                        open = true;
                    }
                    PathCmd::L(x, y) => {
                        b.line_to(point(x, y));
                    }
                    PathCmd::Q(a, bb, x, y) => {
                        b.quadratic_bezier_to(point(a, bb), point(x, y));
                    }
                    PathCmd::C(a, bb, c2, d, x, y) => {
                        b.cubic_bezier_to(point(a, bb), point(c2, d), point(x, y));
                    }
                    PathCmd::Z => {
                        b.end(true);
                        open = false;
                    }
                }
            }
            if open {
                b.end(true);
            }
            let path = b.build();
            let mut geo: VertexBuffers<[f32; 2], u32> = VertexBuffers::new();
            let mut t = FillTessellator::new();
            t.tessellate_path(
                &path,
                &FillOptions::default().with_tolerance(0.05),
                &mut BuffersBuilder::new(&mut geo, |v: FillVertex| v.position().to_array()),
            )
            .unwrap();
            let mut cov = vec![0f32; (w * h) as usize];
            for tri in geo.indices.chunks(3) {
                let p: Vec<[f32; 2]> = tri.iter().map(|&i| geo.vertices[i as usize]).collect();
                let (minx, maxx) = (p.iter().map(|v| v[0]).fold(f32::MAX, f32::min), p.iter().map(|v| v[0]).fold(f32::MIN, f32::max));
                let (miny, maxy) = (p.iter().map(|v| v[1]).fold(f32::MAX, f32::min), p.iter().map(|v| v[1]).fold(f32::MIN, f32::max));
                let edge = |a: [f32; 2], bb: [f32; 2], c: [f32; 2]| (bb[0] - a[0]) * (c[1] - a[1]) - (bb[1] - a[1]) * (c[0] - a[0]);
                let area = edge(p[0], p[1], p[2]);
                if area.abs() < 1e-9 {
                    continue;
                }
                for y in (miny.floor().max(0.) as u32)..((maxy.ceil() as u32).min(h)) {
                    for x in (minx.floor().max(0.) as u32)..((maxx.ceil() as u32).min(w)) {
                        let mut n = 0;
                        for sy in 0..4 {
                            for sx in 0..4 {
                                let q = [x as f32 + (sx as f32 + 0.5) / 4., y as f32 + (sy as f32 + 0.5) / 4.];
                                let (w0, w1, w2) = (edge(p[1], p[2], q) / area, edge(p[2], p[0], q) / area, edge(p[0], p[1], q) / area);
                                if w0 >= 0. && w1 >= 0. && w2 >= 0. {
                                    n += 1;
                                }
                            }
                        }
                        cov[(y * w + x) as usize] += n as f32 / 16.;
                    }
                }
            }
            for i in 0..(w * h) as usize {
                let a = cov[i].min(1.0) * f.color[3];
                if a <= 0. {
                    continue;
                }
                let o = &mut out[i * 4..i * 4 + 4];
                let inv = 1. - a;
                o[0] = f.color[0] * a + o[0] * inv;
                o[1] = f.color[1] * a + o[1] * inv;
                o[2] = f.color[2] * a + o[2] * inv;
                o[3] = a + o[3] * inv;
            }
        }
        out.iter().map(|v| (v * 255.0 + 0.5).clamp(0., 255.) as u8).collect()
    }
}
