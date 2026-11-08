//! PROTOTYPE display list following the TASK-99.21 decisions: a flat ordered item list that
//! references transform/scroll, clip and effect trees by id, plus a sibling hit-test tree.
//! Canonical serialization quantizes floats to 1/64.
use crate::math::*;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TransformNode {
    pub parent: Option<u32>,
    pub matrix: Mat4,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClipNode {
    pub parent: Option<u32>,
    pub transform: u32,
    pub rect: [f32; 4], // x,y,w,h in `transform` space
    pub radius: f32,
}
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum Blend {
    Normal,
    Multiply,
    Screen,
    Overlay,
    Difference,
    Darken,
    Lighten,
}
#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub enum Mask {
    /// Alpha mask of a rounded rect in the effect's transform space.
    RoundedRect { rect: [f32; 4], radius: f32 },
    /// Linear alpha ramp (alpha 1 at p0 -> 0 at p1) in the effect's transform space.
    LinearAlpha { p0: [f32; 2], p1: [f32; 2] },
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EffectNode {
    pub parent: Option<u32>,
    pub transform: u32,
    pub bounds: [f32; 4], // x,y,w,h in `transform` space (layer extent, backdrop region)
    pub radius: f32,      // corner radius of the backdrop region
    pub opacity: f32,
    pub blur: f32,          // filter: blur(px) std-dev
    pub backdrop_blur: f32, // backdrop-filter: blur(px) std-dev
    pub blend: Blend,
    pub mask: Option<Mask>,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum Fill {
    Solid([f32; 4]),
    Linear { p0: [f32; 2], p1: [f32; 2], c0: [f32; 4], c1: [f32; 4] },
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Border {
    pub width: f32,
    pub color: [f32; 4],
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum Kind {
    Rect { rect: [f32; 4], radius: f32, fill: Fill, border: Option<Border> },
    /// One shaped glyph run: font resource id, size, brush and (glyph id, x, y) in run space.
    Glyphs { font: u32, size: f32, color: [f32; 4], glyphs: Vec<(u32, f32, f32)> },
    Image { rect: [f32; 4], image: u32, radius: f32 },
    /// Vector content rasterized by the PathRasterizer seam into an image of rect size.
    Path { rect: [f32; 4], path: u32 },
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Item {
    pub kind: Kind,
    pub transform: u32,
    pub clip: Option<u32>,
    pub effect: Option<u32>,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HitEntry {
    pub node: u32,
    pub name: String,
    pub bounds: [f32; 4], // x,y,w,h in `transform` space
    pub transform: u32,
    pub clip: Option<u32>,
}
#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct DisplayList {
    pub size: [f32; 2],
    pub scale: f32,
    pub transforms: Vec<TransformNode>,
    pub clips: Vec<ClipNode>,
    pub effects: Vec<EffectNode>,
    pub items: Vec<Item>,
    pub hit: Vec<HitEntry>,
    pub damage: Vec<[f32; 4]>,
}

// ---- resources (not serialized: addressed by id + generation) ----
#[derive(Clone)]
pub struct FontRes {
    pub data: Arc<Vec<u8>>,
    pub index: u32,
}
#[derive(Clone)]
pub struct ImageRes {
    pub w: u32,
    pub h: u32,
    pub rgba: Arc<Vec<u8>>, // premultiplied
}
#[derive(Clone, Copy, Debug)]
pub enum PathCmd {
    M(f32, f32),
    L(f32, f32),
    Q(f32, f32, f32, f32),
    C(f32, f32, f32, f32, f32, f32),
    Z,
}
#[derive(Clone, Debug)]
pub struct PathFill {
    pub cmds: Vec<PathCmd>,
    pub color: [f32; 4],
}
#[derive(Clone, Default)]
pub struct Resources {
    pub fonts: Vec<FontRes>,
    pub images: Vec<ImageRes>,
    pub paths: Vec<Vec<PathFill>>,
}

impl DisplayList {
    pub fn world(&self, mut t: u32) -> Mat4 {
        let mut chain = vec![];
        loop {
            chain.push(t);
            match self.transforms[t as usize].parent {
                Some(p) => t = p,
                None => break,
            }
        }
        let mut m = IDENT;
        for &id in chain.iter().rev() {
            m = mul(&m, &self.transforms[id as usize].matrix);
        }
        m
    }

    pub fn canonical_json(&self) -> String {
        fn q(v: &mut serde_json::Value) {
            match v {
                serde_json::Value::Number(n) => {
                    if let Some(f) = n.as_f64() {
                        if !n.is_i64() && !n.is_u64() {
                            let r = (f * 64.0).round() / 64.0;
                            *v = serde_json::json!(r);
                        }
                    }
                }
                serde_json::Value::Array(a) => a.iter_mut().for_each(q),
                serde_json::Value::Object(o) => o.values_mut().for_each(q),
                _ => {}
            }
        }
        let mut v = serde_json::to_value(self).unwrap();
        q(&mut v);
        serde_json::to_string_pretty(&v).unwrap()
    }

    fn point_in_rrect(x: f32, y: f32, r: &[f32; 4], rad: f32) -> bool {
        if x < r[0] || y < r[1] || x > r[0] + r[2] || y > r[1] + r[3] {
            return false;
        }
        let rad = rad.min(r[2] / 2.).min(r[3] / 2.);
        let cx = x.clamp(r[0] + rad, r[0] + r[2] - rad);
        let cy = y.clamp(r[1] + rad, r[1] + r[3] - rad);
        let (dx, dy) = (x - cx, y - cy);
        dx * dx + dy * dy <= rad * rad + 1e-4
    }

    /// Hit test built from the same transform and clip trees as painting (decision on TASK-99.21):
    /// inverse homography of each entry's world matrix, then every clip on the chain.
    pub fn hit_test(&self, sx: f32, sy: f32) -> Option<&HitEntry> {
        for e in self.hit.iter().rev() {
            let Some(inv) = inv3(&homography(&self.world(e.transform))) else { continue };
            let Some((lx, ly)) = apply3(&inv, sx, sy) else { continue };
            if !Self::point_in_rrect(lx, ly, &e.bounds, 0.0) {
                continue;
            }
            let mut ok = true;
            let mut c = e.clip;
            while let Some(ci) = c {
                let cn = &self.clips[ci as usize];
                let Some(cinv) = inv3(&homography(&self.world(cn.transform))) else {
                    ok = false;
                    break;
                };
                match apply3(&cinv, sx, sy) {
                    Some((cx, cy)) if Self::point_in_rrect(cx, cy, &cn.rect, cn.radius) => {}
                    _ => {
                        ok = false;
                        break;
                    }
                }
                c = cn.parent;
            }
            if ok {
                return Some(e);
            }
        }
        None
    }
}
