use std::sync::{Mutex, OnceLock};

use serde::Deserialize;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::path::BaseDirectory;
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;

use crate::panel::{show_panel, toggle_panel};

const LOG_LEVEL_STORE_KEY: &str = "logLevel";
const AGENT_MENU_PREFIX: &str = "agent__";
const MAX_AGENT_LABEL_CHARS: usize = 96;

type TrayMenu = Menu<tauri::Wry>;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayStatusMenuAgent {
    pub id: String,
    pub name: String,
    pub summary: String,
    pub detail: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayStatusMenuPayload {
    pub agents: Vec<TrayStatusMenuAgent>,
}

fn get_stored_log_level(app_handle: &AppHandle) -> log::LevelFilter {
    let store = match app_handle.store("settings.json") {
        Ok(s) => s,
        Err(_) => return log::LevelFilter::Error,
    };
    let value = store.get(LOG_LEVEL_STORE_KEY);
    let level_str = value.and_then(|v| v.as_str().map(|s| s.to_string()));
    match level_str.as_deref() {
        Some("error") => log::LevelFilter::Error,
        Some("warn") => log::LevelFilter::Warn,
        Some("info") => log::LevelFilter::Info,
        Some("debug") => log::LevelFilter::Debug,
        Some("trace") => log::LevelFilter::Trace,
        _ => log::LevelFilter::Error,
    }
}

fn tray_menu_slot() -> &'static Mutex<Option<TrayMenu>> {
    static SLOT: OnceLock<Mutex<Option<TrayMenu>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn truncate_label(label: &str) -> String {
    if label.chars().count() <= MAX_AGENT_LABEL_CHARS {
        return label.to_string();
    }

    let mut truncated = label
        .chars()
        .take(MAX_AGENT_LABEL_CHARS.saturating_sub(3))
        .collect::<String>();
    truncated.push_str("...");
    truncated
}

fn format_agent_label(agent: &TrayStatusMenuAgent) -> String {
    let name = agent.name.trim();
    let summary = agent.summary.trim();
    let detail = agent.detail.as_deref().unwrap_or("").trim();
    let status = agent.status.as_deref().unwrap_or("").trim();

    let label = if !status.is_empty() && !summary.is_empty() {
        format!("{}: {} - {}", name, status, summary)
    } else if !summary.is_empty() && !detail.is_empty() {
        format!("{}: {} | {}", name, summary, detail)
    } else if !summary.is_empty() {
        format!("{}: {}", name, summary)
    } else if !status.is_empty() {
        format!("{}: {}", name, status)
    } else {
        name.to_string()
    };

    truncate_label(&label)
}

fn clear_menu(menu: &TrayMenu) -> tauri::Result<()> {
    while !menu.items()?.is_empty() {
        let _ = menu.remove_at(0)?;
    }
    Ok(())
}

fn populate_status_menu(
    app_handle: &AppHandle,
    menu: &TrayMenu,
    payload: &TrayStatusMenuPayload,
) -> tauri::Result<()> {
    let show_stats =
        MenuItem::with_id(app_handle, "show_stats", "Show Dashboard", true, None::<&str>)?;
    menu.append(&show_stats)?;

    let refresh_all =
        MenuItem::with_id(app_handle, "refresh_all", "Refresh All", true, None::<&str>)?;
    menu.append(&refresh_all)?;
    menu.append(&PredefinedMenuItem::separator(app_handle)?)?;

    if payload.agents.is_empty() {
        let empty = MenuItem::with_id(
            app_handle,
            "no_enabled_agents",
            "No enabled agents",
            false,
            None::<&str>,
        )?;
        menu.append(&empty)?;
    } else {
        for agent in &payload.agents {
            let item_id = format!("{}{}", AGENT_MENU_PREFIX, agent.id);
            let item = MenuItem::with_id(
                app_handle,
                item_id,
                format_agent_label(agent),
                true,
                None::<&str>,
            )?;
            menu.append(&item)?;
        }
    }

    menu.append(&PredefinedMenuItem::separator(app_handle)?)?;

    let go_to_settings = MenuItem::with_id(
        app_handle,
        "go_to_settings",
        "Settings",
        true,
        None::<&str>,
    )?;
    menu.append(&go_to_settings)?;

    let about = MenuItem::with_id(app_handle, "about", "About OpenUsage", true, None::<&str>)?;
    menu.append(&about)?;

    let quit = MenuItem::with_id(app_handle, "quit", "Quit", true, None::<&str>)?;
    menu.append(&quit)?;

    Ok(())
}

fn build_status_menu(
    app_handle: &AppHandle,
    payload: &TrayStatusMenuPayload,
) -> tauri::Result<TrayMenu> {
    let menu = Menu::new(app_handle)?;
    populate_status_menu(app_handle, &menu, payload)?;
    Ok(menu)
}

pub fn update_status_menu(
    app_handle: &AppHandle,
    payload: TrayStatusMenuPayload,
) -> Result<(), String> {
    let mut locked_menu = tray_menu_slot()
        .lock()
        .map_err(|error| format!("failed to lock tray menu: {}", error))?;

    if let Some(menu) = locked_menu.as_ref() {
        clear_menu(menu).map_err(|error| error.to_string())?;
        populate_status_menu(app_handle, menu, &payload).map_err(|error| error.to_string())?;
        return Ok(());
    }

    let menu = build_status_menu(app_handle, &payload).map_err(|error| error.to_string())?;
    if let Some(tray) = app_handle.tray_by_id("tray") {
        tray.set_menu(Some(menu.clone()))
            .map_err(|error| error.to_string())?;
    }
    *locked_menu = Some(menu);
    Ok(())
}

pub fn create(app_handle: &AppHandle) -> tauri::Result<()> {
    let tray_icon_path = app_handle
        .path()
        .resolve("icons/tray-icon.png", BaseDirectory::Resource)?;
    let icon = Image::from_path(tray_icon_path)?;

    let current_level = get_stored_log_level(app_handle);
    log::set_max_level(current_level);

    let menu = build_status_menu(
        app_handle,
        &TrayStatusMenuPayload {
            agents: Vec::new(),
        },
    )?;
    if let Ok(mut locked_menu) = tray_menu_slot().lock() {
        *locked_menu = Some(menu.clone());
    } else {
        log::warn!("Failed to store tray menu handle");
    }

    TrayIconBuilder::with_id("tray")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("OpenUsage")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app_handle, event| {
            let event_id = event.id.as_ref();
            log::debug!("tray menu: {}", event_id);

            if let Some(plugin_id) = event_id.strip_prefix(AGENT_MENU_PREFIX) {
                show_panel(app_handle);
                let _ = app_handle.emit("tray:navigate", plugin_id);
                return;
            }

            match event_id {
                "show_stats" => {
                    show_panel(app_handle);
                    let _ = app_handle.emit("tray:navigate", "home");
                }
                "refresh_all" => {
                    let _ = app_handle.emit("tray:refresh-all", ());
                }
                "go_to_settings" => {
                    show_panel(app_handle);
                    let _ = app_handle.emit("tray:navigate", "settings");
                }
                "about" => {
                    show_panel(app_handle);
                    let _ = app_handle.emit("tray:show-about", ());
                }
                "quit" => {
                    log::info!("quit requested via tray");
                    app_handle.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(event, tauri::tray::TrayIconEvent::DoubleClick { .. }) {
                toggle_panel(tray.app_handle());
            }
        })
        .build(app_handle)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{TrayStatusMenuAgent, format_agent_label};

    #[test]
    fn formats_agent_usage_with_reset_detail() {
        let label = format_agent_label(&TrayStatusMenuAgent {
            id: "codex".to_string(),
            name: "Codex".to_string(),
            summary: "72% left".to_string(),
            detail: Some("Resets in 2h".to_string()),
            status: None,
        });

        assert_eq!(label, "Codex: 72% left | Resets in 2h");
    }

    #[test]
    fn formats_agent_error_status() {
        let label = format_agent_label(&TrayStatusMenuAgent {
            id: "codex".to_string(),
            name: "Codex".to_string(),
            summary: "Session expired".to_string(),
            detail: None,
            status: Some("Error".to_string()),
        });

        assert_eq!(label, "Codex: Error - Session expired");
    }
}
