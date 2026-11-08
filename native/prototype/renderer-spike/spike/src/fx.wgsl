// PROTOTYPE effect-layer shaders: composite (opacity, mask, optional blend with a copy of the
// destination) and a separable gaussian blur pass. Fragment-only work, no compute.

struct Fx {
    size: vec2<f32>,
    opacity: f32,
    blend: u32,
    mask_kind: u32,
    mask_radius: f32,
    pad0: f32,
    pad1: f32,
    mask_rect: vec4<f32>,
    mask_p: vec4<f32>,
    h0: vec4<f32>,
    h1: vec4<f32>,
    h2: vec4<f32>,
};
@group(0) @binding(0) var<uniform> fx: Fx;
@group(1) @binding(0) var src: texture_2d<f32>;
@group(1) @binding(1) var dst: texture_2d<f32>;
@group(1) @binding(2) var smp: sampler;

struct VOut { @builtin(position) pos: vec4<f32> };

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
    var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
    var o: VOut;
    o.pos = vec4<f32>(p[vi], 0.0, 1.0);
    return o;
}

fn sd_rrect(p: vec2<f32>, r: vec4<f32>, rad: f32) -> f32 {
    let h = r.zw * 0.5;
    let c = r.xy + h;
    let rr = min(rad, min(h.x, h.y));
    let q = abs(p - c) - h + vec2<f32>(rr, rr);
    return length(max(q, vec2<f32>(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - rr;
}
fn cov(d: f32) -> f32 {
    let w = max(fwidth(d), 1e-4);
    return clamp(0.5 - d / w, 0.0, 1.0);
}

fn blend_fn(mode: u32, cb: vec3<f32>, cs: vec3<f32>) -> vec3<f32> {
    switch (mode) {
        case 1u: { return cb * cs; }
        case 2u: { return cb + cs - cb * cs; }
        case 3u: { // overlay = hardlight with swapped args
            let lo = 2.0 * cb * cs;
            let hi = 1.0 - 2.0 * (1.0 - cb) * (1.0 - cs);
            return select(hi, lo, cb <= vec3<f32>(0.5));
        }
        case 4u: { return abs(cb - cs); }
        case 5u: { return min(cb, cs); }
        case 6u: { return max(cb, cs); }
        default: { return cs; }
    }
}

@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
    let uv = in.pos.xy / fx.size;
    var s = textureSampleLevel(src, smp, uv, 0.0);
    let v = vec3<f32>(in.pos.xy, 1.0);
    let w = dot(fx.h2.xyz, v);
    let lp = vec2<f32>(dot(fx.h0.xyz, v), dot(fx.h1.xyz, v)) / select(w, 1e-6, abs(w) < 1e-9);
    let m_rr = cov(sd_rrect(lp, fx.mask_rect, fx.mask_radius));
    let d = fx.mask_p.zw - fx.mask_p.xy;
    let m_lin = 1.0 - clamp(dot(lp - fx.mask_p.xy, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
    var m = 1.0;
    if (fx.mask_kind == 1u) { m = m_rr; }
    if (fx.mask_kind == 2u) { m = m_lin; }
    s = s * (m * fx.opacity);
    if (fx.blend == 0u) {
        return s;
    }
    let b = textureSampleLevel(dst, smp, uv, 0.0);
    let ab = b.a;
    let as_ = s.a;
    var cs = vec3<f32>(0.0);
    var cb = vec3<f32>(0.0);
    if (as_ > 0.0) { cs = s.rgb / as_; }
    if (ab > 0.0) { cb = b.rgb / ab; }
    let bl = blend_fn(fx.blend, cb, cs);
    let rgb = (1.0 - ab) * s.rgb + (1.0 - as_) * b.rgb + as_ * ab * bl;
    return vec4<f32>(rgb, as_ + ab - as_ * ab);
}

