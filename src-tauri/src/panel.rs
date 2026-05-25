use tauri::{AppHandle, Manager, Size};

fn configured_window_size() -> (f64, f64) {
    let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .expect("tauri.conf.json must be valid JSON");
    let window = &conf["app"]["windows"][0];
    (
        window["width"]
            .as_f64()
            .expect("window width must be set in tauri.conf.json"),
        window["height"]
            .as_f64()
            .expect("window height must be set in tauri.conf.json"),
    )
}

fn center_window(window: &tauri::WebviewWindow) {
    if let Err(error) = window.center() {
        log::warn!("Failed to center UsageLeft window: {}", error);
    }
}

pub fn init(app_handle: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.hide()?;
    }
    Ok(())
}

pub fn hide_panel(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(error) = window.hide() {
            log::warn!("Failed to hide UsageLeft window: {}", error);
        }
    }
}

pub fn show_panel(app_handle: &AppHandle) {
    let Some(window) = app_handle.get_webview_window("main") else {
        log::warn!("UsageLeft main window not found");
        return;
    };

    let (conf_w, conf_h) = configured_window_size();
    // Only resize if the window isn't already maximized
    if !window.is_maximized().unwrap_or(false) {
        if let Err(error) = window.set_size(Size::Logical(tauri::LogicalSize::new(conf_w, conf_h))) {
            log::warn!("Failed to resize UsageLeft window: {}", error);
        }
    }
    if let Err(e) = window.set_resizable(true) {
        log::warn!("Failed to enable window resize: {}", e);
    }
    if let Err(e) = window.set_maximizable(true) {
        log::warn!("Failed to enable window maximize: {}", e);
    }

    center_window(&window);

    if let Err(error) = window.show() {
        log::warn!("Failed to show UsageLeft window: {}", error);
        return;
    }
    if let Err(error) = window.unminimize() {
        log::warn!("Failed to unminimize UsageLeft window: {}", error);
    }
    if let Err(error) = window.set_focus() {
        log::warn!("Failed to focus UsageLeft window: {}", error);
    }
}

pub fn toggle_panel(app_handle: &AppHandle) {
    let Some(window) = app_handle.get_webview_window("main") else {
        log::warn!("UsageLeft main window not found");
        return;
    };

    match window.is_visible() {
        Ok(true) => hide_panel(app_handle),
        Ok(false) => show_panel(app_handle),
        Err(error) => {
            log::warn!("Failed to read UsageLeft window visibility: {}", error);
            show_panel(app_handle);
        }
    }
}
