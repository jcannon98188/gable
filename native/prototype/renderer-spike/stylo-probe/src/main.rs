fn main() {
    // Touch real Stylo code so the linker keeps it: resolve CSS property names via its generated tables.
    let mut n = 0;
    for name in ["color", "opacity", "transform", "backdrop-filter", "mix-blend-mode", "mask-image", "grid-template-columns", "display"] {
        if style::properties::PropertyId::parse_enabled_for_all_content(name).is_ok() { n += 1; }
    }
    println!("stylo resolved {n}/8 properties");
}
