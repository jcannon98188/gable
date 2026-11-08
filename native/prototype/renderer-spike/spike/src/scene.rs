//! PROTOTYPE scene builders: Taffy layout + Parley text -> Gable display list.
use crate::dl::*;
use crate::math::*;
use parley::{FontContext, FontFamily, LayoutContext, PositionedLayoutItem, StyleProperty};
use std::collections::HashMap;
use std::sync::Arc;
use taffy::prelude::*;

pub struct Builder {
    pub dl: DisplayList,
    pub res: Resources,
    fcx: FontContext,
    lcx: LayoutContext<()>,
    font_ids: HashMap<u64, u32>,
    pub families: String,
}

impl Builder {
    pub fn new(w: f32, h: f32, scale: f32) -> Self {
        let mut dl = DisplayList { size: [w, h], scale, ..Default::default() };
        dl.transforms.push(TransformNode { parent: None, matrix: {
            let mut m = IDENT;
            m[0] = scale;
            m[5] = scale;
            m
        } });
        dl.damage.push([0., 0., w, h]);
        Self { dl, res: Resources::default(), fcx: FontContext::new(), lcx: LayoutContext::new(), font_ids: HashMap::new(), families: "Arial, Roboto, sans-serif".into() }
    }
    pub fn transform(&mut self, parent: u32, matrix: Mat4) -> u32 {
        self.dl.transforms.push(TransformNode { parent: Some(parent), matrix });
        (self.dl.transforms.len() - 1) as u32
    }
    pub fn clip(&mut self, parent: Option<u32>, transform: u32, rect: [f32; 4], radius: f32) -> u32 {
        self.dl.clips.push(ClipNode { parent, transform, rect, radius });
        (self.dl.clips.len() - 1) as u32
    }
    #[allow(clippy::too_many_arguments)]
    pub fn effect(&mut self, parent: Option<u32>, transform: u32, bounds: [f32; 4], radius: f32, opacity: f32, blur: f32, backdrop_blur: f32, blend: Blend, mask: Option<Mask>) -> u32 {
        self.dl.effects.push(EffectNode { parent, transform, bounds, radius, opacity, blur, backdrop_blur, blend, mask });
        (self.dl.effects.len() - 1) as u32
    }
    pub fn rect(&mut self, t: u32, clip: Option<u32>, eff: Option<u32>, rect: [f32; 4], radius: f32, fill: Fill, border: Option<Border>) {
        self.dl.items.push(Item { kind: Kind::Rect { rect, radius, fill, border }, transform: t, clip, effect: eff });
    }
    pub fn solid(&mut self, t: u32, clip: Option<u32>, eff: Option<u32>, rect: [f32; 4], radius: f32, c: [f32; 4]) {
        self.rect(t, clip, eff, rect, radius, Fill::Solid(c), None);
    }
    pub fn hit(&mut self, name: &str, t: u32, clip: Option<u32>, bounds: [f32; 4]) {
        let node = self.dl.hit.len() as u32;
        self.dl.hit.push(HitEntry { node, name: name.into(), bounds, transform: t, clip });
    }
    pub fn image(&mut self, w: u32, h: u32, rgba: Vec<u8>) -> u32 {
        self.res.images.push(ImageRes { w, h, rgba: Arc::new(rgba) });
        (self.res.images.len() - 1) as u32
    }

    /// Shape `text` with Parley and push one glyph-run item per run; `y` is the first line baseline.
    /// Returns the laid out height.
    #[allow(clippy::too_many_arguments)]
    pub fn text(&mut self, t: u32, clip: Option<u32>, eff: Option<u32>, text: &str, size: f32, max_w: f32, x: f32, y: f32, color: [f32; 4]) -> f32 {
        let fam = self.families.clone();
        let mut b = self.lcx.ranged_builder(&mut self.fcx, text, 1.0, true);
        b.push_default(StyleProperty::FontSize(size));
        b.push_default(StyleProperty::FontFamily(FontFamily::Source(fam.into())));
        let mut layout = b.build(text);
        layout.break_all_lines(Some(max_w));
        let mut runs = vec![];
        for line in layout.lines() {
            for item in line.items() {
                if let PositionedLayoutItem::GlyphRun(gr) = item {
                    let font = gr.run().font();
                    let key = font.data.id();
                    let fid = *self.font_ids.entry(key).or_insert_with(|| {
                        self.res.fonts.push(FontRes { data: Arc::new(font.data.data().to_vec()), index: font.index });
                        (self.res.fonts.len() - 1) as u32
                    });
                    let glyphs: Vec<(u32, f32, f32)> = gr.positioned_glyphs().map(|g| (g.id, x + g.x, y + g.y)).collect();
                    runs.push((fid, gr.run().font_size(), glyphs));
                }
            }
        }
        let h = layout.height();
        let first_bl = layout.lines().next().map(|l| l.metrics().baseline).unwrap_or(0.0);
        for (fid, fs, glyphs) in runs {
            let glyphs: Vec<(u32, f32, f32)> = glyphs.into_iter().map(|(i, gx, gy)| (i, gx, gy - first_bl)).collect();
            self.dl.items.push(Item { kind: Kind::Glyphs { font: fid, size: fs, color, glyphs }, transform: t, clip, effect: eff });
        }
        h
    }
}

fn checker(w: u32, h: u32) -> Vec<u8> {
    let mut v = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let on = ((x / 8) + (y / 8)) % 2 == 0;
            let (r, g, b) = if on { (250, 190, 60) } else { (60, 90, 200) };
            let i = ((y * w + x) * 4) as usize;
            v[i] = r;
            v[i + 1] = (g as u32 * x / w.max(1)) as u8 + 40;
            v[i + 2] = b;
            v[i + 3] = 255;
        }
    }
    v
}

pub fn star_paths() -> Vec<PathFill> {
    let mut cmds = vec![];
    let (cx, cy, ro, ri) = (80.0f32, 80.0f32, 72.0f32, 30.0f32);
    for i in 0..10 {
        let a = (i as f32) * std::f32::consts::PI / 5.0 - std::f32::consts::FRAC_PI_2;
        let r = if i % 2 == 0 { ro } else { ri };
        let (x, y) = (cx + r * a.cos(), cy + r * a.sin());
        cmds.push(if i == 0 { PathCmd::M(x, y) } else { PathCmd::L(x, y) });
    }
    cmds.push(PathCmd::Z);
    let blob = vec![
        PathCmd::M(20., 110.),
        PathCmd::C(20., 60., 70., 70., 100., 110.),
        PathCmd::Q(130., 150., 90., 150.),
        PathCmd::C(60., 150., 40., 140., 20., 110.),
        PathCmd::Z,
    ];
    vec![PathFill { cmds, color: [0.95, 0.6, 0.1, 1.0] }, PathFill { cmds: blob, color: [0.1, 0.5, 0.9, 0.7] }]
}

fn lay(tree: &mut TaffyTree<()>, node: NodeId, ox: f32, oy: f32) -> [f32; 4] {
    let l = tree.layout(node).unwrap();
    [ox + l.location.x, oy + l.location.y, l.size.width, l.size.height]
}

/// The main demo scene: Taffy flex+grid layout, text, effects, 3D card with nested clips.
pub fn main_scene(scale: f32) -> Builder {
    let (w, h) = (1280.0f32, 720.0f32);
    let mut b = Builder::new(w, h, scale);
    let root_t = 0u32;

    // ---- Taffy layout ----
    let mut tree: TaffyTree<()> = TaffyTree::new();
    let chip = |tree: &mut TaffyTree<()>| tree.new_leaf(Style { size: Size { width: length(88.0), height: length(30.0) }, ..Default::default() }).unwrap();
    let chips: Vec<NodeId> = (0..3).map(|_| chip(&mut tree)).collect();
    let title = tree.new_leaf(Style { flex_grow: 1.0, ..Default::default() }).unwrap();
    let header = tree
        .new_with_children(
            Style { display: Display::Flex, size: Size { width: percent(1.0), height: length(64.0) }, align_items: Some(AlignItems::Center), gap: Size { width: length(12.0), height: length(0.0) }, padding: Rect { left: length(16.0), right: length(16.0), top: length(0.0), bottom: length(0.0) }, ..Default::default() },
            &[vec![title], chips.clone()].concat(),
        )
        .unwrap();
    // left column: paragraph card + tile grid card
    let para = tree.new_leaf(Style { size: Size { width: percent(1.0), height: length(210.0) }, ..Default::default() }).unwrap();
    let tiles: Vec<NodeId> = (0..6).map(|_| tree.new_leaf(Style::default()).unwrap()).collect();
    let tile_grid = tree
        .new_with_children(
            Style {
                display: Display::Grid,
                size: Size { width: percent(1.0), height: length(150.0) },
                grid_template_columns: vec![fr(1.0), fr(1.0), fr(1.0)],
                grid_template_rows: vec![fr(1.0), fr(1.0)],
                gap: Size { width: length(8.0), height: length(8.0) },
                ..Default::default()
            },
            &tiles,
        )
        .unwrap();
    let left = tree.new_with_children(Style { display: Display::Flex, flex_direction: FlexDirection::Column, size: Size { width: length(340.0), height: auto() }, gap: Size { width: length(0.0), height: length(14.0) }, ..Default::default() }, &[para, tile_grid]).unwrap();
    // middle stage: 3x2 grid of effect demo cells
    let cells: Vec<NodeId> = (0..6).map(|_| tree.new_leaf(Style::default()).unwrap()).collect();
    let stage = tree
        .new_with_children(
            Style {
                display: Display::Grid,
                flex_grow: 1.0,
                grid_template_columns: vec![fr(1.0), fr(1.0), fr(1.0)],
                grid_template_rows: vec![fr(1.0), fr(1.0)],
                gap: Size { width: length(12.0), height: length(12.0) },
                ..Default::default()
            },
            &cells,
        )
        .unwrap();
    let card3d = tree.new_leaf(Style { size: Size { width: length(300.0), height: length(420.0) }, ..Default::default() }).unwrap();
    let right = tree.new_with_children(Style { display: Display::Flex, justify_content: Some(JustifyContent::Center), align_items: Some(AlignItems::Center), size: Size { width: length(340.0), height: auto() }, ..Default::default() }, &[card3d]).unwrap();
    let body = tree.new_with_children(Style { display: Display::Flex, flex_grow: 1.0, gap: Size { width: length(16.0), height: length(0.0) }, ..Default::default() }, &[left, stage, right]).unwrap();
    let root = tree
        .new_with_children(
            Style { display: Display::Flex, flex_direction: FlexDirection::Column, size: Size { width: length(w), height: length(h) }, padding: Rect { left: length(20.0), right: length(20.0), top: length(16.0), bottom: length(20.0) }, gap: Size { width: length(0.0), height: length(14.0) }, ..Default::default() },
            &[header, body],
        )
        .unwrap();
    tree.compute_layout(root, Size { width: AvailableSpace::Definite(w), height: AvailableSpace::Definite(h) }).unwrap();

    let abs = |tree: &mut TaffyTree<()>, path: &[NodeId]| -> [f32; 4] {
        let (mut ox, mut oy) = (0.0, 0.0);
        for n in &path[..path.len() - 1] {
            let l = tree.layout(*n).unwrap();
            ox += l.location.x;
            oy += l.location.y;
        }
        lay(tree, *path.last().unwrap(), ox, oy)
    };

    // background
    b.rect(root_t, None, None, [0., 0., w, h], 0., Fill::Linear { p0: [0., 0.], p1: [w, h], c0: [0.10, 0.12, 0.20, 1.], c1: [0.20, 0.10, 0.30, 1.] }, None);

    // header
    let hr = abs(&mut tree, &[root, header]);
    b.solid(root_t, None, None, hr, 12., [1., 1., 1., 0.10]);
    let tr = abs(&mut tree, &[root, header, title]);
    b.text(root_t, None, None, "Gable Native: renderer spike", 26.0, 600.0, tr[0], tr[1] + 38.0 - 8.0, [1., 1., 1., 1.]);
    let labels = ["wgpu", "taffy", "parley"];
    for (i, c) in chips.iter().enumerate() {
        let r = abs(&mut tree, &[root, header, *c]);
        b.rect(root_t, None, None, r, 15., Fill::Solid([0.25, 0.5, 0.9, 0.9]), Some(Border { width: 1.5, color: [1., 1., 1., 0.8] }));
        b.text(root_t, None, None, labels[i], 14.0, 80.0, r[0] + 14.0, r[1] + 20.0, [1., 1., 1., 1.]);
    }

    // left: paragraph card
    let pr = abs(&mut tree, &[root, body, left, para]);
    b.rect(root_t, None, None, pr, 14., Fill::Solid([1., 1., 1., 0.92]), Some(Border { width: 1.0, color: [0.8, 0.8, 0.9, 1.] }));
    b.text(root_t, None, None, "Hamburgefonstiv 0123456789", 20.0, pr[2] - 28.0, pr[0] + 14.0, pr[1] + 34.0, [0.1, 0.1, 0.15, 1.]);
    b.text(root_t, None, None, "The quick brown fox jumps over the lazy dog. Text is shaped by Parley, rasterized once into a glyph atlas by vello_cpu from Skrifa outlines, and drawn as atlas quads by the owned compositor.", 14.0, pr[2] - 28.0, pr[0] + 14.0, pr[1] + 66.0, [0.15, 0.15, 0.2, 1.]);
    // tile grid
    let cols = [[0.9, 0.3, 0.3, 1.], [0.3, 0.8, 0.4, 1.], [0.3, 0.5, 0.95, 1.], [0.95, 0.8, 0.2, 1.], [0.7, 0.4, 0.9, 1.], [0.2, 0.8, 0.8, 1.]];
    for (i, t) in tiles.iter().enumerate() {
        let r = abs(&mut tree, &[root, body, left, tile_grid, *t]);
        b.rect(root_t, None, None, r, 10., Fill::Linear { p0: [r[0], r[1]], p1: [r[0] + r[2], r[1] + r[3]], c0: cols[i], c1: [cols[i][0] * 0.5, cols[i][1] * 0.5, cols[i][2] * 0.5, 1.] }, None);
        b.hit(&format!("tile-{i}"), root_t, None, r);
    }

    // middle stage: stripes + six effect cells
    let sr = abs(&mut tree, &[root, body, stage]);
    for i in 0..40 {
        let x = sr[0] + i as f32 * (sr[2] / 40.0);
        let c = if i % 2 == 0 { [0.95, 0.35, 0.3, 1.] } else { [0.2, 0.75, 0.9, 1.] };
        b.solid(root_t, None, None, [x, sr[1], sr[2] / 40.0 + 0.5, sr[3]], 0., c);
    }
    let cell = |tree: &mut TaffyTree<()>, i: usize| abs(tree, &[root, body, stage, cells[i]]);
    // 0: opacity group (two overlapping rects at 0.6)
    let c0 = cell(&mut tree, 0);
    let e = b.effect(None, root_t, c0, 0., 0.6, 0., 0., Blend::Normal, None);
    b.solid(root_t, None, Some(e), [c0[0] + 14., c0[1] + 14., 120., 90.], 12., [0.1, 0.2, 0.9, 1.]);
    b.solid(root_t, None, Some(e), [c0[0] + 70., c0[1] + 50., 120., 90.], 12., [0.9, 0.1, 0.2, 1.]);
    b.text(root_t, None, None, "opacity 0.6 group", 12.0, 160.0, c0[0] + 8., c0[1] + c0[3] - 8., [1., 1., 1., 1.]);
    // 1: multiply blend group
    let c1 = cell(&mut tree, 1);
    let e = b.effect(None, root_t, c1, 0., 1.0, 0., 0., Blend::Multiply, None);
    b.solid(root_t, None, Some(e), [c1[0] + 20., c1[1] + 20., 150., 110.], 55., [1.0, 0.9, 0.2, 1.]);
    b.text(root_t, None, None, "multiply blend", 12.0, 160.0, c1[0] + 8., c1[1] + c1[3] - 8., [1., 1., 1., 1.]);
    // 2: mask layers (linear alpha mask over a gradient + rounded-rect mask over an image)
    let c2 = cell(&mut tree, 2);
    let e = b.effect(None, root_t, c2, 0., 1.0, 0., 0., Blend::Normal, Some(Mask::LinearAlpha { p0: [c2[0], c2[1]], p1: [c2[0] + c2[2], c2[1]] }));
    b.rect(root_t, None, Some(e), [c2[0] + 10., c2[1] + 10., c2[2] - 20., 70.], 8., Fill::Linear { p0: [c2[0], c2[1]], p1: [c2[0] + c2[2], c2[1]], c0: [1., 1., 1., 1.], c1: [0.1, 0.1, 0.1, 1.] }, None);
    let img = b.image(64, 64, checker(64, 64));
    let e2 = b.effect(None, root_t, [c2[0] + 30., c2[1] + 84., 100., 60.], 0., 1.0, 0., 0., Blend::Normal, Some(Mask::RoundedRect { rect: [c2[0] + 30., c2[1] + 84., 100., 60.], radius: 24. }));
    b.dl.items.push(Item { kind: Kind::Image { rect: [c2[0] + 30., c2[1] + 84., 100., 60.], image: img, radius: 0. }, transform: root_t, clip: None, effect: Some(e2) });
    b.text(root_t, None, None, "mask layers", 12.0, 160.0, c2[0] + 8., c2[1] + c2[3] - 8., [1., 1., 1., 1.]);
    // 3: filter blur(4px) on text + shape
    let c3 = cell(&mut tree, 3);
    let e = b.effect(None, root_t, c3, 0., 1.0, 4.0, 0., Blend::Normal, None);
    b.solid(root_t, None, Some(e), [c3[0] + 20., c3[1] + 20., 100., 60.], 12., [1., 1., 1., 1.]);
    b.text(root_t, None, Some(e), "blurred", 28.0, 160.0, c3[0] + 24., c3[1] + 110., [1., 1., 1., 1.]);
    b.text(root_t, None, None, "filter: blur(4px)", 12.0, 160.0, c3[0] + 8., c3[1] + c3[3] - 8., [1., 1., 1., 1.]);
    // 4: backdrop blur panel over the stripes
    let c4 = cell(&mut tree, 4);
    let pb = [c4[0] + 14., c4[1] + 14., c4[2] - 28., c4[3] - 40.];
    let e = b.effect(None, root_t, pb, 16., 1.0, 0., 8.0, Blend::Normal, None);
    b.rect(root_t, None, Some(e), pb, 16., Fill::Solid([1., 1., 1., 0.25]), Some(Border { width: 1.0, color: [1., 1., 1., 0.6] }));
    b.text(root_t, None, Some(e), "backdrop-filter: blur(8px)", 13.0, pb[2] - 20., pb[0] + 10., pb[1] + 26., [1., 1., 1., 1.]);
    // 5: difference blend of an image-like gradient
    let c5 = cell(&mut tree, 5);
    let e = b.effect(None, root_t, c5, 0., 1.0, 0., 0., Blend::Difference, None);
    b.rect(root_t, None, Some(e), [c5[0] + 10., c5[1] + 10., c5[2] - 20., 100.], 10., Fill::Linear { p0: [c5[0], c5[1]], p1: [c5[0] + c5[2], c5[1]], c0: [1., 1., 1., 1.], c1: [0.2, 0.9, 0.4, 1.] }, None);
    b.text(root_t, None, None, "difference blend", 12.0, 160.0, c5[0] + 8., c5[1] + c5[3] - 8., [1., 1., 1., 1.]);

    // right: 3D card (perspective + rotateY/rotateX) with nested clips and path content
    let cr = abs(&mut tree, &[root, body, right, card3d]);
    let center = (cr[0] + cr[2] / 2., cr[1] + cr[3] / 2.);
    let m3d = about(center, &mul(&perspective(900.), &mul(&rotate_y(-28.), &rotate_x(10.))));
    let t3 = b.transform(root_t, m3d);
    b.rect(t3, None, None, cr, 18., Fill::Linear { p0: [cr[0], cr[1]], p1: [cr[0], cr[1] + cr[3]], c0: [0.98, 0.98, 1., 1.], c1: [0.82, 0.86, 0.98, 1.] }, Some(Border { width: 2.0, color: [0.3, 0.4, 0.8, 1.] }));
    b.hit("card3d", t3, None, cr);
    b.text(t3, None, None, "Perspective card", 20.0, cr[2] - 32., cr[0] + 16., cr[1] + 34., [0.1, 0.1, 0.2, 1.]);
    // path content (star/blob) via the rasterizer seam
    b.res.paths.push(star_paths());
    b.dl.items.push(Item { kind: Kind::Path { rect: [cr[0] + 16., cr[1] + 50., 160., 160.], path: 0 }, transform: t3, clip: None, effect: None });
    // scroller: outer rounded clip, inner clip nested
    let sc = [cr[0] + 16., cr[1] + 222., cr[2] - 32., 130.];
    let c_outer = b.clip(None, t3, sc, 18.);
    let c_inner = b.clip(Some(c_outer), t3, [sc[0] + 6., sc[1] + 6., sc[2] - 12., sc[3] - 12.], 12.);
    b.rect(t3, Some(c_outer), None, sc, 18., Fill::Solid([0.15, 0.17, 0.3, 1.]), None);
    for i in 0..6 {
        let r = [sc[0] + 10., sc[1] + 10. + i as f32 * 44. - 12., sc[2] - 20., 38.];
        let c = if i % 2 == 0 { [0.35, 0.55, 0.95, 1.] } else { [0.95, 0.55, 0.35, 1.] };
        b.rect(t3, Some(c_inner), None, r, 10., Fill::Solid(c), None);
        b.text(t3, Some(c_inner), None, &format!("List row {i}"), 14.0, 160.0, r[0] + 10., r[1] + 24., [1., 1., 1., 1.]);
        b.hit(&format!("row-{i}"), t3, Some(c_inner), r);
    }
    // a button sitting outside the scroller
    let btn = [cr[0] + 16., cr[1] + cr[3] - 50., 110., 34.];
    b.rect(t3, None, None, btn, 17., Fill::Solid([0.2, 0.7, 0.4, 1.]), None);
    b.text(t3, None, None, "Button", 14.0, 80.0, btn[0] + 28., btn[1] + 22., [1., 1., 1., 1.]);
    b.hit("button", t3, None, btn);
    b
}

/// Text-quality sheet for P1: black text on white, the same strings as the Chromium page.
pub const SHEET_STRINGS: &[(&str, f32)] = &[
    ("Hamburgefonstiv 0123456789", 12.0),
    ("Hamburgefonstiv 0123456789", 14.0),
    ("The quick brown fox jumps over the lazy dog", 16.0),
    ("The quick brown fox jumps over the lazy dog", 24.0),
    ("Sphinx of black quartz, judge my vow. gjpqy ,;:", 18.0),
];
pub fn text_sheet(scale: f32) -> Builder {
    let mut b = Builder::new(640., 240., scale);
    b.families = "Arial".into();
    b.solid(0, None, None, [0., 0., 640., 240.], 0., [1., 1., 1., 1.]);
    let mut y = 8.0;
    for (s, size) in SHEET_STRINGS {
        // Same line box as the HTML page: line-height 1.2, text top at y.
        let lh = size * 1.2;
        let _ = b.text(0, None, None, s, *size, 620., 10.0, y + 0.9465 * size, [0., 0., 0., 1.]);
        y += lh + 8.0;
    }
    b
}
