fn main() {
    println!("cargo:rerun-if-env-changed=NEXT_PUBLIC_GIT_SHA");
    if let Ok(head) = std::env::var("NEXT_PUBLIC_GIT_SHA") {
        if !head.is_empty()
            && head.len() <= 120
            && head
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.'))
        {
            println!("cargo:rustc-env=HEMATURIA_PRODUCT_HEAD={head}");
        }
    }
    tauri_build::build()
}
