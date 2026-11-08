//! Windowed host shared by desktop (`window` mode) and Android (`android_main`, GameActivity).
use crate::gpu::{Compositor, Gpu};
use crate::paths::VelloCpu;
use crate::scene;
use std::sync::Arc;
use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, EventLoop};
use winit::window::{Window, WindowAttributes, WindowId};

macro_rules! out {
    ($($t:tt)*) => {{
        let s = format!($($t)*);
        #[cfg(target_os = "android")]
        log::info!("{}", s);
        #[cfg(not(target_os = "android"))]
        println!("{}", s);
    }};
}

const BLIT: &str = r#"
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
struct U { rect: vec4<f32> }  // x,y,w,h in NDC-ish: (x0,y0,x1,y1) in clip space
@group(1) @binding(0) var<uniform> u: U;
struct VO { @builtin(position) p: vec4<f32>, @location(0) uv: vec2<f32> }
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
    // No local const array indexed by vertex_index: SwiftShader GLES 3.0 draws nothing for it (TASK-99.24).
    let q = vec2<f32>(select(0.0, 1.0, i == 1u || i == 4u || i == 5u), select(0.0, 1.0, i == 2u || i == 3u || i == 5u));
    var o: VO;
    let x = mix(u.rect.x, u.rect.z, q.x);
    let y = mix(u.rect.y, u.rect.w, q.y);
    o.p = vec4(x, y, 0.0, 1.0);
    o.uv = q;
    return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4<f32> { return vec4(textureSample(t, s, i.uv).rgb, 1.0); }
"#;

struct State {
    window: Arc<dyn Window>,
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    gpu: Arc<Gpu>,
    comp: Compositor,
    scene: scene::Builder,
    blit: wgpu::RenderPipeline,
    blit_bg: wgpu::BindGroup,
    blit_ubuf: wgpu::Buffer,
    blit_ubg: wgpu::BindGroup,
    rast: VelloCpu,
    times: Vec<f64>,
    frame: usize,
    done: bool,
}

pub struct App {
    instance: wgpu::Instance,
    state: Option<State>,
    bench_frames: usize,
    exit_when_done: bool,
}

impl App {
    fn new(bench_frames: usize, exit_when_done: bool) -> Self {
        #[cfg(target_os = "android")]
        if let Ok(b) = std::fs::read_to_string("/data/local/tmp/gable_backend") { std::env::set_var("WGPU_BACKEND", b.trim()); }
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle().with_env());
        Self { instance, state: None, bench_frames, exit_when_done }
    }
}

impl State {
    fn new(instance: &wgpu::Instance, el: &dyn ActiveEventLoop) -> Self {
        let window: Arc<dyn Window> = Arc::from(el.create_window(WindowAttributes::default().with_title("Gable Native renderer spike (PROTOTYPE)")).expect("window"));
        let surface = instance.create_surface(window.clone()).expect("surface");
        let gpu = Arc::new(pollster::block_on(crate::gpu::init_gpu(Some(&surface), instance)));
        let size = window.surface_size();
        out!(
            "SPIKE adapter={:?} type={:?} backend={:?} driver={:?} driver_info={:?} scale_factor={} surface={}x{}",
            gpu.info.name, gpu.info.device_type, gpu.info.backend, gpu.info.driver, gpu.info.driver_info, window.scale_factor(), size.width, size.height
        );
        let mut config = surface.get_default_config(&gpu.adapter, size.width.max(1), size.height.max(1)).expect("config");
        let caps = surface.get_capabilities(&gpu.adapter);
        out!("SPIKE surface formats={:?} present_modes={:?}", caps.formats, caps.present_modes);
        if let Some(f) = caps.formats.iter().copied().find(|f| !f.is_srgb()) { config.format = f; }
        config.present_mode = wgpu::PresentMode::Fifo;
        surface.configure(&gpu.device, &config);
        // Scene is authored at 1280x720 logical; render at a scale that fits the surface width.
        let s = (size.width as f32 / 1280.0).min(size.height as f32 / 720.0).max(0.25);
        let scene = scene::main_scene(s);
        let (w, h) = ((scene.dl.size[0] * s) as u32, (scene.dl.size[1] * s) as u32);
        let comp = Compositor::new(gpu.clone(), w, h, Some(config.format));
        out!("SPIKE scene_scale={s:.3} root={w}x{h}");
        let d = &gpu.device;
        let module = d.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("blit"), source: wgpu::ShaderSource::Wgsl(BLIT.into()) });
        let tex_bgl = d.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[
                wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }, count: None },
                wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
            ],
        });
        let u_bgl = d.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::VERTEX, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None }],
        });
        let pl = d.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: None, bind_group_layouts: &[Some(&tex_bgl), Some(&u_bgl)], immediate_size: 0 });
        let blit = d.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("blit"),
            layout: Some(&pl),
            vertex: wgpu::VertexState { module: &module, entry_point: Some("vs"), compilation_options: Default::default(), buffers: &[] },
            fragment: Some(wgpu::FragmentState { module: &module, entry_point: Some("fs"), compilation_options: Default::default(), targets: &[Some(config.format.into())] }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });
        let sampler = d.create_sampler(&wgpu::SamplerDescriptor { mag_filter: wgpu::FilterMode::Linear, min_filter: wgpu::FilterMode::Linear, ..Default::default() });
        let view = comp.root.tex.create_view(&Default::default());
        let blit_bg = d.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &tex_bgl,
            entries: &[wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&view) }, wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&sampler) }],
        });
        let blit_ubuf = d.create_buffer(&wgpu::BufferDescriptor { label: None, size: 16, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        let blit_ubg = d.create_bind_group(&wgpu::BindGroupDescriptor { label: None, layout: &u_bgl, entries: &[wgpu::BindGroupEntry { binding: 0, resource: blit_ubuf.as_entire_binding() }] });
        let mut st = State { window, surface, config, gpu, comp, scene, blit, blit_bg, blit_ubuf, blit_ubg, rast: VelloCpu, times: vec![], frame: 0, done: false };
        st.update_blit_rect();
        st
    }

    fn update_blit_rect(&mut self) {
        // letterbox the root into the surface, preserving aspect
        let (sw, sh) = (self.config.width as f32, self.config.height as f32);
        let (rw, rh) = (self.comp.w as f32, self.comp.h as f32);
        let k = (sw / rw).min(sh / rh);
        let (w, h) = (rw * k / sw, rh * k / sh);
        let r: [f32; 4] = [-w, h, w, -h]; // x0,y0(top),x1,y1(bottom) in clip space
        self.gpu.queue.write_buffer(&self.blit_ubuf, 0, bytemuck::cast_slice(&r));
    }

    fn resize(&mut self) {
        let s = self.window.surface_size();
        if s.width == 0 || s.height == 0 {
            return;
        }
        self.config.width = s.width;
        self.config.height = s.height;
        self.surface.configure(&self.gpu.device, &self.config);
        self.update_blit_rect();
    }

    /// One frame: build list (static here), composite, present. Returns false if surface was unavailable.
    fn draw(&mut self, bench_frames: usize) {
        let t0 = std::time::Instant::now();
        let enc = self.comp.render(&self.scene.dl, &self.scene.res, &mut self.rast);
        self.gpu.queue.submit([enc.finish()]);
        // Measure compositor GPU work alone (excludes present/vsync).
        self.gpu.device.poll(wgpu::PollType::wait_indefinitely()).ok();
        let comp_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let frame = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(f) | wgpu::CurrentSurfaceTexture::Suboptimal(f) => f,
            wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                self.resize();
                return;
            }
            _ => return,
        };
        let view = frame.texture.create_view(&Default::default());
        let mut enc = self.gpu.device.create_command_encoder(&Default::default());
        {
            let mut p = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: None,
                color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &view, depth_slice: None, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store } })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            p.set_pipeline(&self.blit);
            p.set_bind_group(0, &self.blit_bg, &[]);
            p.set_bind_group(1, &self.blit_ubg, &[]);
            p.draw(0..6, 0..1);
        }
        self.gpu.queue.submit([enc.finish()]);
        self.window.pre_present_notify();
        self.gpu.queue.present(frame);
        self.frame += 1;
        if self.frame > 10 && !self.done {
            self.times.push(comp_ms);
            if self.times.len() >= bench_frames {
                let mut t = self.times.clone();
                t.sort_by(|a, b| a.partial_cmp(b).unwrap());
                let avg = t.iter().sum::<f64>() / t.len() as f64;
                out!(
                    "SPIKE_BENCH compositor_only frames={} root={}x{} avg={:.2}ms p50={:.2} p95={:.2} p99={:.2} max={:.2}",
                    t.len(), self.comp.w, self.comp.h, avg, t[t.len() / 2], t[(t.len() as f64 * 0.95) as usize], t[(t.len() as f64 * 0.99) as usize], t[t.len() - 1]
                );
                self.done = true;
            }
        }
    }
}

impl ApplicationHandler for App {
    fn can_create_surfaces(&mut self, el: &dyn ActiveEventLoop) {
        let st = State::new(&self.instance, el);
        st.window.request_redraw();
        self.state = Some(st);
    }
    fn destroy_surfaces(&mut self, _el: &dyn ActiveEventLoop) {
        out!("SPIKE destroy_surfaces");
        self.state = None;
    }
    fn window_event(&mut self, el: &dyn ActiveEventLoop, _id: WindowId, ev: WindowEvent) {
        let Some(st) = self.state.as_mut() else { return };
        match ev {
            WindowEvent::CloseRequested => el.exit(),
            WindowEvent::SurfaceResized(_) => {
                st.resize();
                st.window.request_redraw();
            }
            WindowEvent::RedrawRequested => {
                st.draw(self.bench_frames);
                if st.done && self.exit_when_done {
                    el.exit();
                } else if !st.done {
                    st.window.request_redraw();
                }
            }
            _ => {}
        }
    }
}

pub fn run_desktop(bench_frames: usize) {
    let el = EventLoop::new().expect("event loop");
    el.run_app(App::new(bench_frames, true)).expect("run");
}

#[cfg(target_os = "android")]
#[no_mangle]
fn android_main(app: winit::platform::android::activity::AndroidApp) {
    use winit::platform::android::EventLoopBuilderExtAndroid;
    android_logger::init_once(android_logger::Config::default().with_max_level(log::LevelFilter::Info).with_tag("gable-spike"));
    std::panic::set_hook(Box::new(|i| log::error!("SPIKE PANIC {i}")));
    let mut b = EventLoop::builder();
    b.with_android_app(app);
    let el = b.build().expect("event loop");
    el.run_app(App::new(300, false)).expect("run");
}
