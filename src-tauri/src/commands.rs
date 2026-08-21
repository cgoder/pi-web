//! Tauri command definitions — the `invoke` entry points the frontend
//! calls. All commands are thin wrappers that delegate to the
//! process-manager / installer / env-detection / logger modules.
//!
//! The command functions must stay `pub(crate)`: `#[tauri::command]`
//! re-exports the generated `__cmd_*` wrappers with the same visibility,
//! and `tauri::generate_handler![crate::commands::...]` in main.rs
//! references them by path.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::env_detection::{home_dir, version_cmp};
use crate::logger::log_line;
use crate::process_manager::{
    is_port_open, kill_process_group, start_internal, status_of, web_source, web_version,
    ServerState, Status, WebSource,
};
use crate::{resolve_port, DEFAULT_PORT};

/// Hostnames accepted by the LAN switch in the settings drawer.
/// `localhost` is deliberately rejected: pi-web already binds loopback by
/// default, and the shell iframe always reaches the server via 127.0.0.1.
#[cfg_attr(debug_assertions, allow(dead_code))]
const VALID_HOSTS: [&str; 2] = ["127.0.0.1", "0.0.0.0"];

#[derive(Clone, serde::Serialize)]
pub(crate) struct UpgradeResult {
    ok: bool,
    version: String,
    restarted: bool,
    restart_failed: bool,
    message: String,
}

#[derive(Clone, serde::Serialize)]
pub(crate) struct WebInfo {
    source: &'static str,
    version: String,
    can_upgrade: bool,
}

/// Start (or reuse) the pi-web server. Must be `async` + `spawn_blocking`
/// because the start may run a 300 s npm install on first use; a
/// synchronous command would freeze the Tauri main thread (macOS WebView
/// beach-ball) and progress events could never render.
#[tauri::command]
pub(crate) async fn start_server(app: AppHandle) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || start_internal(&app))
        .await
        .map_err(|e| format!("SPAWN_FAILED: 后台启动任务失败：{e}"))?
}

#[tauri::command]
pub(crate) fn stop_server(app: AppHandle) -> Status {
    let state = app.state::<ServerState>();
    let pid = {
        let mut guard = state.pid.lock().unwrap();
        guard.take()
    };
    match pid {
        Some(pid) => {
            kill_process_group(pid);
            let _ = app.emit("server:stopped", ());
            status_of(false)
        }
        // Nothing we own: reflect whether the port is still up (reused server).
        None => status_of(is_port_open(resolve_port())),
    }
}

/// Restart the server: stop the owned process (if any), wait for the
/// port to free, then start again. Async for the same reason as
/// `start_server` — the restart may trigger a first-run download.
#[tauri::command]
pub(crate) async fn restart_server(app: AppHandle) -> Result<Status, String> {
    stop_server(app.clone());
    std::thread::sleep(Duration::from_millis(600));
    tauri::async_runtime::spawn_blocking(move || start_internal(&app))
        .await
        .map_err(|e| format!("SPAWN_FAILED: 后台重启任务失败：{e}"))?
}

/// Persist the port/hostname pair and restart the server on the new
/// config. The settings drawer's "保存并重启" maps to this single command
/// so port and hostname changes apply atomically. Debug builds reject
/// changes: `next dev` owns the port in dev mode.
#[tauri::command]
pub(crate) async fn set_server_config(app: AppHandle, port: u16, host: String) -> Result<Status, String> {
    #[cfg(debug_assertions)]
    {
        let _ = (app, port, host);
        Err("开发模式（npm run tauri dev）下端口由本地 dev 脚本固定，不可修改".to_string())
    }

    #[cfg(not(debug_assertions))]
    {
        if !(1024..=65535).contains(&port) {
            return Err(format!("端口 {port} 超出范围（1024-65535）"));
        }
        if !VALID_HOSTS.contains(&host.as_str()) {
            return Err(format!("主机名 {host} 不受支持"));
        }
        if port == resolve_port() && host == crate::resolve_host() {
            return Ok(status_of(true));
        }
        // The new port must be free before we commit the change, otherwise
        // the restart would spawn a server that dies with EADDRINUSE.
        if is_port_open(port) {
            return Err(format!("端口 {port} 已被其他程序占用"));
        }
        // Persist first so the restart spawns with the new config.
        let mut v = crate::read_settings();
        v["port"] = Value::from(port);
        v["host"] = Value::from(host.clone());
        crate::write_settings(&v)?;
        log_line(&format!("set_server_config: port={port} host={host}"));
        stop_server(app.clone());
        std::thread::sleep(Duration::from_millis(600));
        tauri::async_runtime::spawn_blocking(move || start_internal(&app))
            .await
            .map_err(|e| format!("SPAWN_FAILED: 后台重启任务失败：{e}"))?
    }
}

/// Report the pi-web edition this build runs: where it comes from, its
/// version, and whether the in-app upgrade button can manage it.
/// Upgradable when PowerI has a managed copy (`cached`) or when the running
/// pi-web is a system-wide install (`system`) — the upgrade installs the
/// latest `@poweri/poweri-web` into the managed dir so it wins on restart.
#[tauri::command]
pub(crate) fn web_info() -> WebInfo {
    let source = web_source();
    let version = web_version();
    log_line(&format!(
        "web_info: source={} version={version}",
        source.as_str()
    ));
    WebInfo {
        source: source.as_str(),
        can_upgrade: matches!(source, WebSource::Cached | WebSource::System),
        version,
    }
}

/// Upgrade pi-web to the latest published npm version: installs
/// `@poweri/poweri-web@latest` into the fixed install dir and restarts.
/// Works for the managed copy (`cached`) and for a system-wide install
/// (`system`); only a `POWERI_WEB_BIN` override is upgraded by the user
/// directly.
#[tauri::command]
#[cfg_attr(debug_assertions, allow(unused_variables))]
pub(crate) async fn upgrade_piweb(app: AppHandle) -> Result<UpgradeResult, String> {
    #[cfg(debug_assertions)]
    {
        Err(
            "开发模式（npm run tauri dev）下不可升级，请使用 npm run tauri build 构建后再试"
                .to_string(),
        )
    }

    #[cfg(not(debug_assertions))]
    {
        if web_source() == WebSource::Override {
            return Err(
                "当前使用自定义 PowerI 路径（POWERI_WEB_BIN），无法应用内升级".to_string(),
            );
        }
        // Run the upgrade under the precheck-chosen node so npm matches the
        // validated runtime (a stale system npm could fail on native deps).
        let (_, node) = crate::env_detection::check_node_requirement()?;
        let dir = crate::installer::install_dir();
        let prefix = dir.to_str().unwrap_or_default();
        let _ = app.emit(
            "server:stdout",
            format!("$ npm install --prefix {prefix} {}@latest", crate::installer::PACKAGE_NAME),
        );
        let mut upgrade_args: Vec<String> = vec![
            "install".to_string(),
            "--prefix".to_string(),
            prefix.to_string(),
        ];
        upgrade_args.extend(crate::installer::NPM_COMMON.iter().map(|s| s.to_string()));
        upgrade_args.push(format!("{}@latest", crate::installer::PACKAGE_NAME));
        match crate::installer::run_npm(&app, &node, &upgrade_args, crate::installer::INSTALL_TIMEOUT) {
            Ok(()) => {}
            Err(e) => {
                return Ok(UpgradeResult {
                    ok: false,
                    version: "unknown".to_string(),
                    restarted: false,
                    restart_failed: false,
                    message: format!("升级失败：{e}"),
                });
            }
        }
        log_line("upgrade: npm install @latest done");

        let version = web_version();
        let owns = app.state::<ServerState>().pid.lock().unwrap().is_some();
        let mut restarted = false;
        let mut restart_failed = false;
        let message;
        if owns {
            stop_server(app.clone());
            std::thread::sleep(Duration::from_millis(600));
            match start_internal(&app) {
                Ok(_) => {
                    restarted = true;
                    message = "升级完成，服务已用新版本重启".to_string();
                }
                Err(e) => {
                    restart_failed = true;
                    message = format!("升级成功，但重启失败：{e}，请手动点击重启");
                }
            }
        } else if is_port_open(crate::resolve_port()) {
            // 非本应用启动的服务还在运行（如浏览器里打开的 pi-web）：不打扰，
            // 已安装的新版本下次启动生效。
            message =
                "升级完成，已安装最新版（当前运行的服务非本应用启动，下次启动生效）".to_string();
        } else {
            // 服务未运行：升级完成后直接以新版本启动，避免用户手动再点一次启动。
            match start_internal(&app) {
                Ok(_) => {
                    restarted = true;
                    message = "升级完成，服务已用新版本启动".to_string();
                }
                Err(e) => {
                    restart_failed = true;
                    message = format!("升级成功，但启动失败：{e}，请手动点击启动");
                }
            }
        }

        Ok(UpgradeResult {
            ok: true,
            version,
            restarted,
            restart_failed,
            message,
        })
    }
}

/// Version of the pi-web this build will actually run (local read of the
/// resolved package, no network). Falls back to "unknown".
#[tauri::command]
pub(crate) fn piweb_version() -> String {
    web_version()
}

/// Resolve the working directory the shell should open pi-web with on a
/// fresh launch. Priority:
/// 1. The cwd of the most recently modified session under
///    `~/.pi/agent/sessions/` (covers the "system already has pi state"
///    case — the app must not start empty just because no `~/pi-cwd-*`
///    directory exists yet).
/// 2. The newest `~/pi-cwd-YYYYMMDD` directory (a previous pi-web run).
/// 3. A freshly created `~/pi-cwd-<today>` directory, mirroring pi-web's
///    own `/api/default-cwd` endpoint.
/// The path is passed to the frontend as `?cwd=` on the iframe URL; pi-web
/// validates it and builds its session tree around it.
#[tauri::command]
pub(crate) fn default_cwd() -> String {
    let Some(home) = home_dir() else {
        return String::new();
    };

    // 1. Newest session cwd under ~/.pi/agent/sessions/<encoded>/<file>.jsonl.
    if let Some(cwd) = latest_session_cwd(&home.join(".pi").join("agent").join("sessions")) {
        log_line(&format!("default_cwd: latest session cwd {cwd}"));
        return cwd;
    }

    // 2. Newest existing ~/pi-cwd-YYYYMMDD.
    if let Ok(entries) = std::fs::read_dir(&home) {
        let mut dirs: Vec<(String, PathBuf)> = entries
            .flatten()
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                let p = e.path();
                (name.starts_with("pi-cwd-") && p.is_dir())
                    .then(|| (name.trim_start_matches("pi-cwd-").to_string(), p))
            })
            .collect();
        dirs.sort_by(|a, b| version_cmp(&b.0, &a.0));
        if let Some((_, dir)) = dirs.first() {
            log_line(&format!("default_cwd: newest pi-cwd dir {}", dir.display()));
            return dir.to_string_lossy().to_string();
        }
    }

    // 3. Create ~/pi-cwd-<YYYYMMDD> (same scheme pi-web's endpoint uses).
    let date: String = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let days = secs / 86400;
        // Civil-from-days (Howard Hinnant's algorithm), UTC.
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
        let y = yoe + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = if m <= 2 { y + 1 } else { y };
        format!("{y}{m:02}{d:02}")
    };
    let dir = home.join(format!("pi-cwd-{date}"));
    let _ = std::fs::create_dir_all(&dir);
    log_line(&format!("default_cwd: created {}", dir.display()));
    dir.to_string_lossy().to_string()
}

/// Scan `~/.pi/agent/sessions/` for the most recently modified session
/// file and read its `cwd` from the first JSONL line. Returns None when
/// no sessions exist or none of them is readable.
fn latest_session_cwd(sessions_root: &Path) -> Option<String> {
    let mut newest: Option<(std::time::SystemTime, PathBuf)> = None;
    for dir in std::fs::read_dir(sessions_root).ok()?.flatten() {
        let dir_path = dir.path();
        if !dir_path.is_dir() {
            continue;
        }
        for entry in std::fs::read_dir(&dir_path).ok()?.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let mtime = entry.metadata().ok()?.modified().ok()?;
            if newest.as_ref().is_none_or(|(t, _)| mtime > *t) {
                newest = Some((mtime, p));
            }
        }
    }
    let (_, file) = newest?;
    let first = std::fs::read_to_string(file).ok()?.lines().next()?.to_string();
    // First line: {"type":"session",...,"cwd":"/path",...}
    let value: Value = serde_json::from_str(&first).ok()?;
    let cwd = value.get("cwd")?.as_str()?.to_string();
    (!cwd.is_empty()).then_some(cwd)
}

/// Frontend JS errors land in the PowerI log file so a non-starting window
/// still reports what broke in the webview.
#[tauri::command]
pub(crate) fn get_port() -> u16 {
    resolve_port()
}

/// Default port for this build (dev=9527 / prod=30141) — the "恢复默认"
/// button in the settings drawer resets to this value.
#[tauri::command]
pub(crate) fn default_port() -> u16 {
    DEFAULT_PORT
}

#[tauri::command]
pub(crate) fn log_error(message: String) {
    log_line(&format!("[webview] {message}"));
}

/// Open a URL in the system default browser.
///
/// poweri runs in a cross-origin iframe where `target="_blank"` clicks
/// cannot create new windows (the webview has no window/opener plugin);
/// the shell forwards those clicks here via postMessage. Scheme whitelist
/// keeps the command from being abused as a launcher.
#[tauri::command]
pub(crate) fn open_url(url: String) -> Result<(), String> {
    if !is_openable_scheme(&url) {
        let scheme = url.split(':').next().unwrap_or("");
        return Err(format!("REJECTED: 仅允许 http/https/mailto 链接，收到 `{scheme}`"));
    }
    open::that(url).map_err(|e| format!("OPEN_FAILED: 打开系统浏览器失败：{e}"))
}

/// 在系统文件管理器中打开文件所在目录（并尽量选中文件）。
/// - macOS: `open -R /path/to/file`（Finder 中选中）
/// - Windows: `explorer /select,"C:\path\to\file"`
/// - Linux: `xdg-open /path/to/parent`（打开目录）
#[tauri::command]
pub(crate) fn reveal_in_folder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("REVEAL_FAILED: 路径不存在：{path}"));
    }
    // 目录则直接打开目录；文件则打开其父目录并尝试选中
    let target: PathBuf = if p.is_dir() {
        p.to_path_buf()
    } else {
        p.parent().map(|d| d.to_path_buf()).unwrap_or_else(|| p.to_path_buf())
    };
    #[cfg(target_os = "macos")]
    {
        if p.is_file() {
            std::process::Command::new("open")
                .arg("-R")
                .arg(p)
                .spawn()
                .map_err(|e| format!("REVEAL_FAILED: 打开 Finder 失败：{e}"))?;
        } else {
            std::process::Command::new("open")
                .arg(&target)
                .spawn()
                .map_err(|e| format!("REVEAL_FAILED: 打开目录失败：{e}"))?;
        }
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        if p.is_file() {
            std::process::Command::new("explorer")
                .arg("/select,")
                .arg(p)
                .spawn()
                .map_err(|e| format!("REVEAL_FAILED: 打开资源管理器失败：{e}"))?;
        } else {
            open::that(&target).map_err(|e| format!("REVEAL_FAILED: 打开目录失败：{e}"))?;
        }
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        open::that(&target).map_err(|e| format!("REVEAL_FAILED: 打开目录失败：{e}"))?;
        return Ok(());
    }
}

/// 只允许 http/https/mailto，防止 open_url 被当作任意命令启动器。
fn is_openable_scheme(url: &str) -> bool {
    matches!(
        url.split(':').next().unwrap_or(""),
        "http" | "https" | "mailto"
    )
}

#[tauri::command]
pub(crate) fn server_status(_app: AppHandle) -> Status {
    // running 只按端口判定，不看 pid：spawn 后 pid 立即存在但端口要 1~3 秒
    // 才监听，若此时报 running，壳会走 reuse 分支立即加载 iframe，请求落在
    // 服务器未就绪窗口 → 命中 service worker 的 offline fallback 且不再重载。
    // 端口未开时壳走 start 流程，等 server:ready 事件（就绪后）再加载。
    let running = is_port_open(resolve_port());
    status_of(running)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_url_rejects_non_web_schemes() {
        assert!(is_openable_scheme("https://example.com"));
        assert!(is_openable_scheme("http://127.0.0.1:30141/x"));
        assert!(is_openable_scheme("mailto:a@b.com"));
        assert!(!is_openable_scheme("file:///etc/passwd"));
        assert!(!is_openable_scheme("javascript:alert(1)"));
        assert!(!is_openable_scheme("ssh://host"));
        assert!(!is_openable_scheme("not-a-url"));
    }

    #[test]
    fn latest_session_cwd_reads_cwd_from_session_file() {
        let root = std::env::temp_dir().join(format!("poweri-test-sessions-{}", std::process::id()));
        let session_dir = root.join("agent-1");
        std::fs::create_dir_all(&session_dir).unwrap();
        std::fs::write(
            session_dir.join("session.jsonl"),
            r#"{"type":"session","cwd":"/work/project"}"#,
        )
        .unwrap();

        assert_eq!(latest_session_cwd(&root).as_deref(), Some("/work/project"));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn latest_session_cwd_none_when_sessions_dir_missing() {
        let root = std::env::temp_dir().join(format!("poweri-test-sessions-empty-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);

        assert_eq!(latest_session_cwd(&root), None);
    }

    #[test]
    fn latest_session_cwd_ignores_non_jsonl_files() {
        let root = std::env::temp_dir().join(format!("poweri-test-sessions-json-{}", std::process::id()));
        let session_dir = root.join("agent-1");
        std::fs::create_dir_all(&session_dir).unwrap();
        std::fs::write(session_dir.join("notes.txt"), "not a session").unwrap();

        assert_eq!(latest_session_cwd(&root), None);

        let _ = std::fs::remove_dir_all(&root);
    }

    /// Point `home_dir()` at a throwaway directory for the `default_cwd`
    /// priority-chain tests: sets both HOME and USERPROFILE (whichever
    /// `home_dir` checks first on the host platform) and restores them
    /// after. Serialized through the crate-wide `TEST_ENV_LOCK`, because
    /// `default_cwd` also writes log lines into the overridden home.
    fn with_fake_home(f: impl FnOnce(&Path)) {
        let _guard = crate::TEST_ENV_LOCK.lock().unwrap();
        let saved_home = std::env::var("HOME").ok();
        let saved_user = std::env::var("USERPROFILE").ok();
        let home = std::env::temp_dir().join(format!("poweri-test-home-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).unwrap();
        std::env::set_var("HOME", &home);
        std::env::set_var("USERPROFILE", &home);
        f(&home);
        match saved_home {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
        match saved_user {
            Some(v) => std::env::set_var("USERPROFILE", v),
            None => std::env::remove_var("USERPROFILE"),
        }
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn default_cwd_prefers_latest_session_over_pi_cwd_dirs() {
        with_fake_home(|home| {
            let session = home
                .join(".pi")
                .join("agent")
                .join("sessions")
                .join("agent-1");
            std::fs::create_dir_all(&session).unwrap();
            std::fs::write(
                session.join("session.jsonl"),
                r#"{"type":"session","cwd":"/work/session-cwd"}"#,
            )
            .unwrap();
            // A session cwd must win even when older pi-cwd dirs exist.
            std::fs::create_dir_all(home.join("pi-cwd-20250101")).unwrap();

            assert_eq!(default_cwd(), "/work/session-cwd");
        });
    }

    #[test]
    fn default_cwd_prefers_newest_pi_cwd_dir() {
        with_fake_home(|home| {
            std::fs::create_dir_all(home.join("pi-cwd-20240101")).unwrap();
            std::fs::create_dir_all(home.join("pi-cwd-20250102")).unwrap();

            let cwd = default_cwd();
            assert!(cwd.ends_with("pi-cwd-20250102"), "got {cwd}");
        });
    }

    #[test]
    fn default_cwd_creates_today_dir_when_nothing_else() {
        with_fake_home(|home| {
            let cwd = default_cwd();
            let dir = Path::new(&cwd);
            assert!(dir.is_dir(), "created dir must exist: {cwd}");
            let name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let date = name.strip_prefix("pi-cwd-").unwrap_or("");
            assert_eq!(date.len(), 8, "date must be YYYYMMDD: {name}");
            assert!(date.chars().all(|c| c.is_ascii_digit()));
            assert_eq!(dir.parent(), Some(home), "dir must live under HOME");
        });
    }
}
