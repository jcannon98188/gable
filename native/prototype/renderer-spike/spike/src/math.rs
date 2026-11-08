//! PROTOTYPE: tiny column-major 4x4 matrix helpers (m[col*4+row]).
pub type Mat4 = [f32; 16];

pub const IDENT: Mat4 = [1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1.];

pub fn mul(a: &Mat4, b: &Mat4) -> Mat4 {
    let mut o = [0f32; 16];
    for c in 0..4 {
        for r in 0..4 {
            let mut s = 0.;
            for k in 0..4 {
                s += a[k * 4 + r] * b[c * 4 + k];
            }
            o[c * 4 + r] = s;
        }
    }
    o
}
pub fn translate(x: f32, y: f32, z: f32) -> Mat4 {
    let mut m = IDENT;
    m[12] = x;
    m[13] = y;
    m[14] = z;
    m
}
pub fn rotate_y(deg: f32) -> Mat4 {
    let (s, c) = deg.to_radians().sin_cos();
    let mut m = IDENT;
    m[0] = c;
    m[2] = -s;
    m[8] = s;
    m[10] = c;
    m
}
pub fn rotate_x(deg: f32) -> Mat4 {
    let (s, c) = deg.to_radians().sin_cos();
    let mut m = IDENT;
    m[5] = c;
    m[6] = s;
    m[9] = -s;
    m[10] = c;
    m
}
pub fn rotate_z(deg: f32) -> Mat4 {
    let (s, c) = deg.to_radians().sin_cos();
    let mut m = IDENT;
    m[0] = c;
    m[1] = s;
    m[4] = -s;
    m[5] = c;
    m
}
/// CSS-style perspective(d): w = 1 - z/d.
pub fn perspective(d: f32) -> Mat4 {
    let mut m = IDENT;
    m[11] = -1.0 / d;
    m
}
/// transform about an origin: T(o) * M * T(-o)
pub fn about(origin: (f32, f32), m: &Mat4) -> Mat4 {
    mul(&mul(&translate(origin.0, origin.1, 0.), m), &translate(-origin.0, -origin.1, 0.))
}

pub fn inverse(m: &Mat4) -> Mat4 {
    let a = m;
    let mut inv = [0f32; 16];
    inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
    inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
    inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
    inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
    inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
    inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
    inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
    inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
    inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
    inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
    inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
    inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
    inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
    inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
    inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
    inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
    let det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
    if det.abs() < 1e-12 {
        return IDENT;
    }
    let id = 1.0 / det;
    for v in inv.iter_mut() {
        *v *= id;
    }
    inv
}

/// 3x3 homography (row-major h[row*3+col]) mapping plane-local (x,y,1) to screen (X,Y,W) for z=0.
pub fn homography(m: &Mat4) -> [f32; 9] {
    let g = |r: usize, c: usize| m[c * 4 + r];
    [g(0, 0), g(0, 1), g(0, 3), g(1, 0), g(1, 1), g(1, 3), g(3, 0), g(3, 1), g(3, 3)]
}
pub fn inv3(h: &[f32; 9]) -> Option<[f32; 9]> {
    let [a, b, c, d, e, f, g, hh, i] = *h;
    let det = a * (e * i - f * hh) - b * (d * i - f * g) + c * (d * hh - e * g);
    if det.abs() < 1e-12 {
        return None;
    }
    let id = 1.0 / det;
    Some([
        (e * i - f * hh) * id,
        (c * hh - b * i) * id,
        (b * f - c * e) * id,
        (f * g - d * i) * id,
        (a * i - c * g) * id,
        (c * d - a * f) * id,
        (d * hh - e * g) * id,
        (b * g - a * hh) * id,
        (a * e - b * d) * id,
    ])
}
pub fn apply3(h: &[f32; 9], x: f32, y: f32) -> Option<(f32, f32)> {
    let w = h[6] * x + h[7] * y + h[8];
    if w.abs() < 1e-9 {
        return None;
    }
    Some(((h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w))
}
/// Project a local point on z=0 through m to screen pixels.
pub fn project(m: &Mat4, x: f32, y: f32) -> Option<(f32, f32)> {
    apply3(&homography(m), x, y)
}
