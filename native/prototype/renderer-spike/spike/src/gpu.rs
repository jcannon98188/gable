//! PROTOTYPE owned wgpu compositor: UI primitives (rrect/border/gradient/glyph/image) drawn from an
//! instance data texture, isolated effect layers (opacity, mask, blend, blur, backdrop blur) and
//! 4x4/perspective transforms. No storage buffers, no compute, no Skia/Vello types in the boundary.
use crate::dl::*;
use crate::math::*;
use crate::paths::PathRasterizer;
use std::collections::HashMap;
use wgpu::util::DeviceExt;

pub const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const STRIDE: usize = 22;
const DW: usize = 2048;

pub struct Gpu {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    pub info: wgpu::AdapterInfo,
}

pub async fn init_gpu(compatible: Option<&wgpu::Surface<'_>>, instance: &wgpu::Instance) -> Gpu {
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter: false,
            compatible_surface: compatible,
            ..Default::default()
        })
        .await
        .expect("no adapter");
    let info = adapter.get_info();
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor {
            label: Some("spike"),
            required_limits: wgpu::Limits::downlevel_webgl2_defaults().using_resolution(adapter.limits()),
            ..Default::default()
        })
        .await
        .expect("no device");
    Gpu { device, queue, info }
}

pub fn readback_rgba(device: &wgpu::Device, queue: &wgpu::Queue, mut enc: wgpu::CommandEncoder, tex: &wgpu::Texture, w: u32, h: u32) -> Vec<u8> {
    let bpr = (w * 4).next_multiple_of(256);
    let buf = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("readback"),
        size: (bpr * h) as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    enc.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo { texture: tex, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
        wgpu::TexelCopyBufferInfo { buffer: &buf, layout: wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(bpr), rows_per_image: None } },
        wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
    );
    queue.submit([enc.finish()]);
    buf.slice(..).map_async(wgpu::MapMode::Read, |r| r.unwrap());
    device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
    let mut out = Vec::with_capacity((w * h * 4) as usize);
    {
        let map = buf.slice(..).get_mapped_range().unwrap();
        for row in map.chunks_exact(bpr as usize) {
            out.extend_from_slice(&row[..(w * 4) as usize]);
        }
    }
    buf.unmap();
    out
}

struct Tex {
    tex: wgpu::Texture,
    view: wgpu::TextureView,
}
struct AtlasEntry {
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    ox: f32,
    oy: f32,
}
struct Img {
    _tex: wgpu::Texture,
    bind: wgpu::BindGroup,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Bind {
    Atlas,
    Image(u32),
    PathImg(u32),
}
enum Cmd {
    Draw { first: u32, count: u32, bind: Bind },
    Push(u32),
    Pop(u32),
}

pub struct Compositor {
    pub gpu: std::sync::Arc<Gpu>,
    pub w: u32,
    pub h: u32,
    prim: wgpu::RenderPipeline,
    fx_normal: wgpu::RenderPipeline,
    fx_blend: wgpu::RenderPipeline,
    blur: wgpu::RenderPipeline,
    globals_bgl: wgpu::BindGroupLayout,
    tex_bgl: wgpu::BindGroupLayout,
    fx_u_bgl: wgpu::BindGroupLayout,
    fx_t_bgl: wgpu::BindGroupLayout,
    blur_u_bgl: wgpu::BindGroupLayout,
    blur_t_bgl: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    atlas: Tex,
    atlas_bind: wgpu::BindGroup,
    atlas_map: HashMap<(u32, u32, u32, u32), Option<AtlasEntry>>,
    shelf: (u32, u32, u32), // x, y, row height
    images: HashMap<u32, Img>,
    path_images: HashMap<u32, Img>,
    pool: Vec<Tex>,
    pub root: Tex,
    pub last_stats: Stats,
}
#[derive(Default, Clone, Copy, Debug)]
pub struct Stats {
    pub instances: usize,
    pub passes: usize,
    pub layers: usize,
}

fn make_tex(d: &wgpu::Device, w: u32, h: u32, fmt: wgpu::TextureFormat, label: &str) -> Tex {
    let tex = d.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: fmt,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_SRC | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    let view = tex.create_view(&wgpu::TextureViewDescriptor::default());
    Tex { tex, view }
}

fn tex_entry(b: u32, filterable: bool) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding: b,
        visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable },
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
        count: None,
    }
}
fn smp_entry(b: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding: b,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
        count: None,
    }
}
fn uni_entry(b: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding: b,
        visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
        count: None,
    }
}

fn pipeline(
    d: &wgpu::Device,
    label: &str,
    module: &wgpu::ShaderModule,
    layouts: &[&wgpu::BindGroupLayout],
    fs: &str,
    fmt: wgpu::TextureFormat,
    blend: Option<wgpu::BlendState>,
) -> wgpu::RenderPipeline {
    let bgls: Vec<Option<&wgpu::BindGroupLayout>> = layouts.iter().map(|l| Some(*l)).collect();
    let pl = d.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some(label), bind_group_layouts: &bgls, immediate_size: 0 });
    d.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(label),
        layout: Some(&pl),
        vertex: wgpu::VertexState { module, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
        fragment: Some(wgpu::FragmentState {
            module,
            entry_point: Some(fs),
            targets: &[Some(wgpu::ColorTargetState { format: fmt, blend, write_mask: wgpu::ColorWrites::ALL })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview_mask: None,
        cache: None,
    })
}

const PREMUL_OVER: wgpu::BlendState = wgpu::BlendState {
    color: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::One, dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha, operation: wgpu::BlendOperation::Add },
    alpha: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::One, dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha, operation: wgpu::BlendOperation::Add },
};

struct Inst {
    mat: Mat4,
    cm0: Mat4,
    cm1: Mat4,
    rect: [f32; 4],
    clip0: [f32; 4],
    clip1: [f32; 4],
    params: [f32; 4],
    params2: [f32; 4],
    c0: [f32; 4],
    c1: [f32; 4],
    bc: [f32; 4],
    uv: [f32; 4],
    grad: [f32; 4],
}

pub fn aabb_of(m: &Mat4, r: &[f32; 4], pad: f32, w: u32, h: u32) -> (u32, u32, u32, u32) {
    let pts = [(r[0], r[1]), (r[0] + r[2], r[1]), (r[0], r[1] + r[3]), (r[0] + r[2], r[1] + r[3])];
    let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
    for (x, y) in pts {
        if let Some((px, py)) = project(m, x, y) {
            x0 = x0.min(px);
            y0 = y0.min(py);
            x1 = x1.max(px);
            y1 = y1.max(py);
        }
    }
    let x0 = ((x0 - pad).floor().max(0.) as u32).min(w);
    let y0 = ((y0 - pad).floor().max(0.) as u32).min(h);
    let x1 = ((x1 + pad).ceil().max(0.) as u32).min(w);
    let y1 = ((y1 + pad).ceil().max(0.) as u32).min(h);
    (x0, y0, x1.saturating_sub(x0).max(1), y1.saturating_sub(y0).max(1))
}

impl Compositor {
    pub fn new(gpu: std::sync::Arc<Gpu>, w: u32, h: u32, surface_fmt: Option<wgpu::TextureFormat>) -> Self {
        let d = &gpu.device;
        let globals_bgl = d.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[uni_entry(0), tex_entry(1, false)],
        });
        let tex_bgl = d.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: None, entries: &[tex_entry(0, true), smp_entry(1)] });
        let fx_u_bgl = d.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: None, entries: &[uni_entry(0)] });
        let fx_t_bgl = d.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: None, entries: &[tex_entry(0, true), tex_entry(1, true), smp_entry(2)] });
        let blur_u_bgl = fx_u_bgl.clone();
        let blur_t_bgl = tex_bgl.clone();
        let m_prim = d.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("prim"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders.wgsl").into()) });
        let m_fx = d.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("fx"), source: wgpu::ShaderSource::Wgsl(include_str!("fx.wgsl").into()) });
        let m_blur = d.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("blur"), source: wgpu::ShaderSource::Wgsl(include_str!("blur.wgsl").into()) });
        let prim = pipeline(d, "prim", &m_prim, &[&globals_bgl, &tex_bgl], "fs", FORMAT, Some(PREMUL_OVER));
        let fx_normal = pipeline(d, "fx_normal", &m_fx, &[&fx_u_bgl, &fx_t_bgl], "fs", FORMAT, Some(PREMUL_OVER));
        let fx_blend = pipeline(d, "fx_blend", &m_fx, &[&fx_u_bgl, &fx_t_bgl], "fs", FORMAT, None);
        let blur = pipeline(d, "blur", &m_blur, &[&blur_u_bgl, &blur_t_bgl], "fs", FORMAT, None);
        let _ = surface_fmt;
        let sampler = d.create_sampler(&wgpu::SamplerDescriptor {
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            ..Default::default()
        });
        let atlas = make_tex(d, 2048, 2048, wgpu::TextureFormat::R8Unorm, "atlas");
        let atlas_bind = d.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &tex_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&atlas.view) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&sampler) },
            ],
        });
        let root = make_tex(d, w, h, FORMAT, "root");
        Self {
            gpu: gpu.clone(),
            w,
            h,
            prim,
            fx_normal,
            fx_blend,
            blur,
            globals_bgl,
            tex_bgl,
            fx_u_bgl,
            fx_t_bgl,
            blur_u_bgl,
            blur_t_bgl,
            sampler,
            atlas,
            atlas_bind,
            atlas_map: HashMap::new(),
            shelf: (1, 1, 0),
            images: HashMap::new(),
            path_images: HashMap::new(),
            pool: vec![],
            root,
            last_stats: Stats::default(),
        }
    }

    fn upload_image(&self, w: u32, h: u32, rgba: &[u8]) -> Img {
        let d = &self.gpu.device;
        let t = make_tex(d, w, h, FORMAT, "img");
        self.gpu.queue.write_texture(
            wgpu::TexelCopyTextureInfo { texture: &t.tex, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
            rgba,
            wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(w * 4), rows_per_image: None },
            wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
        );
        let bind = d.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &self.tex_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&t.view) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&self.sampler) },
            ],
        });
        Img { _tex: t.tex, bind }
    }

    fn glyph(&mut self, res: &Resources, font: u32, gid: u32, size_px: f32, bin: u32) -> Option<&AtlasEntry> {
        let key = (font, gid, (size_px * 8.0) as u32, bin);
        if !self.atlas_map.contains_key(&key) {
            let e = self.rasterize_glyph(res, font, gid, size_px, bin);
            self.atlas_map.insert(key, e);
        }
        self.atlas_map.get(&key).and_then(|e| e.as_ref())
    }

    fn rasterize_glyph(&mut self, res: &Resources, font: u32, gid: u32, size_px: f32, bin: u32) -> Option<AtlasEntry> {
        use skrifa::instance::{LocationRef, Size};
        use skrifa::outline::{DrawSettings, OutlinePen};
        use skrifa::{FontRef, GlyphId, MetadataProvider};
        use vello_common::kurbo::{BezPath, Shape};
        struct Pen(BezPath);
        impl OutlinePen for Pen {
            fn move_to(&mut self, x: f32, y: f32) {
                self.0.move_to((x as f64, -y as f64));
            }
            fn line_to(&mut self, x: f32, y: f32) {
                self.0.line_to((x as f64, -y as f64));
            }
            fn quad_to(&mut self, a: f32, b: f32, x: f32, y: f32) {
                self.0.quad_to((a as f64, -b as f64), (x as f64, -y as f64));
            }
            fn curve_to(&mut self, a: f32, b: f32, c: f32, d: f32, x: f32, y: f32) {
                self.0.curve_to((a as f64, -b as f64), (c as f64, -d as f64), (x as f64, -y as f64));
            }
            fn close(&mut self) {
                self.0.close_path();
            }
        }
        let fr = &res.fonts[font as usize];
        let fref = FontRef::from_index(&fr.data, fr.index).ok()?;
        let glyph = fref.outline_glyphs().get(GlyphId::new(gid))?;
        let mut pen = Pen(BezPath::new());
        glyph.draw(DrawSettings::unhinted(Size::new(size_px), LocationRef::default()), &mut pen).ok()?;
        let mut path = pen.0;
        if path.elements().is_empty() {
            return None;
        }
        // subpixel bin shift in x
        path.apply_affine(vello_common::kurbo::Affine::translate((bin as f64 / 4.0, 0.0)));
        let bb = path.bounding_box();
        let ox = bb.x0.floor() as i32 - 1;
        let oy = bb.y0.floor() as i32 - 1;
        let bw = (bb.x1.ceil() as i32 + 1 - ox).max(1) as u32;
        let bh = (bb.y1.ceil() as i32 + 1 - oy).max(1) as u32;
        path.apply_affine(vello_common::kurbo::Affine::translate((-ox as f64, -oy as f64)));
        let mut ctx = vello_cpu::RenderContext::new(bw as u16, bh as u16);
        let mut rr = vello_cpu::Resources::new();
        ctx.set_paint(vello_common::color::AlphaColor::<vello_common::color::Srgb>::new([1., 1., 1., 1.]));
        ctx.fill_path(&path);
        ctx.flush();
        let mut pm = vello_cpu::Pixmap::new(bw as u16, bh as u16);
        ctx.render(&mut pm, &mut rr);
        let alpha: Vec<u8> = pm.data_as_u8_slice().chunks_exact(4).map(|p| p[3]).collect();
        // shelf allocate
        let (mut sx, mut sy, mut rh) = self.shelf;
        if sx + bw + 1 > 2048 {
            sx = 1;
            sy += rh + 1;
            rh = 0;
        }
        if sy + bh + 1 > 2048 {
            return None;
        }
        self.gpu.queue.write_texture(
            wgpu::TexelCopyTextureInfo { texture: &self.atlas.tex, mip_level: 0, origin: wgpu::Origin3d { x: sx, y: sy, z: 0 }, aspect: wgpu::TextureAspect::All },
            &alpha,
            wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(bw), rows_per_image: None },
            wgpu::Extent3d { width: bw, height: bh, depth_or_array_layers: 1 },
        );
        let e = AtlasEntry { x: sx, y: sy, w: bw, h: bh, ox: ox as f32, oy: oy as f32 };
        self.shelf = (sx + bw + 1, sy, rh.max(bh));
        Some(e)
    }

    fn prepare(&mut self, dl: &DisplayList, res: &Resources, rast: &mut dyn PathRasterizer) {
        for (i, im) in res.images.iter().enumerate() {
            if !self.images.contains_key(&(i as u32)) {
                let img = self.upload_image(im.w, im.h, &im.rgba);
                self.images.insert(i as u32, img);
            }
        }
        for it in &dl.items {
            if let Kind::Path { rect, path } = &it.kind {
                if !self.path_images.contains_key(path) {
                    let w = (rect[2] * dl.scale).ceil() as u32;
                    let h = (rect[3] * dl.scale).ceil() as u32;
                    let scaled: Vec<PathFill> = res.paths[*path as usize]
                        .iter()
                        .map(|f| PathFill {
                            cmds: f
                                .cmds
                                .iter()
                                .map(|c| {
                                    let s = dl.scale;
                                    match *c {
                                        PathCmd::M(x, y) => PathCmd::M(x * s, y * s),
                                        PathCmd::L(x, y) => PathCmd::L(x * s, y * s),
                                        PathCmd::Q(a, b, x, y) => PathCmd::Q(a * s, b * s, x * s, y * s),
                                        PathCmd::C(a, b, c2, d, x, y) => PathCmd::C(a * s, b * s, c2 * s, d * s, x * s, y * s),
                                        PathCmd::Z => PathCmd::Z,
                                    }
                                })
                                .collect(),
                            color: f.color,
                        })
                        .collect();
                    let px = rast.rasterize(&scaled, w, h);
                    let img = self.upload_image(w, h, &px);
                    self.path_images.insert(*path, img);
                }
            }
        }
    }

    pub fn invalidate_paths(&mut self) {
        self.path_images.clear();
    }

    fn build(&mut self, dl: &DisplayList, res: &Resources) -> (Vec<f32>, Vec<Cmd>) {
        let mut data: Vec<f32> = vec![];
        let mut cmds: Vec<Cmd> = vec![];
        let mut stack: Vec<u32> = vec![];
        let mut n: u32 = 0;
        let mut pending: Option<(u32, u32, Bind)> = None;
        let no_clip = [-1e6f32, -1e6, 2e6, 2e6];
        let chain_of = |e: Option<u32>| -> Vec<u32> {
            let mut v = vec![];
            let mut c = e;
            while let Some(i) = c {
                v.push(i);
                c = dl.effects[i as usize].parent;
            }
            v.reverse();
            v
        };
        let mut world_cache: HashMap<u32, Mat4> = HashMap::new();
        let mut inv_cache: HashMap<u32, Mat4> = HashMap::new();
        macro_rules! world {
            ($t:expr) => {{
                let t = $t;
                *world_cache.entry(t).or_insert_with(|| dl.world(t))
            }};
        }
        let mut emit = |inst: Inst, bind: Bind, data: &mut Vec<f32>, cmds: &mut Vec<Cmd>, pending: &mut Option<(u32, u32, Bind)>, n: &mut u32| {
            for m in [&inst.mat, &inst.cm0, &inst.cm1] {
                data.extend_from_slice(m);
            }
            for v in [inst.rect, inst.clip0, inst.clip1, inst.params, inst.params2, inst.c0, inst.c1, inst.bc, inst.uv, inst.grad] {
                data.extend_from_slice(&v);
            }
            match pending {
                Some((_, c, b)) if *b == bind => *c += 1,
                _ => {
                    if let Some((f, c, b)) = pending.take() {
                        cmds.push(Cmd::Draw { first: f, count: c, bind: b });
                    }
                    *pending = Some((*n, 1, bind));
                }
            }
            *n += 1;
        };
        for it in &dl.items {
            let chain = chain_of(it.effect);
            let mut k = 0;
            while k < stack.len() && k < chain.len() && stack[k] == chain[k] {
                k += 1;
            }
            let mut flush = |pending: &mut Option<(u32, u32, Bind)>, cmds: &mut Vec<Cmd>| {
                if let Some((f, c, b)) = pending.take() {
                    cmds.push(Cmd::Draw { first: f, count: c, bind: b });
                }
            };
            while stack.len() > k {
                flush(&mut pending, &mut cmds);
                cmds.push(Cmd::Pop(stack.pop().unwrap()));
            }
            for &e in &chain[k..] {
                flush(&mut pending, &mut cmds);
                cmds.push(Cmd::Push(e));
                stack.push(e);
            }
            let mat = world!(it.transform);
            // clips: up to two nested clip nodes resolved into the item's local space
            let mut cm = [IDENT, IDENT];
            let mut cr = [no_clip, no_clip];
            let mut crad = [0f32, 0f32];
            let mut ccount = 0;
            let mut c = it.clip;
            while let Some(ci) = c {
                if ccount >= 2 {
                    break;
                }
                let cn = &dl.clips[ci as usize];
                let inv = *inv_cache.entry(cn.transform).or_insert_with(|| inverse(&world!(cn.transform)));
                cm[ccount] = mul(&inv, &mat);
                cr[ccount] = cn.rect;
                crad[ccount] = cn.radius;
                ccount += 1;
                c = cn.parent;
            }
            let base = |rect: [f32; 4], radius: f32, kind: f32| Inst {
                mat,
                cm0: cm[0],
                cm1: cm[1],
                rect,
                clip0: cr[0],
                clip1: cr[1],
                params: [radius, 0., kind, crad[0]],
                params2: [(ccount > 0) as u32 as f32, (ccount > 1) as u32 as f32, 0., crad[1]],
                c0: [0.; 4],
                c1: [0.; 4],
                bc: [0.; 4],
                uv: [0., 0., 1., 1.],
                grad: [0.; 4],
            };
            match &it.kind {
                Kind::Rect { rect, radius, fill, border } => {
                    let mut i = base(*rect, *radius, 0.);
                    match fill {
                        Fill::Solid(c) => i.c0 = *c,
                        Fill::Linear { p0, p1, c0, c1 } => {
                            i.c0 = *c0;
                            i.c1 = *c1;
                            i.params2[2] = 1.;
                            i.grad = [p0[0], p0[1], p1[0], p1[1]];
                        }
                    }
                    if let Some(b) = border {
                        i.params[1] = b.width;
                        i.bc = b.color;
                    }
                    emit(i, Bind::Atlas, &mut data, &mut cmds, &mut pending, &mut n);
                }
                Kind::Glyphs { font, size, color, glyphs } => {
                    let s = dl.scale;
                    for (gid, gx, gy) in glyphs {
                        let px = gx * s;
                        let ix = px.floor();
                        let bin = (((px - ix) * 4.0).floor() as u32).min(3);
                        let py = (gy * s).round();
                        let (aw, ah, ax, ay, aox, aoy) = match self.glyph(res, *font, *gid, size * s, bin) {
                            Some(e) => (e.w, e.h, e.x, e.y, e.ox, e.oy),
                            None => continue,
                        };
                        let rect = [(ix + aox) / s, (py + aoy) / s, aw as f32 / s, ah as f32 / s];
                        let mut i = base(rect, 0., 1.);
                        i.c0 = *color;
                        i.uv = [ax as f32 / 2048., ay as f32 / 2048., (ax + aw) as f32 / 2048., (ay + ah) as f32 / 2048.];
                        emit(i, Bind::Atlas, &mut data, &mut cmds, &mut pending, &mut n);
                    }
                }
                Kind::Image { rect, image, radius } => {
                    let i = base(*rect, *radius, 2.);
                    emit(i, Bind::Image(*image), &mut data, &mut cmds, &mut pending, &mut n);
                }
                Kind::Path { rect, path } => {
                    let i = base(*rect, 0., 2.);
                    emit(i, Bind::PathImg(*path), &mut data, &mut cmds, &mut pending, &mut n);
                }
            }
        }
        if let Some((f, c, b)) = pending.take() {
            cmds.push(Cmd::Draw { first: f, count: c, bind: b });
        }
        while let Some(e) = stack.pop() {
            cmds.push(Cmd::Pop(e));
        }
        (data, cmds)
    }

    fn pool_get(&mut self, i: usize) -> usize {
        while self.pool.len() <= i {
            let t = make_tex(&self.gpu.device, self.w, self.h, FORMAT, "pool");
            self.pool.push(t);
        }
        i
    }

    /// Renders the display list into `self.root` (and returns encoder-less; caller reads or blits).
    pub fn render(&mut self, dl: &DisplayList, res: &Resources, rast: &mut dyn PathRasterizer) -> wgpu::CommandEncoder {
        self.prepare(dl, res, rast);
        let (mut data, cmds) = self.build(dl, res);
        let ninst = data.len() / STRIDE / 4;
        let rows = ((ninst * STRIDE).div_ceil(DW)).max(1);
        data.resize(rows * DW * 4, 0.0);
        let d = self.gpu.device.clone();
        let q = self.gpu.queue.clone();
        let data_tex = d.create_texture(&wgpu::TextureDescriptor {
            label: Some("inst data"),
            size: wgpu::Extent3d { width: DW as u32, height: rows as u32, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba32Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        q.write_texture(
            wgpu::TexelCopyTextureInfo { texture: &data_tex, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
            bytemuck::cast_slice(&data),
            wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(DW as u32 * 16), rows_per_image: None },
            wgpu::Extent3d { width: DW as u32, height: rows as u32, depth_or_array_layers: 1 },
        );
        let data_view = data_tex.create_view(&Default::default());
        let gbuf = d.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: None,
            contents: bytemuck::cast_slice(&[self.w as f32, self.h as f32, 0f32, 0f32]),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let gbg = d.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &self.globals_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: gbuf.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&data_view) },
            ],
        });
        let mut enc = d.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("frame") });
        let mut stats = Stats { instances: ninst, ..Default::default() };
        // pool index 0..: layers; 100..: temps handled below. Use dedicated indices.
        const DST: usize = 0;
        const TA: usize = 1;
        const TB: usize = 2;
        let first_layer = 3usize;
        for i in 0..first_layer {
            self.pool_get(i);
        }
        // active target stack: None = root, Some(pool idx) = layer
        let mut targets: Vec<usize> = vec![];
        let mut next_layer = first_layer;
        // clear root
        {
            let _p = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("clear root"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.root.view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
                multiview_mask: None,
            });
            stats.passes += 1;
        }
        let (w, h) = (self.w, self.h);
        for cmd in &cmds {
            match cmd {
                Cmd::Draw { first, count, bind } => {
                    let tgt_view = match targets.last() {
                        None => &self.root.view,
                        Some(&i) => &self.pool[i].view,
                    };
                    let mut pass = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                        label: Some("draw"),
                        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                            view: tgt_view,
                            resolve_target: None,
                            depth_slice: None,
                            ops: wgpu::Operations { load: wgpu::LoadOp::Load, store: wgpu::StoreOp::Store },
                        })],
                        depth_stencil_attachment: None,
                        occlusion_query_set: None,
                        timestamp_writes: None,
                        multiview_mask: None,
                    });
                    stats.passes += 1;
                    pass.set_pipeline(&self.prim);
                    pass.set_bind_group(0, &gbg, &[]);
                    let tb = match bind {
                        Bind::Atlas => &self.atlas_bind,
                        Bind::Image(i) => &self.images[i].bind,
                        Bind::PathImg(i) => &self.path_images[i].bind,
                    };
                    pass.set_bind_group(1, tb, &[]);
                    pass.draw(0..6, *first..*first + *count);
                }
                Cmd::Push(e) => {
                    let en = &dl.effects[*e as usize];
                    let li = next_layer;
                    next_layer += 1;
                    self.pool_get(li);
                    stats.layers += 1;
                    let wm = dl.world(en.transform);
                    let pad = (en.blur.max(en.backdrop_blur) * 3.0).ceil();
                    let (rx, ry, rw, rh) = aabb_of(&wm, &en.bounds, pad, w, h);
                    // clear layer
                    {
                        let _p = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                            label: Some("clear layer"),
                            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                view: &self.pool[li].view,
                                resolve_target: None,
                                depth_slice: None,
                                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
                            })],
                            depth_stencil_attachment: None,
                            occlusion_query_set: None,
                            timestamp_writes: None,
                            multiview_mask: None,
                        });
                        stats.passes += 1;
                    }
                    if en.backdrop_blur > 0.0 {
                        let parent: &wgpu::Texture = match targets.last() {
                            None => &self.root.tex,
                            Some(&i) => &self.pool[i].tex,
                        };
                        enc.copy_texture_to_texture(
                            wgpu::TexelCopyTextureInfo { texture: parent, mip_level: 0, origin: wgpu::Origin3d { x: rx, y: ry, z: 0 }, aspect: wgpu::TextureAspect::All },
                            wgpu::TexelCopyTextureInfo { texture: &self.pool[DST].tex, mip_level: 0, origin: wgpu::Origin3d { x: rx, y: ry, z: 0 }, aspect: wgpu::TextureAspect::All },
                            wgpu::Extent3d { width: rw, height: rh, depth_or_array_layers: 1 },
                        );
                        self.blur_passes(&mut enc, DST, TA, TB, en.backdrop_blur, (rx, ry, rw, rh), &mut stats);
                        // draw blurred backdrop into the layer, masked to the effect bounds
                        let mask = Mask::RoundedRect { rect: en.bounds, radius: en.radius };
                        self.fx_pass(&mut enc, TB, DST, li, 1.0, Blend::Normal, Some(mask), &wm, (rx, ry, rw, rh), &mut stats);
                    }
                    targets.push(li);
                }
                Cmd::Pop(e) => {
                    let en = &dl.effects[*e as usize];
                    let li = targets.pop().unwrap();
                    let wm = dl.world(en.transform);
                    let pad = (en.blur * 3.0).ceil();
                    let region = aabb_of(&wm, &en.bounds, pad, w, h);
                    let mut src = li;
                    if en.blur > 0.0 {
                        self.blur_passes(&mut enc, li, TA, TB, en.blur, region, &mut stats);
                        src = TB;
                    }
                    let parent_idx: Option<usize> = targets.last().copied();
                    if en.blend != Blend::Normal {
                        let parent: &wgpu::Texture = match parent_idx {
                            None => &self.root.tex,
                            Some(i) => &self.pool[i].tex,
                        };
                        enc.copy_texture_to_texture(
                            wgpu::TexelCopyTextureInfo { texture: parent, mip_level: 0, origin: wgpu::Origin3d { x: region.0, y: region.1, z: 0 }, aspect: wgpu::TextureAspect::All },
                            wgpu::TexelCopyTextureInfo { texture: &self.pool[DST].tex, mip_level: 0, origin: wgpu::Origin3d { x: region.0, y: region.1, z: 0 }, aspect: wgpu::TextureAspect::All },
                            wgpu::Extent3d { width: region.2, height: region.3, depth_or_array_layers: 1 },
                        );
                    }
                    let tgt = parent_idx.map(|i| i as isize).unwrap_or(-1);
                    self.fx_pass_to(&mut enc, src, DST, tgt, en.opacity, en.blend, en.mask, &wm, region, &mut stats);
                    next_layer -= 1;
                }
            }
        }
        self.last_stats = stats;
        enc
    }

    fn blur_passes(&self, enc: &mut wgpu::CommandEncoder, src: usize, ta: usize, tb: usize, sigma: f32, region: (u32, u32, u32, u32), stats: &mut Stats) {
        for (from, to, dir) in [(src, ta, [1.0f32, 0.0]), (ta, tb, [0.0f32, 1.0])] {
            let ub = self.gpu.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: None,
                contents: bytemuck::cast_slice(&[dir[0], dir[1], sigma, 0f32]),
                usage: wgpu::BufferUsages::UNIFORM,
            });
            let ubg = self.gpu.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: None,
                layout: &self.blur_u_bgl,
                entries: &[wgpu::BindGroupEntry { binding: 0, resource: ub.as_entire_binding() }],
            });
            let tbg = self.gpu.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: None,
                layout: &self.blur_t_bgl,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&self.pool[from].view) },
                    wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&self.sampler) },
                ],
            });
            let mut p = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("blur"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.pool[to].view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
                multiview_mask: None,
            });
            p.set_pipeline(&self.blur);
            p.set_scissor_rect(region.0, region.1, region.2, region.3);
            p.set_bind_group(0, &ubg, &[]);
            p.set_bind_group(1, &tbg, &[]);
            p.draw(0..3, 0..1);
            stats.passes += 1;
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn fx_pass(&self, enc: &mut wgpu::CommandEncoder, src: usize, dst: usize, target: usize, opacity: f32, blend: Blend, mask: Option<Mask>, wm: &Mat4, region: (u32, u32, u32, u32), stats: &mut Stats) {
        self.fx_pass_to(enc, src, dst, target as isize, opacity, blend, mask, wm, region, stats)
    }

    #[allow(clippy::too_many_arguments)]
    fn fx_pass_to(&self, enc: &mut wgpu::CommandEncoder, src: usize, dst: usize, target: isize, opacity: f32, blend: Blend, mask: Option<Mask>, wm: &Mat4, region: (u32, u32, u32, u32), stats: &mut Stats) {
        let inv = inv3(&homography(wm)).unwrap_or([1., 0., 0., 0., 1., 0., 0., 0., 1.]);
        let (mk, mr, mrect, mp) = match mask {
            None => (0u32, 0f32, [0f32; 4], [0f32; 4]),
            Some(Mask::RoundedRect { rect, radius }) => (1, radius, rect, [0.; 4]),
            Some(Mask::LinearAlpha { p0, p1 }) => (2, 0., [0.; 4], [p0[0], p0[1], p1[0], p1[1]]),
        };
        let bl = match blend {
            Blend::Normal => 0u32,
            Blend::Multiply => 1,
            Blend::Screen => 2,
            Blend::Overlay => 3,
            Blend::Difference => 4,
            Blend::Darken => 5,
            Blend::Lighten => 6,
        };
        let mut u: Vec<f32> = vec![self.w as f32, self.h as f32, opacity, f32::from_bits(bl), f32::from_bits(mk), mr, 0., 0.];
        u.extend_from_slice(&mrect);
        u.extend_from_slice(&mp);
        for r in 0..3 {
            u.extend_from_slice(&[inv[r * 3], inv[r * 3 + 1], inv[r * 3 + 2], 0.]);
        }
        let ub = self.gpu.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&u), usage: wgpu::BufferUsages::UNIFORM });
        let ubg = self.gpu.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &self.fx_u_bgl,
            entries: &[wgpu::BindGroupEntry { binding: 0, resource: ub.as_entire_binding() }],
        });
        let tbg = self.gpu.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &self.fx_t_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&self.pool[src].view) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&self.pool[dst].view) },
                wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(&self.sampler) },
            ],
        });
        let tview = if target < 0 { &self.root.view } else { &self.pool[target as usize].view };
        let mut p = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("fx"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: tview,
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Load, store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None,
            occlusion_query_set: None,
            timestamp_writes: None,
            multiview_mask: None,
        });
        p.set_pipeline(if blend == Blend::Normal { &self.fx_normal } else { &self.fx_blend });
        p.set_scissor_rect(region.0, region.1, region.2, region.3);
        p.set_bind_group(0, &ubg, &[]);
        p.set_bind_group(1, &tbg, &[]);
        p.draw(0..3, 0..1);
        stats.passes += 1;
    }

    pub fn render_to_rgba(&mut self, dl: &DisplayList, res: &Resources, rast: &mut dyn PathRasterizer) -> Vec<u8> {
        let enc = self.render(dl, res, rast);
        readback_rgba(&self.gpu.device, &self.gpu.queue, enc, &self.root.tex, self.w, self.h)
    }
}
