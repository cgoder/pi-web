#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(not(debug_assertions))]
use std::io::BufRead;
#[cfg(not(debug_assertions))]
use std::io::BufReader;
use std::net::TcpStream;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Mutex;
#[cfg(not(debug_assertions))]
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

/// Port that the pi-web server listens on (same default as the CLI).
const PORT: u16 = 30141;
/// Throwaway port used by the upgrade probe (npx @latest fetch).
#[allow(dead_code)] // used only in release builds
const UPGRADE_PROBE_PORT: u16 = 39999;
const PACKAGE: &str = "@agegr/pi-web";
#[allow(dead_code)] // used only in release builds
const UPGRADE_TIMEOUT: Duration = Duration::from_secs(120);

fn url() -> String {
    format!("http://127.0.0.1:{PORT}")
}

struct ServerState {
    pid: Mutex<Option<u32>>,
}

#[derive(Clone, serde::Serialize)]
struct Status {
    running: bool,
    port: u16,
    url: String,
}

fn status_of(running: bool) -> Status {
    Status { running, port: PORT, url: url() }
}

#[derive(Clone, serde::Serialize)]
struct UpgradeResult {
    ok: bool,
    version: String,
    restarted: bool,
    message: String,
}

/// Base launcher for npm CLIs (npx / npm).
///
/// macOS: prefers an explicit fnm path so the app also works when launched
/// from Finder/Dock, where the GUI process has a minimal PATH without
/// node/npm; falls back to plain `bin`.
///
/// Windows: GUI-launched processes may inherit a stale PATH (Node.js not
/// visible), and Rust's Command::new("npx") cannot resolve the npx.cmd
/// batch shim the way cmd.exe does. So run through "cmd /C npx ..." —
/// exactly like a user typing it in a terminal — and merge the standard
/// Node.js install directories into PATH as a safety net. The console is
/// kept hidden so no cmd window flashes up.
fn base_launcher(bin: &str) -> Command {
    #[cfg(unix)]
    {
        for fnm in [
            "/opt/homebrew/bin/fnm",
            "/opt/homebrew/opt/fnm/bin/fnm",
            "/usr/local/bin/fnm",
        ] {
            if Path::new(fnm).is_file() {
                let mut c = Command::new(fnm);
                c.args(["exec", "--using", "default", "--", bin]);
                return c;
            }
        }
        Command::new(bin)
    }
    #[cfg(windows)]
    {
        let mut c = Command::new("cmd");
        c.args(["/C", bin]);
        augment_path_with_node(&mut c);
        hide_console(&mut c);
        c
    }
}

#[cfg(windows)]
fn hide_console(c: &mut Command) {
    use std::os::windows::process::CommandExt;
    c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
}

#[cfg(windows)]
fn augment_path_with_node(c: &mut Command) {
    let mut dirs: Vec<String> = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Ok(base) = std::env::var(var) {
            let candidate = if var == "LOCALAPPDATA" {
                format!("{base}/Programs/nodejs")
            } else {
                format!("{base}/nodejs")
            };
            if Path::new(&candidate).is_dir() {
                dirs.push(candidate);
            }
        }
    }
    if dirs.is_empty() {
        return;
    }
    let mut path = dirs.join(";");
    if let Ok(p) = std::env::var("PATH") {
        if !p.is_empty() {
            path.push(';');
            path.push_str(&p);
        }
    }
    c.env("PATH", path);
}

/// `npx --yes @agegr/pi-web --no-open` — starts the pi-web server.
/// `--no-open` is essential: pi-web would otherwise open a browser tab on
/// every launch from inside the desktop window.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn pi_web_command() -> Command {
    let mut c = base_launcher("npx");
    c.args(["--yes", PACKAGE, "--no-open"]);
    c
}

/// Upgrade probe: the `@latest` tag makes npx fetch the newest release.
/// It starts pi-web on a throwaway port; the shell waits for that port to
/// open (proving the new version runs), then kills the probe and restarts
/// the real server.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn upgrade_command() -> Command {
    let mut c = base_launcher("npx");
    let pkg_latest = format!("{PACKAGE}@latest");
    let probe_port = UPGRADE_PROBE_PORT.to_string();
    c.args(["--yes", &pkg_latest, "--no-open", "-p", &probe_port]);
    c.env("npm_config_update_notifier", "false");
    c
}

/// `npm view @agegr/pi-web version` — prints the latest published version
/// (e.g. "0.8.9"), used for the topbar badge.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn version_command() -> Command {
    let mut c = base_launcher("npm");
    c.args(["view", PACKAGE, "version"]);
    c.env("npm_config_update_notifier", "false");
    c
}

fn extract_version(lines: &[String]) -> Option<String> {
    // Scan from the last line backwards for the first semver pattern, so it
    // works with bare "0.8.9", "v0.8.9", npm download lines
    // ("...pi-web-0.8.9.tgz"), etc.
    for line in lines.iter().rev() {
        if let Some(v) = find_semver(line) {
            return Some(v);
        }
    }
    None
}

/// Find a semver-like pattern (digits.digits.digits with optional
/// -prerelease / +build suffix) anywhere inside a line.
fn find_semver(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let n = b.len();
    let mut i = 0;
    while i < n {
        if !b[i].is_ascii_digit() {
            i += 1;
            continue;
        }
        let start = i;
        let mut j = i;
        let mut dots = 0u32;
        while j < n {
            if b[j].is_ascii_digit() {
                j += 1;
            } else if b[j] == b'.' && dots < 2 && j + 1 < n && b[j + 1].is_ascii_digit() {
                dots += 1;
                j += 1;
            } else {
                break;
            }
        }
        if dots == 2 {
            let mut end = j;
            if end < n && b[end] == b'-' {
                let mut k = end + 1;
                while k < n
                    && (b[k].is_ascii_alphanumeric() || b[k] == b'.' || b[k] == b'-')
                {
                    k += 1;
                }
                end = k;
            }
            if end > start {
                return Some(s[start..end].to_string());
            }
        }
        i = if j > i { j } else { i + 1 };
    }
    None
}

fn is_port_open(port: u16) -> bool {
    TcpStream::connect(("127.0.0.1", port)).is_ok()
}

#[cfg(unix)]
fn kill_process_group(pid: u32) {
    unsafe { libc::kill(-(pid as i32), libc::SIGTERM); }
    std::thread::sleep(Duration::from_millis(400));
    unsafe { libc::kill(-(pid as i32), libc::SIGKILL); }
}

#[cfg(not(unix))]
fn kill_process_group(pid: u32) {
    let mut c = Command::new("taskkill");
    c.args(["/PID", &pid.to_string(), "/T", "/F"]);
    hide_console(&mut c);
    let _ = c.status();
}

fn start_internal(app: &AppHandle) -> Result<Status, String> {
    {
        let state = app.state::<ServerState>();
        if state.pid.lock().unwrap().is_some() {
            return Ok(status_of(true));
        }
    }

    // Port already serving (e.g. the user's browser pi-web session)? Reuse
    // it instead of spawning a duplicate that would fail with EADDRINUSE.
    if is_port_open(PORT) {
        let _ = app.emit("server:ready", ());
        return Ok(status_of(true));
    }

    #[cfg(not(debug_assertions))]
    {
        let mut cmd = pi_web_command();
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("无法启动 npx @agegr/pi-web --no-open：{e}"))?;
        let pid = child.id();

        if let Some(stdout) = child.stdout.take() {
            let app = app.clone();
            std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines() {
                    match line {
                        Ok(l) => {
                            let _ = app.emit("server:stdout", l);
                        }
                        Err(_) => break,
                    }
                }
            });
        }
        if let Some(stderr) = child.stderr.take() {
            let app = app.clone();
            std::thread::spawn(move || {
                for line in BufReader::new(stderr).lines() {
                    match line {
                        Ok(l) => {
                            let _ = app.emit("server:stderr", l);
                        }
                        Err(_) => break,
                    }
                }
            });
        }

        {
            let state = app.state::<ServerState>();
            let mut guard = state.pid.lock().unwrap();
            *guard = Some(pid);
        }

        // watcher: clear state and notify on exit
        {
            let app = app.clone();
            std::thread::spawn(move || {
                let code = child.wait().ok().and_then(|s| s.code());
                let state = app.state::<ServerState>();
                let mut guard = state.pid.lock().unwrap();
                *guard = None;
                drop(guard);
                let _ = app.emit("server:exited", code);
            });
        }
    }

    // readiness polling; in dev mode `next dev` (started by beforeDevCommand)
    // provides the port, so we only wait; in production the child spawn above
    // provides it, and we abort early when the process exits before the port
    // opens (e.g. node/npx missing) so the UI reports failure at once.
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(90);
            loop {
                if is_port_open(PORT) {
                    let _ = app.emit("server:ready", ());
                    return;
                }
                #[cfg(not(debug_assertions))]
                {
                    if app.state::<ServerState>().pid.lock().unwrap().is_none() {
                        return;
                    }
                }
                if Instant::now() >= deadline {
                    let _ = app.emit("server:timeout", ());
                    return;
                }
                std::thread::sleep(Duration::from_millis(250));
            }
        });
    }

    Ok(status_of(true))
}

#[tauri::command]
fn start_server(app: AppHandle) -> Result<Status, String> {
    start_internal(&app)
}

#[tauri::command]
fn stop_server(app: AppHandle) -> Status {
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
        // Nothing we own: reflect whether PORT is still up (reused server).
        None => status_of(is_port_open(PORT)),
    }
}

#[tauri::command]
fn restart_server(app: AppHandle) -> Result<Status, String> {
    stop_server(app.clone());
    std::thread::sleep(Duration::from_millis(600));
    start_internal(&app)
}

/// Latest published version from the npm registry (topbar badge).
/// Network-dependent; returns "unknown" on failure.
fn current_version() -> String {
    let mut cmd = version_command();
    cmd.stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(unix)]
    {
        cmd.process_group(0);
    }
    match cmd.spawn().and_then(|c| c.wait_with_output()) {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout);
            let lines: Vec<String> = text.lines().map(str::to_string).collect();
            extract_version(&lines).unwrap_or_else(|| "unknown".to_string())
        }
        Err(_) => "unknown".to_string(),
    }
}

/// Upgrade pi-web to the latest published version:
/// 1. Run `npx --yes @agegr/pi-web@latest --no-open -p 39999` — the `@latest`
///    tag forces npx to fetch the newest release and the probe actually
///    boots it on a throwaway port.
/// 2. When the probe port opens (or the process exits early / 120s timeout),
///    kill the probe process group, then restart the real server on PORT
///    if this app owns it.
#[tauri::command]
#[cfg_attr(debug_assertions, allow(unused_variables))]
async fn upgrade_piweb(app: AppHandle) -> Result<UpgradeResult, String> {
    #[cfg(debug_assertions)]
    {
        return Err(
            "开发模式（npm run tauri dev）下不可升级，请使用 npm run tauri build 构建后再试"
                .to_string(),
        );
    }

    #[cfg(not(debug_assertions))]
    {
        let mut cmd = upgrade_command();
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }

        let mut child = cmd.spawn().map_err(|e| {
            format!("无法启动升级命令（npx --yes @agegr/pi-web@latest --no-open -p {UPGRADE_PROBE_PORT}）：{e}")
        })?;

        let collected: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

        if let Some(stdout) = child.stdout.take() {
            let app = app.clone();
            let collected = collected.clone();
            std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines() {
                    match line {
                        Ok(l) => {
                            let _ = app.emit("upgrade:stdout", &l);
                            collected.lock().unwrap().push(l);
                        }
                        Err(_) => break,
                    }
                }
            });
        }
        if let Some(stderr) = child.stderr.take() {
            let app = app.clone();
            let collected = collected.clone();
            std::thread::spawn(move || {
                for line in BufReader::new(stderr).lines() {
                    match line {
                        Ok(l) => {
                            let _ = app.emit("upgrade:stderr", &l);
                            collected.lock().unwrap().push(l);
                        }
                        Err(_) => break,
                    }
                }
            });
        }

        // Wait for the probe port or early exit (poll, never block).
        let deadline = Instant::now() + UPGRADE_TIMEOUT;
        let mut probe_ok = false;
        let mut exit_code: Option<i32> = None;
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    exit_code = status.code();
                    break;
                }
                Ok(None) => {}
                Err(e) => {
                    exit_code = Some(e.raw_os_error().unwrap_or(-1));
                    break;
                }
            }
            if is_port_open(UPGRADE_PROBE_PORT) {
                probe_ok = true;
                break;
            }
            if Instant::now() >= deadline {
                break;
            }
            std::thread::sleep(Duration::from_millis(250));
        }

        if probe_ok {
            // New version booted successfully — kill the probe process group.
            kill_process_group(child.id());
            std::thread::sleep(Duration::from_millis(600));
        }

        let version = current_version();
        let mut restarted = false;
        let message;

        if probe_ok {
            let owns = app.state::<ServerState>().pid.lock().unwrap().is_some();
            if owns {
                stop_server(app.clone());
                std::thread::sleep(Duration::from_millis(600));
                match start_internal(&app) {
                    Ok(_) => {
                        restarted = true;
                        message = "升级完成，服务已用新版本重启".to_string();
                    }
                    Err(e) => {
                        message = format!("升级成功，但重启失败：{e}，请手动点击重启");
                    }
                }
            } else {
                message =
                    "升级完成，已安装最新版（当前无本应用运行的服务，下次启动即生效）".to_string();
            }
        } else {
            let code = exit_code.unwrap_or(-1);
            message = format!("升级失败（退出码 {code}，或 120 秒内未就绪），请检查网络后重试");
        }

        Ok(UpgradeResult { ok: probe_ok, version, restarted, message })
    }
}

/// Report the pi-web version that the npm registry currently publishes.
#[tauri::command]
async fn piweb_version() -> Result<String, String> {
    Ok(current_version())
}

#[tauri::command]
fn server_status(app: AppHandle) -> Status {
    let state = app.state::<ServerState>();
    let running = state.pid.lock().unwrap().is_some() || is_port_open(PORT);
    status_of(running)
}

fn main() {
    tauri::Builder::default()
        .manage(ServerState { pid: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            restart_server,
            server_status,
            upgrade_piweb,
            piweb_version
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
