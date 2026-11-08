// PROTOTYPE separable gaussian blur pass (fragment only).
struct Blur { dir: vec2<f32>, sigma: f32, pad: f32 };
@group(0) @binding(0) var<uniform> bl: Blur;
@group(1) @binding(0) var src: texture_2d<f32>;
@group(1) @binding(1) var smp: sampler;
struct VOut { @builtin(position) pos: vec4<f32> };
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
    var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
    var o: VOut;
    o.pos = vec4<f32>(p[vi], 0.0, 1.0);
    return o;
}
@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(src));
    let uv = in.pos.xy / dims;
    let sigma = max(bl.sigma, 0.01);
    let stp = max(1.0, ceil(sigma * 3.0 / 16.0));
    let n = i32(min(ceil(sigma * 3.0 / stp), 16.0));
    var acc = vec4<f32>(0.0);
    var ws = 0.0;
    for (var i = -n; i <= n; i = i + 1) {
        let x = f32(i) * stp;
        let wgt = exp(-0.5 * x * x / (sigma * sigma));
        acc = acc + wgt * textureSampleLevel(src, smp, uv + bl.dir * x / dims, 0.0);
        ws = ws + wgt;
    }
    return acc / ws;
}
