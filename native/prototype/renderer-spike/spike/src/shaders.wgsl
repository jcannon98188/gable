// PROTOTYPE shaders for the owned compositor. No storage buffers and no compute (GLES 3.0 friendly):
// per-instance data is fetched from an RGBA32F data texture with textureLoad.

struct G { size: vec2<f32>, pad: vec2<f32> };
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var data: texture_2d<f32>;
@group(1) @binding(0) var tex: texture_2d<f32>;
@group(1) @binding(1) var smp: sampler;

const STRIDE: u32 = 22u;
const DW: u32 = 2048u;

fn fetch(ii: u32, k: u32) -> vec4<f32> {
    let l = ii * STRIDE + k;
    return textureLoad(data, vec2<i32>(i32(l % DW), i32(l / DW)), 0);
}
fn mat_at(ii: u32, k: u32) -> mat4x4<f32> {
    return mat4x4<f32>(fetch(ii, k), fetch(ii, k + 1u), fetch(ii, k + 2u), fetch(ii, k + 3u));
}
// layout: 0..3 mat, 4..7 cm0, 8..11 cm1, 12 rect, 13 clip0, 14 clip1, 15 params, 16 params2,
// 17 c0, 18 c1, 19 border color, 20 uv, 21 grad

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

struct VOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) @interpolate(flat) idx: u32,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
    var cs = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0));
    let c = cs[vi];
    let r = fetch(ii, 12u);
    let m = 1.0;
    let lp = vec2<f32>(r.x - m + c.x * (r.z + 2.0 * m), r.y - m + c.y * (r.w + 2.0 * m));
    let p = mat_at(ii, 0u) * vec4<f32>(lp, 0.0, 1.0);
    var o: VOut;
    o.pos = vec4<f32>(2.0 * p.x / g.size.x - p.w, p.w - 2.0 * p.y / g.size.y, 0.0, p.w);
    o.local = lp;
    o.idx = ii;
    return o;
}

fn premul(c: vec4<f32>) -> vec4<f32> {
    return vec4<f32>(c.rgb * c.a, c.a);
}

@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
    let ii = in.idx;
    let rect = fetch(ii, 12u);
    let prm = fetch(ii, 15u);
    let prm2 = fetch(ii, 16u);
    let kind = u32(prm.z + 0.5);
    let rad = prm.x;
    let bw = prm.y;
    let cov_out = cov(sd_rrect(in.local, rect, rad));
    let cov_in = cov(sd_rrect(in.local, rect + vec4<f32>(bw, bw, -2.0 * bw, -2.0 * bw), max(rad - bw, 0.0)));
    let q0 = mat_at(ii, 4u) * vec4<f32>(in.local, 0.0, 1.0);
    let cl0 = cov(sd_rrect(q0.xy / q0.w, fetch(ii, 13u), prm.w));
    let q1 = mat_at(ii, 8u) * vec4<f32>(in.local, 0.0, 1.0);
    let cl1 = cov(sd_rrect(q1.xy / q1.w, fetch(ii, 14u), prm2.w));
    var clipc = 1.0;
    if (prm2.x > 0.5) { clipc = clipc * cl0; }
    if (prm2.y > 0.5) { clipc = clipc * cl1; }

    let c0 = fetch(ii, 17u);
    let c1 = fetch(ii, 18u);
    let bc = fetch(ii, 19u);
    let uvr = fetch(ii, 20u);
    let gr = fetch(ii, 21u);
    let t2 = (in.local - rect.xy) / rect.zw;
    let uv = mix(uvr.xy, uvr.zw, t2);
    let texel = textureSampleLevel(tex, smp, uv, 0.0);

    var res = vec4<f32>(0.0);
    if (kind == 0u) {
        var col = c0;
        if (prm2.z > 0.5) {
            let d = gr.zw - gr.xy;
            let t = clamp(dot(in.local - gr.xy, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
            col = mix(c0, c1, t);
        }
        let pf = premul(col);
        if (bw > 0.0) {
            res = pf * cov_in + premul(bc) * (cov_out - cov_in);
        } else {
            res = pf * cov_out;
        }
    } else if (kind == 1u) {
        let inside = select(0.0, 1.0, all(t2 >= vec2<f32>(0.0)) && all(t2 <= vec2<f32>(1.0)));
        res = premul(c0) * (texel.r * inside);
    } else {
        res = texel * cov_out;
    }
    return res * clipc;
}
