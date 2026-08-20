#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! PowerI desktop entry point.
//!
//! Kept intentionally thin: this file owns the Tauri builder/setup, the
//! app-level port/host settings (shared config), and module wiring. All
//! behaviour lives in the sibling modules:
//!
//! - `env_detection`  — Node/npm/fnm/nvm/PATH probing and version checks
//! - `process_manager` — pi-web child process spawn/kill/reuse + readiness
//! - `installer`       — npm install logic and npm result/error parsing
//! - `logger`          — PowerI log file writer
//! - `commands`        — Tauri command definitions (invoke entry points)

mod commands;
mod env_detection;
mod installer;
mod logger;
mod process_manager;

/// Serializes every test that mutates process environment variables
/// (`POWERI_WEB_PORT`, `POWERI_WEB_HOST`, `HOME`, `USERPROFILE`). Cargo runs
/// unit tests in parallel threads inside one binary, and the seam tests in
/// main.rs / env_detection.rs / commands.rs all read or write the same env
/// vars — without a single shared lock those tests would race each other.
/// `#[cfg(test)]` only: never compiled into the shipped binary.
#[cfg(test)]
pub(crate) static TEST_ENV_LOCK: Mutex<()> = Mutex::new(());

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::Value;
use tauri::Manager;

use crate::env_detection::home_dir;
use crate::logger::log_line;
use crate::process_manager::{kill_process_group, ServerState};

/// Default port that the pi-web server listens on.
/// dev builds use 9527 so local testing never collides with a production
/// pi-web already running on 30141 (and vice versa).
#[cfg(debug_assertions)]
const DEFAULT_PORT: u16 = 9527;
#[cfg(not(debug_assertions))]
const DEFAULT_PORT: u16 = 30141;

/// PowerI settings file (`~/.poweri/settings.json`), shared with the fixed
/// install dir (`~/.poweri/web`) and the log file.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn settings_path() -> Option<PathBuf> {
    home_dir().map(|h| h.join(".poweri").join("settings.json"))
}

/// Read the settings JSON as a `Value`; missing/unparsable file → `{}`.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn read_settings() -> Value {
    settings_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| Value::Object(Default::default()))
}

/// Persist the settings JSON to `~/.poweri/settings.json`.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn write_settings(v: &Value) -> Result<(), String> {
    let path = settings_path().ok_or_else(|| "SETTINGS_PATH: 无法确定主目录".to_string())?;
    let dir = path.parent().unwrap_or(Path::new("."));
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("SETTINGS_WRITE: 无法创建配置目录：{e}"))?;
    let text = serde_json::to_string_pretty(v).unwrap_or_else(|_| "{}".to_string());
    std::fs::write(&path, text).map_err(|e| format!("SETTINGS_WRITE: 无法写入配置：{e}"))
}

/// User-configured port from settings.json.
#[cfg(not(debug_assertions))]
fn settings_port() -> Option<u16> {
    read_settings()
        .get("port")
        .and_then(|p| p.as_u64())
        .and_then(|p| u16::try_from(p).ok())
}

/// Resolve the port pi-web should listen on.
/// Priority: POWERI_WEB_PORT env > settings.json > DEFAULT_PORT (cfg-split).
/// Debug builds ignore settings.json: the port is fixed by the repo's own
/// dev servers (scripts/dev-shell.mjs), so a stale test setting must never
/// redirect the readiness poll away from `next dev`.
fn resolve_port() -> u16 {
    if let Ok(p) = std::env::var("POWERI_WEB_PORT") {
        if let Ok(p) = p.parse() {
            return p;
        }
    }
    #[cfg(not(debug_assertions))]
    if let Some(p) = settings_port() {
        return p;
    }
    DEFAULT_PORT
}

/// Resolve the hostname pi-web should bind to ("127.0.0.1" = loopback-only,
/// "0.0.0.0" = LAN-accessible). Same priority chain as `resolve_port`.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn resolve_host() -> String {
    if let Ok(h) = std::env::var("POWERI_WEB_HOST") {
        if !h.trim().is_empty() {
            return h;
        }
    }
    #[cfg(not(debug_assertions))]
    if let Some(h) = read_settings().get("host").and_then(|h| h.as_str()) {
        if !h.trim().is_empty() {
            return h.to_string();
        }
    }
    "127.0.0.1".to_string()
}

fn url() -> String {
    format!("http://127.0.0.1:{}", resolve_port())
}

fn main() {
    log_line(&format!(
        "poweri starting (build {})",
        env!("CARGO_PKG_VERSION")
    ));
    tauri::Builder::default()
        .manage(ServerState {
            pid: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            crate::commands::start_server,
            crate::commands::stop_server,
            crate::commands::restart_server,
            crate::commands::server_status,
            crate::commands::upgrade_piweb,
            crate::commands::piweb_version,
            crate::commands::web_info,
            crate::commands::default_cwd,
            crate::commands::get_port,
            crate::commands::default_port,
            crate::commands::set_server_config,
            crate::commands::log_error,
            crate::commands::open_url
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                let state = app_handle.state::<ServerState>();
                let pid = {
                    let mut guard = state.pid.lock().unwrap();
                    guard.take()
                };
                if let Some(pid) = pid {
                    kill_process_group(pid);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_port_honors_env_override() {
        let _guard = crate::TEST_ENV_LOCK.lock().unwrap();
        let original = std::env::var("POWERI_WEB_PORT").ok();
        std::env::set_var("POWERI_WEB_PORT", "4321");
        assert_eq!(resolve_port(), 4321);
        match original {
            Some(v) => std::env::set_var("POWERI_WEB_PORT", v),
            None => std::env::remove_var("POWERI_WEB_PORT"),
        }
    }

    #[cfg(debug_assertions)]
    #[test]
    fn resolve_port_falls_back_to_default_without_env() {
        let _guard = crate::TEST_ENV_LOCK.lock().unwrap();
        let original = std::env::var("POWERI_WEB_PORT").ok();
        std::env::remove_var("POWERI_WEB_PORT");
        assert_eq!(resolve_port(), DEFAULT_PORT);
        match original {
            Some(v) => std::env::set_var("POWERI_WEB_PORT", v),
            None => std::env::remove_var("POWERI_WEB_PORT"),
        }
    }

    /// `resolve_host` reads `POWERI_WEB_HOST`; same priority chain as the
    /// port (env > settings.json > loopback default).
    #[test]
    fn resolve_host_honors_env_override() {
        let _guard = crate::TEST_ENV_LOCK.lock().unwrap();
        let original = std::env::var("POWERI_WEB_HOST").ok();
        std::env::set_var("POWERI_WEB_HOST", "0.0.0.0");
        assert_eq!(resolve_host(), "0.0.0.0");
        match original {
            Some(v) => std::env::set_var("POWERI_WEB_HOST", v),
            None => std::env::remove_var("POWERI_WEB_HOST"),
        }
    }

    /// Debug builds ignore settings.json (the dev servers own the host), so
    /// the loopback fallback is deterministic under `cargo test`. Release
    /// builds read settings.json and are not asserted here.
    #[cfg(debug_assertions)]
    #[test]
    fn resolve_host_falls_back_to_loopback_without_env() {
        let _guard = crate::TEST_ENV_LOCK.lock().unwrap();
        let original = std::env::var("POWERI_WEB_HOST").ok();
        std::env::remove_var("POWERI_WEB_HOST");
        assert_eq!(resolve_host(), "127.0.0.1");
        match original {
            Some(v) => std::env::set_var("POWERI_WEB_HOST", v),
            None => std::env::remove_var("POWERI_WEB_HOST"),
        }
    }
}
