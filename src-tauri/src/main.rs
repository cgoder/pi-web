#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(not(debug_assertions))]
use std::io::BufRead;
#[cfg(not(debug_assertions))]
use std::io::BufReader;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(not(debug_assertions))]
use std::process::Stdio;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(all(unix, not(debug_assertions)))]
use std::os::unix::process::CommandExt;

/// Port that the pi-web server listens on (same default as the CLI).
const PORT: u16 = 30141;
const PACKAGE: &str = "@agegr/pi-web";
/// npm-install timeout for the first install and for upgrades. Downloads can
/// take minutes on slow networks; the readiness poll keeps the UI informed
/// during the wait.
#[cfg_attr(debug_assertions, allow(dead_code))]
const INSTALL_TIMEOUT: Duration = Duration::from_secs(300);

/// Known fnm binary locations probed before falling back to PATH lookup,
/// so Finder/Dock launches (which carry a minimal PATH) still find the
/// node-family tools and a system-wide pi-web on the fnm-managed Node.
const FNM_CANDIDATES: [&str; 3] = [
    "/opt/homebrew/bin/fnm",
    "/opt/homebrew/opt/fnm/bin/fnm",
    "/usr/local/bin/fnm",
];

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
    Status {
        running,
        port: PORT,
        url: url(),
    }
}

#[derive(Clone, serde::Serialize)]
struct UpgradeResult {
    ok: bool,
    version: String,
    restarted: bool,
    message: String,
}

/// Where the pi-web binary PowerI will run comes from. Drives the version
/// chip, the upgrade button, and the first-run install banner.
#[cfg_attr(debug_assertions, allow(dead_code))]
#[cfg_attr(not(debug_assertions), allow(dead_code))]
#[derive(Clone, Copy, PartialEq, Eq)]
enum WebSource {
    /// `POWERI_WEB_BIN` explicit override.
    Override,
    /// A system-wide install found on PATH (e.g. `npm install -g`), so a
    /// global pi-web stays the single source of truth.
    System,
    /// The fixed install dir (`~/.poweri/web`) from a previous fetch.
    Cached,
    /// Nothing usable yet; first start will download.
    Missing,
    /// Debug builds run the repo's own dev servers (scripts/dev-shell.mjs).
    Local,
}

impl WebSource {
    fn as_str(self) -> &'static str {
        match self {
            WebSource::Override => "override",
            WebSource::System => "system",
            WebSource::Cached => "cached",
            WebSource::Missing => "missing",
            WebSource::Local => "local",
        }
    }
}

#[derive(Clone, serde::Serialize)]
struct WebInfo {
    source: &'static str,
    version: String,
    can_upgrade: bool,
}

/// Append one line to the PowerI log file the user can inspect when
/// reporting problems (`~/Library/Logs/PowerI/poweri.log`, or
/// `%USERPROFILE%\.poweri\poweri.log` on Windows).
fn log_line(line: &str) {
    use std::io::Write;
    let Some(home) = home_dir() else { return };
    #[cfg(windows)]
    let dir = home.join(".poweri");
    #[cfg(not(windows))]
    let dir = home.join("Library").join("Logs").join("PowerI");
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("poweri.log"))
    {
        let _ = writeln!(f, "{line}");
    }
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
#[cfg_attr(debug_assertions, allow(dead_code))]
fn base_launcher(bin: &str) -> Command {
    #[cfg(unix)]
    {
        for fnm in FNM_CANDIDATES {
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

/// Source of the pi-web PowerI will run, without triggering a download.
#[cfg(debug_assertions)]
fn web_source() -> WebSource {
    WebSource::Local
}

/// Source of the pi-web PowerI will run, without triggering a download.
#[cfg(not(debug_assertions))]
fn web_source() -> WebSource {
    if std::env::var("POWERI_WEB_BIN").is_ok() {
        WebSource::Override
    } else if system_web_bin().is_some() {
        WebSource::System
    } else if installed_web_bin().is_some() {
        WebSource::Cached
    } else {
        WebSource::Missing
    }
}

/// Locate a system-wide pi-web executable (e.g. `npm install -g
/// @agegr/pi-web`) so a globally installed pi-web stays the single source
/// of truth. The GUI-launch PATH is minimal, so first probe the known fnm
/// environments, then a plain PATH lookup.
/// Locate a system-wide pi-web executable (e.g. `npm install -g
/// @agegr/pi-web`) so a globally installed pi-web stays the single source
/// of truth. The GUI-launched process may carry a minimal PATH (Finder/Dock
/// launches), so the search probes, in order: the current PATH, the
/// fnm-resolved environment `base_launcher` would use, the well-known npm
/// global bin directories for Node installs fnm does not manage (Homebrew /
/// nodejs.org / nvm), and the user's configured `npm prefix -g`.
fn system_web_bin() -> Option<PathBuf> {
    #[cfg(unix)]
    {
        probe_command(&["sh", "-c", "command -v pi-web || true"])
            .or_else(|| probe_fnm_env())
            .or_else(probe_fnm_roots)
            .or_else(|| probe_known_dir("/opt/homebrew/bin/pi-web"))
            .or_else(|| probe_known_dir("/usr/local/bin/pi-web"))
            .or_else(|| probe_nvm_dirs())
            .or_else(probe_npm_prefix)
    }
    #[cfg(windows)]
    {
        probe_where()
            .or_else(|| {
                let appdata = std::env::var("APPDATA").ok()?;
                let dir = PathBuf::from(appdata).join("npm").join("pi-web.cmd");
                dir.is_file().then_some(dir)
            })
            .or_else(probe_npm_prefix)
    }
}

/// OS home directory, honoring Windows' USERPROFILE (HOME is unset there).
fn home_dir() -> Option<PathBuf> {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()
        .map(PathBuf::from)
}

/// Run a command and return the first absolute path it prints, when that
/// path exists and is a file.
fn probe_command(args: &[&str]) -> Option<PathBuf> {
    let out = Command::new(args[0]).args(&args[1..]).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let line = String::from_utf8_lossy(&out.stdout);
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    Path::new(line).is_file().then(|| PathBuf::from(line))
}

/// Glob every known fnm root (`~/.fnm`, `~/.local/share/fnm`) for a
/// global pi-web. Finder/Dock launches carry no FNM_DIR, and fnm's data
/// root default differs between installs, so `fnm exec` may resolve a
/// different root than the one the user's global install lives in; a
/// direct filesystem probe covers both roots unconditionally.
fn probe_fnm_roots() -> Option<PathBuf> {
    let home = home_dir()?;
    let roots = [
        home.join(".fnm"),
        home.join(".local").join("share").join("fnm"),
    ];
    for root in roots {
        if let Ok(entries) = std::fs::read_dir(root.join("node-versions")) {
            for entry in entries.flatten() {
                let Ok(ft) = entry.file_type() else { continue };
                if !ft.is_dir() {
                    continue;
                }
                let bin = entry.path().join("installation").join("bin").join("pi-web");
                if bin.is_file() {
                    return Some(bin);
                }
            }
        }
        let alias = root
            .join("aliases")
            .join("default")
            .join("bin")
            .join("pi-web");
        if alias.is_file() {
            return Some(alias);
        }
    }
    None
}

/// Probe `fnm exec --using default` (the same environment `base_launcher`
/// uses) for `command -v pi-web`, so a global install on an fnm-managed
/// Node is found even from a minimal-PATH GUI launch.
#[cfg(unix)]
fn probe_fnm_env() -> Option<PathBuf> {
    for fnm in FNM_CANDIDATES {
        if Path::new(fnm).is_file() {
            if let Some(p) = probe_command(&[
                fnm,
                "exec",
                "--using",
                "default",
                "--",
                "sh",
                "-c",
                "command -v pi-web || true",
            ]) {
                return Some(p);
            }
        }
    }
    None
}

/// Explicit well-known npm global bin directory for a Node install that
/// fnm does not manage (Homebrew `/opt/homebrew/bin`, nodejs.org
/// installer `/usr/local/bin`).
fn probe_known_dir(path: &str) -> Option<PathBuf> {
    let bin = PathBuf::from(path);
    bin.is_file().then_some(bin)
}

/// Glob `~/.nvm/versions/node/*/bin/pi-web` for nvm-managed Node installs.
fn probe_nvm_dirs() -> Option<PathBuf> {
    let nvm = home_dir()?.join(".nvm").join("versions").join("node");
    let entries = std::fs::read_dir(&nvm).ok()?;
    for entry in entries.flatten() {
        if entry.file_type().ok()?.is_dir() {
            let bin = entry.path().join("bin").join("pi-web");
            if bin.is_file() {
                return Some(bin);
            }
        }
    }
    None
}

/// Resolve the user's configured npm global root via `npm prefix -g` and
/// report its bin (works for any custom prefix configuration).
fn probe_npm_prefix() -> Option<PathBuf> {
    let out = Command::new("npm").args(["prefix", "-g"]).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let prefix = String::from_utf8_lossy(&out.stdout);
    let prefix = prefix.trim();
    if prefix.is_empty() {
        return None;
    }
    #[cfg(windows)]
    let bin = PathBuf::from(prefix).join("pi-web.cmd");
    #[cfg(not(windows))]
    let bin = PathBuf::from(prefix).join("bin").join("pi-web");
    bin.is_file().then_some(bin)
}

/// `where pi-web` through cmd with the standard Node install dirs merged
/// into the child PATH (Windows).
#[cfg(windows)]
fn probe_where() -> Option<PathBuf> {
    let mut c = Command::new("cmd");
    c.args(["/C", "where", "pi-web"]);
    augment_path_with_node(&mut c);
    hide_console(&mut c);
    let out = c.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines()
        .next()
        .filter(|l| !l.is_empty())
        .map(PathBuf::from)
}

/// The pi-web npm package is installed into a fixed directory under the
/// user's home instead of being fetched with `npx`. npm's exec runner has a
/// known bug (npm/cli#9870): it launches the package bin via `sh -c <bin>`
/// without adding the npx cache bin dir to PATH, so every `npx --yes <pkg>`
/// fails with "command not found". A dedicated `npm install --prefix` +
/// direct spawn of the installed bin path sidesteps the broken shim
/// entirely and keeps the "always fetch the latest npm release" behavior.
/// The directory is overridable so tests can point at throwaway prefixes.
#[cfg(not(debug_assertions))]
fn install_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("POWERI_INSTALL_DIR") {
        return PathBuf::from(dir);
    }
    // Windows exposes the home directory as USERPROFILE; HOME is unset
    // there, and a relative fallback would install into the GUI cwd.
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".poweri").join("web")
}

/// Absolute path of the installed pi-web bin, when present. On Windows npm
/// installs `.cmd` shims; the extensionless POSIX shim is not executable by
/// CreateProcess.
#[cfg(not(debug_assertions))]
fn installed_web_bin() -> Option<PathBuf> {
    #[cfg(windows)]
    let bin = install_dir()
        .join("node_modules")
        .join(".bin")
        .join("pi-web.cmd");
    #[cfg(not(windows))]
    let bin = install_dir()
        .join("node_modules")
        .join(".bin")
        .join("pi-web");
    bin.is_file().then_some(bin)
}

/// The bin path this build will actually run, without triggering a
/// download: `POWERI_WEB_BIN` > system PATH > fixed install dir.
fn resolved_web_bin() -> Option<PathBuf> {
    if let Ok(bin) = std::env::var("POWERI_WEB_BIN") {
        return Some(PathBuf::from(bin));
    }
    system_web_bin().or_else(|| match () {
        #[cfg(not(debug_assertions))]
        _ => installed_web_bin(),
        #[cfg(debug_assertions)]
        _ => None,
    })
}

/// Read the `version` field from the npm package of the resolved bin: the
/// bin lives in `.../node_modules/@agegr/pi-web/bin/pi-web.js` (possibly
/// reached through `.bin/pi-web`), so walk up a few parents looking for a
/// package.json whose `name` matches PACKAGE.
fn version_from_bin(bin: &Path) -> Option<String> {
    let bin = std::fs::canonicalize(bin).ok()?;
    let mut dir = bin.parent()?.to_path_buf();
    for _ in 0..5 {
        let pkg = dir.join("package.json");
        if let Ok(text) = std::fs::read_to_string(&pkg) {
            if let Ok(value) = serde_json::from_str::<Value>(&text) {
                if value.get("name").and_then(|n| n.as_str()) == Some(PACKAGE) {
                    return value
                        .get("version")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                }
            }
        }
        dir = dir.parent()?.to_path_buf();
    }
    None
}

/// Version of the pi-web this build will actually run. Debug builds have no
/// resolved bin and report the local repository package version instead.
fn web_version() -> String {
    if let Some(bin) = resolved_web_bin() {
        if let Some(v) = version_from_bin(&bin) {
            return v;
        }
    }
    #[cfg(debug_assertions)]
    {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
        if let Ok(text) = std::fs::read_to_string(root.join("package.json")) {
            if let Ok(value) = serde_json::from_str::<Value>(&text) {
                if let Some(v) = value.get("version").and_then(|v| v.as_str()) {
                    return v.to_string();
                }
            }
        }
    }
    "unknown".to_string()
}

/// Launch a system-wide pi-web with its own Node environment. npm global
/// installs place the pi-web bin next to the Node that owns it (`npm
/// prefix` equals the Node install root), so prepending the bin directory
/// to PATH makes the `#!/usr/bin/env node` shebang resolve to the matching
/// Node — nvm, Homebrew, nodejs.org and fnm installs each keep their own
/// bin dir. `base_launcher` is deliberately NOT used here: its fnm wrapper
/// would run the pi-web under whatever Node fnm manages, which can be a
/// different major version or a different manager's install.
#[cfg(all(unix, not(debug_assertions)))]
fn system_web_command(bin: &Path) -> Command {
    let mut c = Command::new(bin);
    if let Some(dir) = bin.parent() {
        let dir = dir.to_string_lossy().to_string();
        let path = match std::env::var("PATH") {
            Ok(p) if !p.is_empty() => format!("{dir}:{p}"),
            _ => dir,
        };
        c.env("PATH", path);
    }
    c
}

/// The pi-web launch command, resolved in priority order:
/// 1. `POWERI_WEB_BIN` (+ optional whitespace-separated `POWERI_WEB_ARGS`)
///    — explicit override in any build.
/// 2. A system-wide pi-web on PATH (`npm install -g @agegr/pi-web`), so a
///    globally installed pi-web stays the single source of truth and PowerI
///    never downloads a duplicate copy.
/// 3. The pi-web npm package installed into `install_dir()`, downloading it
///    on first use with a visible banner.
/// `--no-open` is always appended so the shell never pops a browser tab.
#[cfg(not(debug_assertions))]
fn web_launch_command(app: &AppHandle) -> Result<Command, String> {
    if let Ok(bin) = std::env::var("POWERI_WEB_BIN") {
        let mut c = Command::new(&bin);
        if let Ok(args) = std::env::var("POWERI_WEB_ARGS") {
            c.args(args.split_whitespace());
        }
        c.args(["--no-open"]);
        return Ok(c);
    }
    if let Some(bin) = system_web_bin() {
        log_line(&format!("web source: system ({})", bin.display()));
        #[cfg(unix)]
        let mut c = system_web_command(&bin);
        #[cfg(windows)]
        let mut c = base_launcher(
            bin.to_str()
                .ok_or_else(|| "系统 pi-web 路径无效".to_string())?,
        );
        c.args(["--no-open"]);
        return Ok(c);
    }
    let bin = ensure_web_installed(app)?;
    let bin = bin
        .to_str()
        .ok_or_else(|| "pi-web bin 路径无效".to_string())?;
    log_line(&format!("web source: cached ({bin})"));
    let mut c = base_launcher(bin);
    c.args(["--no-open"]);
    Ok(c)
}

/// Spawn npm (via the fnm-aware base launcher) and emit its stdout/stderr
/// through `server:stdout`/`server:stderr` so the CLI log panel shows the
/// install progress. Blocks until the child exits.
#[cfg(not(debug_assertions))]
fn run_npm(app: &AppHandle, args: &[&str], timeout: Duration) -> Result<(), String> {
    let mut cmd = base_launcher("npm");
    cmd.args(args);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(unix)]
    {
        cmd.process_group(0);
    }
    let mut child = cmd.spawn().map_err(|e| format!("无法启动 npm：{e}"))?;
    if let Some(stdout) = child.stdout.take() {
        let app = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                if let Ok(l) = line {
                    let _ = app.emit("server:stdout", l);
                }
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let app = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines() {
                if let Ok(l) = line {
                    let _ = app.emit("server:stderr", l);
                }
            }
        });
    }
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if status.success() {
                    return Ok(());
                }
                return Err(format!(
                    "npm {} 失败（退出码 {:?}）",
                    args.join(" "),
                    status.code()
                ));
            }
            Ok(None) => {}
            Err(e) => return Err(format!("等待 npm 退出失败：{e}")),
        }
        if started.elapsed() >= timeout {
            kill_process_group(child.id());
            return Err(format!(
                "npm {} 超时（{}s），已终止",
                args.join(" "),
                timeout.as_secs()
            ));
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Ensure the pi-web npm package is installed into the fixed directory.
/// First use downloads it (several minutes on slow networks); subsequent
/// starts reuse it. Emits `web:installing` so the shell can show a
/// prominent download banner.
#[cfg(not(debug_assertions))]
fn ensure_web_installed(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(bin) = installed_web_bin() {
        return Ok(bin);
    }
    let dir = install_dir();
    let prefix = dir.to_str().ok_or_else(|| "安装目录路径无效".to_string())?;
    log_line(&format!("web source: missing -> downloading into {prefix}"));
    let _ = app.emit("web:installing", ());
    let _ = app.emit(
        "server:stdout",
        format!("$ npm install --prefix {prefix} {PACKAGE}"),
    );
    run_npm(
        app,
        &[
            "install",
            "--prefix",
            prefix,
            "--no-audit",
            "--no-fund",
            PACKAGE,
        ],
        INSTALL_TIMEOUT,
    )?;
    installed_web_bin().ok_or_else(|| format!("pi-web 已安装但未找到 bin：{}", dir.display()))
}

fn is_port_open(port: u16) -> bool {
    TcpStream::connect(("127.0.0.1", port)).is_ok()
}

#[cfg(unix)]
fn kill_process_group(pid: u32) {
    unsafe {
        libc::kill(-(pid as i32), libc::SIGTERM);
    }
    std::thread::sleep(Duration::from_millis(400));
    unsafe {
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
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
        let mut cmd = web_launch_command(app)?;
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }

        let mut child = cmd.spawn().map_err(|e| format!("无法启动 pi-web：{e}"))?;
        let pid = child.id();
        log_line(&format!(
            "start_internal: spawning {:?}",
            cmd.get_program().to_string_lossy()
        ));

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
    // opens (e.g. node/npm missing) so the UI reports failure at once.
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

/// Report the pi-web edition this build runs: where it comes from, its
/// version, and whether the in-app upgrade button can manage it.
#[tauri::command]
fn web_info() -> WebInfo {
    let source = web_source();
    let version = web_version();
    log_line(&format!(
        "web_info: source={} version={version}",
        source.as_str()
    ));
    WebInfo {
        source: source.as_str(),
        can_upgrade: source == WebSource::Cached,
        version,
    }
}

/// Upgrade pi-web to the latest published npm version. Only meaningful when
/// PowerI manages its own copy in the fixed install dir (source `cached`);
/// a system-wide or overridden pi-web is upgraded by the user directly.
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
        if web_source() != WebSource::Cached {
            return Err(
                "当前使用的 pi-web 不由 PowerI 管理（系统安装或自定义路径），请用 npm install -g @agegr/pi-web@latest 升级"
                    .to_string(),
            );
        }
        let dir = install_dir();
        let prefix = dir.to_str().unwrap_or_default();
        let _ = app.emit(
            "server:stdout",
            format!("$ npm install --prefix {prefix} {PACKAGE}@latest"),
        );
        match run_npm(
            &app,
            &[
                "install",
                "--prefix",
                prefix,
                "--no-audit",
                "--no-fund",
                &format!("{PACKAGE}@latest"),
            ],
            INSTALL_TIMEOUT,
        ) {
            Ok(()) => {}
            Err(e) => {
                return Ok(UpgradeResult {
                    ok: false,
                    version: "unknown".to_string(),
                    restarted: false,
                    message: format!("升级失败：{e}"),
                });
            }
        }
        log_line("upgrade: npm install @latest done");

        let version = web_version();
        let owns = app.state::<ServerState>().pid.lock().unwrap().is_some();
        let mut restarted = false;
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
                    message = format!("升级成功，但重启失败：{e}，请手动点击重启");
                }
            }
        } else {
            message =
                "升级完成，已安装最新版（当前无本应用运行的服务，下次启动即生效）".to_string();
        }

        Ok(UpgradeResult {
            ok: true,
            version,
            restarted,
            message,
        })
    }
}

/// Version of the pi-web this build will actually run (local read of the
/// resolved package, no network). Falls back to "unknown".
#[tauri::command]
fn piweb_version() -> String {
    web_version()
}

/// Frontend JS errors land in the PowerI log file so a non-starting window
/// still reports what broke in the webview.
#[tauri::command]
fn log_error(message: String) {
    log_line(&format!("[webview] {message}"));
}

#[tauri::command]
fn server_status(app: AppHandle) -> Status {
    let state = app.state::<ServerState>();
    let running = state.pid.lock().unwrap().is_some() || is_port_open(PORT);
    status_of(running)
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
            start_server,
            stop_server,
            restart_server,
            server_status,
            upgrade_piweb,
            piweb_version,
            web_info,
            log_error
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
