use tauri::{AppHandle, LogicalPosition, Manager, Position, Size};

fn monitor_contains_physical_point(
    origin_x: f64,
    origin_y: f64,
    width: f64,
    height: f64,
    point_x: f64,
    point_y: f64,
) -> bool {
    point_x >= origin_x
        && point_x < origin_x + width
        && point_y >= origin_y
        && point_y < origin_y + height
}

fn configured_window_size() -> (f64, f64) {
    let conf: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json"))
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

fn window_logical_size(window: &tauri::WebviewWindow) -> (f64, f64) {
    let (fallback_width, fallback_height) = configured_window_size();
    match (window.outer_size(), window.scale_factor()) {
        (Ok(size), Ok(scale)) if scale > 0.0 => (
            size.width as f64 / scale,
            size.height as f64 / scale,
        ),
        _ => (fallback_width, fallback_height),
    }
}

fn center_window(window: &tauri::WebviewWindow) {
    if let Err(error) = window.center() {
        log::warn!("Failed to center OpenUsage window: {}", error);
    }
}

fn position_panel_from_tray(app_handle: &AppHandle) {
    let Some(tray) = app_handle.tray_by_id("tray") else {
        if let Some(window) = app_handle.get_webview_window("main") {
            center_window(&window);
        }
        return;
    };

    match tray.rect() {
        Ok(Some(rect)) => {
            position_panel_at_tray_icon(app_handle, rect.position, rect.size);
        }
        Ok(None) => {
            if let Some(window) = app_handle.get_webview_window("main") {
                center_window(&window);
            }
        }
        Err(error) => {
            log::warn!("Failed to read tray rectangle: {}", error);
            if let Some(window) = app_handle.get_webview_window("main") {
                center_window(&window);
            }
        }
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
            log::warn!("Failed to hide OpenUsage window: {}", error);
        }
    }
}

pub fn show_panel(app_handle: &AppHandle) {
    let Some(window) = app_handle.get_webview_window("main") else {
        log::warn!("OpenUsage main window not found");
        return;
    };

    position_panel_from_tray(app_handle);

    if let Err(error) = window.show() {
        log::warn!("Failed to show OpenUsage window: {}", error);
        return;
    }
    if let Err(error) = window.unminimize() {
        log::warn!("Failed to unminimize OpenUsage window: {}", error);
    }
    if let Err(error) = window.set_focus() {
        log::warn!("Failed to focus OpenUsage window: {}", error);
    }
}

pub fn toggle_panel(app_handle: &AppHandle) {
    let Some(window) = app_handle.get_webview_window("main") else {
        log::warn!("OpenUsage main window not found");
        return;
    };

    match window.is_visible() {
        Ok(true) => hide_panel(app_handle),
        Ok(false) => show_panel(app_handle),
        Err(error) => {
            log::warn!("Failed to read OpenUsage window visibility: {}", error);
            show_panel(app_handle);
        }
    }
}

pub fn position_panel_at_tray_icon(
    app_handle: &tauri::AppHandle,
    icon_position: Position,
    icon_size: Size,
) {
    let Some(window) = app_handle.get_webview_window("main") else {
        return;
    };

    let (icon_phys_x, icon_phys_y) = match &icon_position {
        Position::Physical(pos) => (pos.x as f64, pos.y as f64),
        Position::Logical(pos) => (pos.x, pos.y),
    };
    let (icon_phys_w, icon_phys_h) = match &icon_size {
        Size::Physical(size) => (size.width as f64, size.height as f64),
        Size::Logical(size) => (size.width, size.height),
    };

    let monitors = match window.available_monitors() {
        Ok(monitors) => monitors,
        Err(error) => {
            log::warn!("Failed to get monitors: {}", error);
            center_window(&window);
            return;
        }
    };

    let icon_center_x = icon_phys_x + (icon_phys_w / 2.0);
    let icon_center_y = icon_phys_y + (icon_phys_h / 2.0);

    let found_monitor = monitors.iter().find(|monitor| {
        let origin = monitor.position();
        let size = monitor.size();
        monitor_contains_physical_point(
            origin.x as f64,
            origin.y as f64,
            size.width as f64,
            size.height as f64,
            icon_center_x,
            icon_center_y,
        )
    });

    let monitor = match found_monitor {
        Some(monitor) => monitor.clone(),
        None => {
            log::warn!(
                "No monitor found for tray rectangle center at ({:.0}, {:.0})",
                icon_center_x,
                icon_center_y
            );
            match window.primary_monitor() {
                Ok(Some(monitor)) => monitor,
                _ => {
                    center_window(&window);
                    return;
                }
            }
        }
    };

    let scale = monitor.scale_factor();
    if scale <= 0.0 {
        center_window(&window);
        return;
    }

    let monitor_phys_x = monitor.position().x as f64;
    let monitor_phys_y = monitor.position().y as f64;
    let monitor_logical_x = monitor_phys_x / scale;
    let monitor_logical_y = monitor_phys_y / scale;
    let monitor_logical_w = monitor.size().width as f64 / scale;
    let monitor_logical_h = monitor.size().height as f64 / scale;

    let icon_logical_x = monitor_logical_x + (icon_phys_x - monitor_phys_x) / scale;
    let icon_logical_y = monitor_logical_y + (icon_phys_y - monitor_phys_y) / scale;
    let icon_logical_w = icon_phys_w / scale;
    let icon_logical_h = icon_phys_h / scale;

    let (panel_width, panel_height) = window_logical_size(&window);
    let gap = 8.0;
    let min_x = monitor_logical_x + gap;
    let max_x = monitor_logical_x + monitor_logical_w - panel_width - gap;
    let icon_center_logical_x = icon_logical_x + (icon_logical_w / 2.0);
    let panel_x = if max_x >= min_x {
        (icon_center_logical_x - (panel_width / 2.0)).clamp(min_x, max_x)
    } else {
        monitor_logical_x + gap
    };

    let below_y = icon_logical_y + icon_logical_h + gap;
    let above_y = icon_logical_y - panel_height - gap;
    let monitor_bottom = monitor_logical_y + monitor_logical_h;
    let panel_y = if below_y + panel_height <= monitor_bottom {
        below_y
    } else {
        above_y.max(monitor_logical_y + gap)
    };

    if let Err(error) = window.set_position(Position::Logical(LogicalPosition::new(panel_x, panel_y))) {
        log::warn!("Failed to position OpenUsage window: {}", error);
        center_window(&window);
    }
}
