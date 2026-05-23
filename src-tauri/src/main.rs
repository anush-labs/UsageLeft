// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
fn configure_linux_webkit() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // Set before Tauri/WebKit starts threads. Fixes GBM EGL startup crashes on some Ubuntu/NVIDIA sessions.
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    configure_linux_webkit();

    openusage_lib::run()
}
