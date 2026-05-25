mod config;
mod local_http_api;
mod panel;
mod plugin_engine;
mod tray;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use serde::Serialize;
use tauri::{Emitter, Manager};
use tauri_plugin_aptabase::EventTracker;
use tauri_plugin_log::{Target, TargetKind};
use uuid::Uuid;

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const GLOBAL_SHORTCUT_STORE_KEY: &str = "globalShortcut";
const DAILY_ACTIVE_TRACKED_DAY_KEY: &str = "analytics.daily_active_day";
const DAILY_ACTIVE_EVENT_NAME: &str = "app_started";

fn today_utc_ymd() -> String {
    let date = time::OffsetDateTime::now_utc().date();
    format!(
        "{:04}-{:02}-{:02}",
        date.year(),
        date.month() as u8,
        date.day()
    )
}

fn should_track_daily_active(last_tracked_day: Option<&str>, today: &str) -> bool {
    match last_tracked_day {
        Some(day) => day != today,
        None => true,
    }
}

#[cfg(desktop)]
fn track_daily_active_if_needed(app_handle: &tauri::AppHandle) {
    use tauri_plugin_store::StoreExt;

    let today = today_utc_ymd();

    let store = match app_handle.store("settings.json") {
        Ok(store) => store,
        Err(error) => {
            log::warn!(
                "Failed to access settings store for daily analytics gate: {}",
                error
            );
            return;
        }
    };

    let last_tracked_day = store
        .get(DAILY_ACTIVE_TRACKED_DAY_KEY)
        .and_then(|value| value.as_str().map(|value| value.to_string()));

    if !should_track_daily_active(last_tracked_day.as_deref(), &today) {
        return;
    }

    if let Err(error) = app_handle.track_event(DAILY_ACTIVE_EVENT_NAME, None) {
        log::warn!("Failed to track daily analytics event: {}", error);
        return;
    }

    store.set(
        DAILY_ACTIVE_TRACKED_DAY_KEY,
        serde_json::Value::String(today),
    );
    if let Err(error) = store.save() {
        log::warn!("Failed to save daily analytics tracked day: {}", error);
    }
}

#[cfg(not(desktop))]
fn track_daily_active_if_needed(app_handle: &tauri::AppHandle) {
    let _ = app_handle.track_event(DAILY_ACTIVE_EVENT_NAME, None);
}

#[cfg(desktop)]
fn seconds_until_next_utc_day(now: time::OffsetDateTime) -> u64 {
    let now_time = now.time();
    let seconds_since_midnight = u64::from(now_time.hour()) * 60 * 60
        + u64::from(now_time.minute()) * 60
        + u64::from(now_time.second());
    let seconds_until_next_day = 86_400_u64.saturating_sub(seconds_since_midnight);
    if seconds_until_next_day == 0 {
        86_400
    } else {
        seconds_until_next_day
    }
}

#[cfg(desktop)]
fn spawn_daily_active_rollover_tracker(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            let sleep_for = std::time::Duration::from_secs(seconds_until_next_utc_day(
                time::OffsetDateTime::now_utc(),
            ));
            std::thread::sleep(sleep_for);
            track_daily_active_if_needed(&app_handle);
        }
    });
}

#[cfg(desktop)]
fn managed_shortcut_slot() -> &'static Mutex<Option<String>> {
    static SLOT: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// Shared shortcut handler that toggles the panel when the shortcut is pressed.
#[cfg(desktop)]
fn handle_global_shortcut(
    app: &tauri::AppHandle,
    event: tauri_plugin_global_shortcut::ShortcutEvent,
) {
    if event.state == ShortcutState::Pressed {
        log::debug!("Global shortcut triggered");
        panel::toggle_panel(app);
    }
}

pub struct AppState {
    pub plugins: Vec<plugin_engine::manifest::LoadedPlugin>,
    pub app_data_dir: PathBuf,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    pub icon_url: String,
    pub brand_color: Option<String>,
    pub lines: Vec<ManifestLineDto>,
    pub links: Vec<PluginLinkDto>,
    /// Ordered list of primary metric candidates (sorted by primaryOrder).
    /// Frontend picks the first one that exists in runtime data.
    pub primary_candidates: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestLineDto {
    #[serde(rename = "type")]
    pub line_type: String,
    pub label: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLinkDto {
    pub label: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeBatchStarted {
    pub batch_id: String,
    pub plugin_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub batch_id: String,
    pub output: plugin_engine::runtime::PluginOutput,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeBatchComplete {
    pub batch_id: String,
}

#[tauri::command]
fn init_panel(app_handle: tauri::AppHandle) {
    panel::init(&app_handle).expect("Failed to initialize panel");
}

#[tauri::command]
fn hide_panel(app_handle: tauri::AppHandle) {
    panel::hide_panel(&app_handle);
}

#[tauri::command]
fn quit_app(app_handle: tauri::AppHandle) {
    log::info!("quit requested via app panel");
    app_handle.exit(0);
}

#[tauri::command]
fn open_devtools(#[allow(unused)] app_handle: tauri::AppHandle) {
    #[cfg(debug_assertions)]
    {
        use tauri::Manager;
        if let Some(window) = app_handle.get_webview_window("main") {
            window.open_devtools();
        }
    }
}

#[tauri::command]
async fn start_probe_batch(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    batch_id: Option<String>,
    plugin_ids: Option<Vec<String>>,
) -> Result<ProbeBatchStarted, String> {
    let batch_id = batch_id
        .and_then(|id| {
            let trimmed = id.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let (plugins, app_data_dir, app_version) = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        (
            locked.plugins.clone(),
            locked.app_data_dir.clone(),
            locked.app_version.clone(),
        )
    };

    let selected_plugins = match plugin_ids {
        Some(ids) => {
            let mut by_id: HashMap<String, plugin_engine::manifest::LoadedPlugin> = plugins
                .into_iter()
                .map(|plugin| (plugin.manifest.id.clone(), plugin))
                .collect();
            let mut seen = HashSet::new();
            ids.into_iter()
                .filter_map(|id| {
                    if !seen.insert(id.clone()) {
                        return None;
                    }
                    by_id.remove(&id)
                })
                .collect()
        }
        None => plugins,
    };

    let response_plugin_ids: Vec<String> = selected_plugins
        .iter()
        .map(|plugin| plugin.manifest.id.clone())
        .collect();

    log::info!(
        "probe batch {} starting: {:?}",
        batch_id,
        response_plugin_ids
    );

    if selected_plugins.is_empty() {
        let _ = app_handle.emit(
            "probe:batch-complete",
            ProbeBatchComplete {
                batch_id: batch_id.clone(),
            },
        );
        return Ok(ProbeBatchStarted {
            batch_id,
            plugin_ids: response_plugin_ids,
        });
    }

    let remaining = Arc::new(AtomicUsize::new(selected_plugins.len()));
    for plugin in selected_plugins {
        let handle = app_handle.clone();
        let completion_handle = app_handle.clone();
        let bid = batch_id.clone();
        let completion_bid = batch_id.clone();
        let data_dir = app_data_dir.clone();
        let version = app_version.clone();
        let counter = Arc::clone(&remaining);

        tauri::async_runtime::spawn_blocking(move || {
            let plugin_id = plugin.manifest.id.clone();
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                plugin_engine::runtime::run_probe(&plugin, &data_dir, &version)
            }));

            match result {
                Ok(output) => {
                    let has_error = output.lines.iter().any(|line| {
                        matches!(line, plugin_engine::runtime::MetricLine::Badge { label, .. } if label == "Error")
                    });
                    if has_error {
                        log::warn!("probe {} completed with error", plugin_id);
                    } else {
                        log::info!(
                            "probe {} completed ok ({} lines)",
                            plugin_id,
                            output.lines.len()
                        );
                        local_http_api::cache_successful_output(&output);
                    }
                    let _ = handle.emit(
                        "probe:result",
                        ProbeResult {
                            batch_id: bid,
                            output,
                        },
                    );
                }
                Err(_) => {
                    log::error!("probe {} panicked", plugin_id);
                }
            }

            if counter.fetch_sub(1, Ordering::SeqCst) == 1 {
                log::info!("probe batch {} complete", completion_bid);
                let _ = completion_handle.emit(
                    "probe:batch-complete",
                    ProbeBatchComplete {
                        batch_id: completion_bid,
                    },
                );
            }
        });
    }

    Ok(ProbeBatchStarted {
        batch_id,
        plugin_ids: response_plugin_ids,
    })
}

#[tauri::command]
fn write_plugin_config(
    app_handle: tauri::AppHandle,
    plugin_id: String,
    config_json: String,
) -> Result<(), String> {
    if plugin_id.contains('/') || plugin_id.contains('\\') || plugin_id.contains('.') {
        return Err(format!("invalid plugin_id: {}", plugin_id));
    }
    serde_json::from_str::<serde_json::Value>(&config_json)
        .map_err(|e| format!("config_json is not valid JSON: {}", e))?;
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let config_dir = app_data_dir.join("plugins_data").join(&plugin_id);
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_file = config_dir.join("config.json");
    std::fs::write(&config_file, config_json.as_bytes()).map_err(|e| e.to_string())?;
    log::info!("wrote plugin config for {}", plugin_id);
    Ok(())
}

#[tauri::command]
fn read_plugin_config(
    app_handle: tauri::AppHandle,
    plugin_id: String,
) -> Result<Option<String>, String> {
    if plugin_id.contains('/') || plugin_id.contains('\\') || plugin_id.contains('.') {
        return Err(format!("invalid plugin_id: {}", plugin_id));
    }
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let config_file = app_data_dir
        .join("plugins_data")
        .join(&plugin_id)
        .join("config.json");
    if !config_file.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&config_file).map_err(|e| e.to_string())?;
    Ok(Some(content))
}

fn normalize_gh_account(value: &str) -> Option<String> {
    let trimmed = value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim()
        .to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn push_unique_gh_account(accounts: &mut Vec<String>, value: &str) {
    if let Some(account) = normalize_gh_account(value) {
        if !accounts.iter().any(|existing| existing == &account) {
            accounts.push(account);
        }
    }
}

fn parse_gh_hosts_accounts(text: &str) -> Vec<String> {
    let mut accounts = Vec::new();
    let mut phase = 0_u8;
    let mut users_indent = 0_usize;
    let mut username_indent: Option<usize> = None;

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let indent = line
            .chars()
            .take_while(|ch| *ch == ' ' || *ch == '\t')
            .count();

        if phase == 0 {
            if trimmed == "github.com:" {
                phase = 1;
            }
        } else if phase == 1 {
            if indent == 0 {
                break;
            }
            if let Some(account) = trimmed.strip_prefix("user:") {
                push_unique_gh_account(&mut accounts, account);
            }
            if trimmed == "users:" {
                users_indent = indent;
                phase = 2;
            }
        } else {
            if indent <= users_indent {
                if let Some(account) = trimmed.strip_prefix("user:") {
                    push_unique_gh_account(&mut accounts, account);
                }
                break;
            }
            if username_indent.is_none() {
                username_indent = Some(indent);
            }
            if Some(indent) == username_indent && trimmed.ends_with(':') {
                push_unique_gh_account(&mut accounts, &trimmed[..trimmed.len() - 1]);
            } else if Some(indent) < username_indent {
                break;
            }
        }
    }

    accounts
}

fn gh_hosts_path() -> Option<PathBuf> {
    if let Some(config_dir) = std::env::var_os("GH_CONFIG_DIR") {
        if !config_dir.is_empty() {
            return Some(PathBuf::from(config_dir).join("hosts.yml"));
        }
    }
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .map(|home| home.join(".config").join("gh").join("hosts.yml"))
}

#[tauri::command]
fn list_github_accounts() -> Result<Vec<String>, String> {
    let Some(path) = gh_hosts_path() else {
        return Ok(Vec::new());
    };
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(parse_gh_hosts_accounts(&text))
}

#[tauri::command]
fn get_log_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let log_dir = app_handle
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    let log_file = log_dir.join(format!("{}.log", app_handle.package_info().name));
    Ok(log_file.to_string_lossy().to_string())
}

#[tauri::command]
fn update_tray_status_menu(
    app_handle: tauri::AppHandle,
    payload: tray::TrayStatusMenuPayload,
) -> Result<(), String> {
    tray::update_status_menu(&app_handle, payload)
}

#[tauri::command]
fn get_local_http_port() -> Option<u16> {
    local_http_api::get_port()
}

#[derive(serde::Serialize, Default)]
struct TokenBucket {
    input_tokens: u64,
    output_tokens: u64,
    cache_creation_tokens: u64,
    cache_read_tokens: u64,
}

#[derive(serde::Serialize)]
struct UsagePeriod {
    label: String,
    buckets: std::collections::HashMap<String, TokenBucket>,
}

#[derive(serde::Serialize)]
struct ClaudeUsageStats {
    daily: Vec<UsagePeriod>,
    weekly: Vec<UsagePeriod>,
    monthly: Vec<UsagePeriod>,
}

/// Returns daily/weekly/monthly token usage aggregated from ~/.claude/projects/ JSONL files.
/// Each period contains per-model token buckets.
#[tauri::command]
fn get_claude_usage_stats() -> Result<ClaudeUsageStats, String> {
    use std::collections::HashMap;
    use std::io::{BufRead, BufReader};

    let home = dirs::home_dir().ok_or("no home dir")?;
    let projects_dir = home.join(".claude").join("projects");

    // timestamp_ms → model → (input, output, cache_create, cache_read)
    struct Entry {
        ts_ms: i64,
        model: String,
        input: u64,
        output: u64,
        cache_create: u64,
        cache_read: u64,
    }

    let mut entries: Vec<Entry> = Vec::new();

    // Walk all .jsonl files under ~/.claude/projects/
    let Ok(dir_iter) = std::fs::read_dir(&projects_dir) else {
        return Ok(ClaudeUsageStats { daily: vec![], weekly: vec![], monthly: vec![] });
    };

    for project_entry in dir_iter.flatten() {
        let project_path = project_entry.path();
        if !project_path.is_dir() {
            continue;
        }
        let Ok(files) = std::fs::read_dir(&project_path) else { continue };
        for file_entry in files.flatten() {
            let path = file_entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let Ok(file) = std::fs::File::open(&path) else { continue };
            for line in BufReader::new(file).lines().map_while(Result::ok) {
                let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
                let ts_ms = val.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
                if ts_ms == 0 { continue; }
                let usage = val
                    .pointer("/message/usage")
                    .filter(|v| !v.is_null());
                let Some(usage) = usage else { continue };
                let model = val
                    .pointer("/message/model")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let input = usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
                let output = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
                let cache_create = usage.get("cache_creation_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
                let cache_read = usage.get("cache_read_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
                if input + output + cache_create + cache_read == 0 { continue; }
                entries.push(Entry { ts_ms, model, input, output, cache_create, cache_read });
            }
        }
    }

    // Helpers: convert ms timestamp to (year, month [1-12], day_of_year, iso_week)
    // We use simple integer math to avoid needing chrono.
    fn ms_to_ymd(ms: i64) -> (i32, u8, u8) {
        let secs = ms / 1000;
        let mut days = secs / 86400; // days since 1970-01-01
        let mut year = 1970i32;
        loop {
            let days_in_year = if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 { 366i64 } else { 365i64 };
            if days < days_in_year { break; }
            days -= days_in_year;
            year += 1;
        }
        let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
        let month_days: &[i64] = if leap {
            &[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        } else {
            &[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        };
        let mut month = 1u8;
        for &md in month_days {
            if days < md { break; }
            days -= md;
            month += 1;
        }
        (year, month, (days + 1) as u8)
    }

    fn ymd_to_label(y: i32, m: u8, d: u8) -> String {
        format!("{}-{:02}-{:02}", y, m, d)
    }

    fn ms_to_week_label(ms: i64) -> String {
        // ISO week: days_since_epoch / 7, label as "YYYY-Www"
        let secs = ms / 1000;
        let days = secs / 86400;
        // Jan 4 1970 is the start of ISO week 1 1970 (Thursday)
        // Simple approximation: use days/7 for bucket, label with year-week
        let week_num = ((days + 3) / 7) as i32; // offset so Monday-based
        let approx_year = 1970 + week_num / 53;
        let week_of_year = week_num % 53;
        format!("{}-W{:02}", approx_year, week_of_year.max(1))
    }

    fn ms_to_month_label(ms: i64) -> String {
        let (y, m, _) = ms_to_ymd(ms);
        format!("{}-{:02}", y, m)
    }

    // Aggregate into maps: label → model → TokenBucket
    let mut daily_map: HashMap<String, HashMap<String, TokenBucket>> = HashMap::new();
    let mut weekly_map: HashMap<String, HashMap<String, TokenBucket>> = HashMap::new();
    let mut monthly_map: HashMap<String, HashMap<String, TokenBucket>> = HashMap::new();

    // Only keep last 90 days of entries
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let cutoff_90d = now_ms - 90 * 86400 * 1000;

    for e in &entries {
        if e.ts_ms < cutoff_90d { continue; }
        let (y, m, d) = ms_to_ymd(e.ts_ms);
        let day_label = ymd_to_label(y, m, d);
        let week_label = ms_to_week_label(e.ts_ms);
        let month_label = ms_to_month_label(e.ts_ms);

        for (map, label) in [
            (&mut daily_map, day_label),
            (&mut weekly_map, week_label),
            (&mut monthly_map, month_label),
        ] {
            let bucket = map.entry(label).or_default().entry(e.model.clone()).or_default();
            bucket.input_tokens += e.input;
            bucket.output_tokens += e.output;
            bucket.cache_creation_tokens += e.cache_create;
            bucket.cache_read_tokens += e.cache_read;
        }
    }

    fn map_to_periods(map: HashMap<String, HashMap<String, TokenBucket>>) -> Vec<UsagePeriod> {
        let mut periods: Vec<UsagePeriod> = map.into_iter()
            .map(|(label, buckets)| UsagePeriod { label, buckets })
            .collect();
        periods.sort_by(|a, b| a.label.cmp(&b.label));
        periods
    }

    Ok(ClaudeUsageStats {
        daily: map_to_periods(daily_map),
        weekly: map_to_periods(weekly_map),
        monthly: map_to_periods(monthly_map),
    })
}

/// Update the global shortcut registration.
/// Pass `null` to disable the shortcut, or a shortcut string like "CommandOrControl+Shift+U".
#[cfg(desktop)]
#[tauri::command]
fn update_global_shortcut(
    app_handle: tauri::AppHandle,
    shortcut: Option<String>,
) -> Result<(), String> {
    let global_shortcut = app_handle.global_shortcut();
    let normalized_shortcut = shortcut.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    let mut managed_shortcut = managed_shortcut_slot()
        .lock()
        .map_err(|e| format!("failed to lock managed shortcut state: {}", e))?;

    if *managed_shortcut == normalized_shortcut {
        log::debug!("Global shortcut unchanged");
        return Ok(());
    }

    let previous_shortcut = managed_shortcut.clone();
    if let Some(existing) = previous_shortcut.as_deref() {
        match global_shortcut.unregister(existing) {
            Ok(()) => {
                // Keep in-memory state aligned with actual registration state.
                *managed_shortcut = None;
            }
            Err(e) => {
                log::warn!(
                    "Failed to unregister existing shortcut '{}': {}",
                    existing,
                    e
                );
            }
        }
    }

    if let Some(shortcut) = normalized_shortcut {
        log::info!("Registering global shortcut: {}", shortcut);
        global_shortcut
            .on_shortcut(shortcut.as_str(), |app, _shortcut, event| {
                handle_global_shortcut(app, event);
            })
            .map_err(|e| format!("Failed to register shortcut '{}': {}", shortcut, e))?;
        *managed_shortcut = Some(shortcut);
    } else {
        log::info!("Global shortcut disabled");
        *managed_shortcut = None;
    }

    Ok(())
}

#[tauri::command]
fn list_plugins(state: tauri::State<'_, Mutex<AppState>>) -> Vec<PluginMeta> {
    let plugins = {
        let locked = state.lock().expect("plugin state poisoned");
        locked.plugins.clone()
    };
    log::debug!("list_plugins: {} plugins", plugins.len());

    plugins
        .into_iter()
        .map(|plugin| {
            // Extract primary candidates: progress lines with primary_order, sorted by order
            let mut candidates: Vec<_> = plugin
                .manifest
                .lines
                .iter()
                .filter(|line| line.line_type == "progress" && line.primary_order.is_some())
                .collect();
            candidates.sort_by_key(|line| line.primary_order.unwrap());
            let primary_candidates: Vec<String> =
                candidates.iter().map(|line| line.label.clone()).collect();

            PluginMeta {
                id: plugin.manifest.id,
                name: plugin.manifest.name,
                icon_url: plugin.icon_data_url,
                brand_color: plugin.manifest.brand_color,
                lines: plugin
                    .manifest
                    .lines
                    .iter()
                    .map(|line| ManifestLineDto {
                        line_type: line.line_type.clone(),
                        label: line.label.clone(),
                        scope: line.scope.clone(),
                    })
                    .collect(),
                links: plugin
                    .manifest
                    .links
                    .iter()
                    .map(|link| PluginLinkDto {
                        label: link.label.clone(),
                        url: link.url.clone(),
                    })
                    .collect(),
                primary_candidates,
            }
        })
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
    let _guard = runtime.enter();

    tauri::Builder::default()
        .plugin(tauri_plugin_aptabase::Builder::new("A-US-6435241436").build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .max_file_size(10_000_000) // 10 MB
                .level(log::LevelFilter::Trace) // Allow all levels; runtime filter via tray menu
                .level_for("hyper", log::LevelFilter::Warn)
                .level_for("reqwest", log::LevelFilter::Warn)
                .level_for("tao", log::LevelFilter::Info)
                .level_for("tauri_plugin_updater", log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            init_panel,
            hide_panel,
            quit_app,
            open_devtools,
            start_probe_batch,
            list_plugins,
            get_log_path,
            update_global_shortcut,
            update_tray_status_menu,
            write_plugin_config,
            read_plugin_config,
            list_github_accounts,
            get_local_http_port,
            get_claude_usage_stats
        ])
        .setup(|app| {
            let version = app.package_info().version.to_string();
            log::info!("UsageLeft v{} starting", version);

            // Load config early (lazy init via OnceLock, zero-cost after)
            let _proxy = config::get_resolved_proxy();

            track_daily_active_if_needed(app.handle());
            #[cfg(desktop)]
            spawn_daily_active_rollover_tracker(app.handle().clone());

            let app_data_dir = app.path().app_data_dir().expect("no app data dir");
            let resource_dir = app.path().resource_dir().expect("no resource dir");
            let app_data_dir_tail = app_data_dir
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown");
            let redacted_app_data_dir =
                plugin_engine::host_api::redact_log_message(&app_data_dir.display().to_string());
            log::debug!(
                "app_data_dir: tail={}, path={}",
                app_data_dir_tail,
                redacted_app_data_dir
            );

            let (_, plugins) = plugin_engine::initialize_plugins(&app_data_dir, &resource_dir);
            let known_plugin_ids: Vec<String> =
                plugins.iter().map(|p| p.manifest.id.clone()).collect();
            app.manage(Mutex::new(AppState {
                plugins,
                app_data_dir: app_data_dir.clone(),
                app_version: app.package_info().version.to_string(),
            }));

            local_http_api::init(&app_data_dir, known_plugin_ids);
            local_http_api::start_server();

            tray::create(app.handle())?;

            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            // Register global shortcut from stored settings
            #[cfg(desktop)]
            {
                use tauri_plugin_store::StoreExt;

                if let Ok(store) = app.handle().store("settings.json") {
                    if let Some(shortcut_value) = store.get(GLOBAL_SHORTCUT_STORE_KEY) {
                        if let Some(shortcut) = shortcut_value.as_str() {
                            let shortcut = shortcut.trim();
                            if !shortcut.is_empty() {
                                let handle = app.handle().clone();
                                log::info!("Registering initial global shortcut: {}", shortcut);
                                if let Err(e) = handle.global_shortcut().on_shortcut(
                                    shortcut,
                                    |app, _shortcut, event| {
                                        handle_global_shortcut(app, event);
                                    },
                                ) {
                                    log::warn!("Failed to register initial global shortcut: {}", e);
                                } else if let Ok(mut managed_shortcut) =
                                    managed_shortcut_slot().lock()
                                {
                                    *managed_shortcut = Some(shortcut.to_string());
                                } else {
                                    log::warn!("Failed to store managed shortcut in memory");
                                }
                            }
                        }
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, _| {});
}

#[cfg(test)]
mod tests {
    use super::{
        DAILY_ACTIVE_TRACKED_DAY_KEY, parse_gh_hosts_accounts, seconds_until_next_utc_day,
        should_track_daily_active,
    };
    use time::{Date, Month, PrimitiveDateTime, Time};

    #[test]
    fn should_track_when_no_previous_day() {
        assert!(should_track_daily_active(None, "2026-02-12"));
    }

    #[test]
    fn should_not_track_when_same_day() {
        assert!(!should_track_daily_active(Some("2026-02-12"), "2026-02-12"));
    }

    #[test]
    fn should_track_when_day_changes() {
        assert!(should_track_daily_active(Some("2026-02-11"), "2026-02-12"));
    }

    #[test]
    fn daily_active_key_is_not_version_scoped() {
        assert_eq!(DAILY_ACTIVE_TRACKED_DAY_KEY, "analytics.daily_active_day");
        assert!(!DAILY_ACTIVE_TRACKED_DAY_KEY.contains("0.6.2"));
        assert!(!DAILY_ACTIVE_TRACKED_DAY_KEY.contains("0.6.3"));
    }

    #[test]
    fn rollover_sleep_waits_for_next_utc_day_boundary() {
        let now = PrimitiveDateTime::new(
            Date::from_calendar_date(2026, Month::February, 12).unwrap(),
            Time::from_hms(23, 59, 50).unwrap(),
        )
        .assume_utc();

        assert_eq!(seconds_until_next_utc_day(now), 10);
    }

    #[test]
    fn parses_multiple_github_cli_accounts() {
        let hosts = r#"
github.com:
    git_protocol: https
    users:
        user-a:
        user-b:
        user-a:
    user: user-b
other.example.com:
    users:
        ignored:
"#;

        assert_eq!(parse_gh_hosts_accounts(hosts), vec!["user-a", "user-b"]);
    }

    #[test]
    fn parses_legacy_github_cli_user() {
        let hosts = r#"
github.com:
    oauth_token: REDACTED
    user: legacy-user
"#;

        assert_eq!(parse_gh_hosts_accounts(hosts), vec!["legacy-user"]);
    }
}
