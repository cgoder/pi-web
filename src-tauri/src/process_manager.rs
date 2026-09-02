//! pi-web child-process management: spawn / kill / reuse, port-readiness
//! polling, and the resolution of which pi-web binary the app runs
//! (`POWERI_WEB_BIN` override > system install > cached install).

#[cfg(not(debug_assertions))]
use std::io::BufRead;
#[cfg(not(debug_assertions))]
use std::io::BufReader;
use std::net::TcpStream;
#[cfg(all(unix, not(debug_assertions)))]
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
#[cfg(not(debug_assertions))]
use std::process::Command;
#[cfg(not(debug_assertions))]
use std::process::Stdio;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

/// The pid PowerI spawned for pi-web, when it owns the running process.
pub(crate) struct ServerState {
    pub(crate) pid: Mutex<Option<u32>>,
}

#[derive(Clone, serde::Serialize)]
pub(crate) struct Status {
    running: bool,
    port: u16,
    url: String,
}

pub(crate) fn status_of(running: bool) -> Status {
    Status {
        running,
        port: crate::resolve_port(),
        url: crate::url(),
    }
}

/// Where the pi-web binary PowerI will run comes from. Drives the version
/// chip, the upgrade button, and the first-run install banner.
#[cfg_attr(debug_assertions, allow(dead_code))]
#[cfg_attr(not(debug_assertions), allow(dead_code))]
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum WebSource {
    /// `POWERI_WEB_BIN` explicit override.
    Override,
    /// The fixed install dir (`~/.poweri/web`) from a previous fetch.
    /// Wins over a system-wide install so an in-app upgrade actually takes
    /// effect.
    Cached,
    /// A system-wide install found on PATH (e.g. `npm install -g`); used
    /// only when no managed copy is installed yet.
    System,
    /// Nothing usable yet; first start will download.
    Missing,
    /// Debug builds run the repo's own dev servers (scripts/dev-shell.mjs).
    Local,
}

impl WebSource {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            WebSource::Override => "override",
            WebSource::System => "system",
            WebSource::Cached => "cached",
            WebSource::Missing => "missing",
            WebSource::Local => "local",
        }
    }
}

/// Source of the pi-web PowerI will run, without triggering a download.
#[cfg(debug_assertions)]
pub(crate) fn web_source() -> WebSource {
    WebSource::Local
}

/// Source of the pi-web PowerI will run, without triggering a download.
#[cfg(not(debug_assertions))]
pub(crate) fn web_source() -> WebSource {
    if std::env::var("POWERI_WEB_BIN").is_ok() {
        WebSource::Override
    } else if crate::installer::installed_web_bin().is_some() {
        WebSource::Cached
    } else if crate::env_detection::system_web_bin().is_some() {
        WebSource::System
    } else {
        WebSource::Missing
    }
}

/// Version of the pi-web this build will actually run. Debug builds have no
/// resolved bin and report the local repository package version instead.
pub(crate) fn web_version() -> String {
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

/// Read the `version` field from the npm package of the resolved bin: the
/// bin lives in `.../node_modules/@poweri/poweri-web/bin/pi-web.js` (possibly
/// reached through `.bin/pi-web`), so walk up a few parents looking for a
/// package.json whose `name` matches the pi-web package.
fn version_from_bin(bin: &Path) -> Option<String> {
    let bin = std::fs::canonicalize(bin).ok()?;
    let mut dir = bin.parent()?.to_path_buf();

    // Windows npm installs place `.cmd` shims in `node_modules/.bin`; the
    // shim never canonicalizes to the JS entry it runs, so the walk below
    // would stop at `node_modules` and miss the package.json. Read the shim
    // and resolve the target it embeds (e.g. `"%dp0%\\..\\@poweri\\pi-web\\bin\\pi-web.js"`)
    // to the real entry before walking up.
    #[cfg(windows)]
    if bin.extension().and_then(|e| e.to_str()) == Some("cmd") {
        if let Ok(shim) = std::fs::read_to_string(&bin) {
            let rel = shim.lines().find_map(|l| {
                let l = l.trim();
                if !l.contains("%dp0%") || !l.contains("pi-web") {
                    return None;
                }
                // The target sits inside a quoted token: `"%dp0%\..\@poweri\pi-web\bin\pi-web.js"`.
                l.split('"').find(|part| part.contains("%dp0%") && part.contains("pi-web"))
            });
            if let Some(rel) = rel.and_then(|p| p.split_once("%dp0%")).map(|(_, rest)| rest.trim_start_matches('\\')) {
                if let Ok(real) = std::fs::canonicalize(bin.parent()?.join(rel)) {
                    if let Some(parent) = real.parent() {
                        dir = parent.to_path_buf();
                    }
                }
            }
        }
    }

    for _ in 0..5 {
        let pkg = dir.join("package.json");
        if let Ok(text) = std::fs::read_to_string(&pkg) {
            if let Ok(value) = serde_json::from_str::<Value>(&text) {
                if value.get("name").and_then(|n| n.as_str()) == Some(crate::installer::PACKAGE_NAME) {
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

/// The bin path this build will actually run, without triggering a
/// download: `POWERI_WEB_BIN` > system PATH > fixed install dir.
fn resolved_web_bin() -> Option<PathBuf> {
    if let Ok(bin) = std::env::var("POWERI_WEB_BIN") {
        return Some(PathBuf::from(bin));
    }
    #[cfg(not(debug_assertions))]
    let cached = crate::installer::installed_web_bin();
    #[cfg(debug_assertions)]
    let cached: Option<PathBuf> = None;
    crate::env_detection::system_web_bin().or(cached)
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
///
/// 1. `POWERI_WEB_BIN` (+ optional whitespace-separated `POWERI_WEB_ARGS`)
///    — explicit override in any build.
/// 2. The pi-web package installed into the fixed install dir (a previous
///    `npm install` / in-app upgrade) — the managed copy wins over a
///    system-wide install so the upgrade button's result is what runs.
/// 3. A system-wide pi-web on PATH (`npm install -g @poweri/poweri-web`),
///    used when no managed copy exists yet.
/// 4. Downloading into the install dir on first use with a visible banner.
///
/// `--no-open` is always appended so the shell never pops a browser tab.
/// `node` is the node the caller's version precheck chose; the cached
/// install runs under it so the precheck and the spawn agree.
#[cfg(not(debug_assertions))]
fn web_launch_command(app: &AppHandle, node: &Path) -> Result<Command, String> {
    if let Ok(bin) = std::env::var("POWERI_WEB_BIN") {
        let mut c = Command::new(&bin);
        if let Ok(args) = std::env::var("POWERI_WEB_ARGS") {
            c.args(args.split_whitespace());
        }
        c.args(pi_web_launch_args());
        return Ok(c);
    }
    if let Some(bin) = crate::installer::installed_web_bin() {
        crate::logger::log_line(&format!("web source: cached ({})", bin.display()));
        let bin = bin
            .to_str()
            .ok_or_else(|| "pi-web bin 路径无效".to_string())?;
        #[cfg(unix)]
        let mut c = crate::env_detection::launcher(bin, node.parent());
        #[cfg(windows)]
        let mut c = crate::env_detection::base_launcher(bin);
        c.args(pi_web_launch_args());
        return Ok(c);
    }
    if let Some(bin) = crate::env_detection::system_web_bin() {
        crate::logger::log_line(&format!("web source: system ({})", bin.display()));
        #[cfg(unix)]
        let mut c = system_web_command(&bin);
        #[cfg(windows)]
        let mut c = crate::env_detection::base_launcher(
            bin.to_str()
                .ok_or_else(|| "系统 pi-web 路径无效".to_string())?,
        );
        c.args(pi_web_launch_args());
        return Ok(c);
    }
    let bin = crate::installer::ensure_web_installed(app, node)?;
    let bin = bin
        .to_str()
        .ok_or_else(|| "pi-web bin 路径无效".to_string())?;
    crate::logger::log_line(&format!("web source: downloaded ({bin})"));
    #[cfg(unix)]
    let mut c = crate::env_detection::launcher(bin, node.parent());
    #[cfg(windows)]
    let mut c = crate::env_detection::base_launcher(bin);
    c.args(pi_web_launch_args());
    Ok(c)
}

/// Common arguments appended to every pi-web launch: suppress the browser
/// tab, pin the hostname (loopback / LAN) and port so the shell iframe and
/// the Rust readiness poll agree on where to find the server.
#[cfg(not(debug_assertions))]
fn pi_web_launch_args() -> Vec<String> {
    vec![
        "--no-open".into(),
        "-H".into(),
        crate::resolve_host(),
        "-p".into(),
        crate::resolve_port().to_string(),
    ]
}

pub(crate) fn is_port_open(port: u16) -> bool {
    TcpStream::connect(("127.0.0.1", port)).is_ok()
}

/// Path used to identify a running service as poweri-web: the product entry
/// route exists only in the PowerI fork (upstream pi-web 404s on it), so a
/// 2xx answer is a cheap positive identity signal.
const POWERI_IDENTITY_PATH: &str = "/poweri";

/// Status code of `GET http://127.0.0.1:{port}{path}`, or `None` when the
/// request could not be completed (refused, timeout, non-HTTP garbage).
/// Deliberately dependency-free: one tiny GET over TcpStream is all the
/// identity check needs, and it must never stall startup (3 s read cap).
fn http_get_status(port: u16, path: &str) -> Option<u16> {
    use std::io::{Read, Write};
    let mut stream = TcpStream::connect(("127.0.0.1", port)).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).ok()?;
    // The status line lands in the first response bytes; stop reading as
    // soon as we have a full line instead of draining the (possibly large)
    // body.
    let mut buf = [0u8; 1024];
    let mut got = 0usize;
    while got < buf.len() {
        let n = stream.read(&mut buf[got..]).ok()?;
        if n == 0 {
            break;
        }
        got += n;
        if buf[..got].iter().any(|&b| b == b'\n') {
            break;
        }
    }
    let head = String::from_utf8_lossy(&buf[..got]);
    head.split_whitespace().nth(1)?.parse::<u16>().ok()
}

/// True when the service already listening on `port` identifies as
/// poweri-web (its `/poweri` entry answers 2xx). Drives the start-time
/// reuse decision: a standalone poweri-web (the npm package runs on the
/// same default port) is safe to ride; anything else on the port is not.
#[cfg_attr(debug_assertions, allow(dead_code))]
pub(crate) fn is_poweri_web_serving(port: u16) -> bool {
    matches!(
        http_get_status(port, POWERI_IDENTITY_PATH),
        Some(status) if (200..300).contains(&status)
    )
}

/// Whether a web service reachable on `port` can be used as-is instead of
/// spawning one: the port is serving, and it is either this app's own spawn
/// (trusted) or an external service that identifies as poweri-web.
///
/// Both reuse entry points share this single decision: `start_internal` (the
/// start flow) and `server_status` (the shell's boot fast path). Without the
/// identity check on the fast path, any program that happened to listen on the
/// port would be loaded straight into the shell iframe.
///
/// Debug builds run the repo's dev servers on this port by construction, so an
/// external service is trusted without probing: a cold `next dev` compile can
/// hang `/poweri` for the probe's entire timeout.
pub(crate) fn reusable_web_on_port(app: &AppHandle, port: u16) -> bool {
    if !is_port_open(port) {
        return false;
    }
    if app.state::<ServerState>().pid.lock().unwrap().is_some() {
        return true;
    }
    #[cfg(debug_assertions)]
    let identified = true;
    #[cfg(not(debug_assertions))]
    let identified = is_poweri_web_serving(port);
    if identified {
        crate::logger::log_line(&format!(
            "reusable_web_on_port: riding external poweri-web on port {port} \
             (not spawned by this app)"
        ));
    }
    identified
}

#[cfg(unix)]
pub(crate) fn kill_process_group(pid: u32) {
    unsafe {
        libc::kill(-(pid as i32), libc::SIGTERM);
    }
    std::thread::sleep(Duration::from_millis(400));
    unsafe {
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
}

#[cfg(not(unix))]
pub(crate) fn kill_process_group(pid: u32) {
    let mut c = std::process::Command::new("taskkill");
    c.args(["/PID", &pid.to_string(), "/T", "/F"]);
    crate::env_detection::hide_console(&mut c);
    let _ = c.status();
}

pub(crate) fn start_internal(app: &AppHandle) -> Result<Status, String> {
    {
        let state = app.state::<ServerState>();
        if state.pid.lock().unwrap().is_some() {
            return Ok(status_of(true));
        }
    }

    // Port already serving? Reuse it only when it identifies as poweri-web
    // (`reusable_web_on_port`): a previous PowerI instance, or a standalone
    // poweri-web started outside the app (the npm package defaults to this
    // same port). Anything else on our port must never be loaded into the
    // shell, and spawning a duplicate would fail with EADDRINUSE anyway — so
    // fail with an actionable message instead.
    let port = crate::resolve_port();
    if reusable_web_on_port(app, port) {
        let _ = app.emit("server:ready", ());
        return Ok(status_of(true));
    }
    #[cfg(not(debug_assertions))]
    if is_port_open(port) {
        let message = format!(
            "PORT_OCCUPIED: 端口 {port} 已被其他程序占用（未识别为 poweri-web）；\
             请在设置中更换端口，或结束占用进程后重试"
        );
        crate::logger::log_line(&format!("start_internal: {message}"));
        return Err(message);
    }

    #[cfg(not(debug_assertions))]
    {
        // Fail fast with a clear message when the Node pi-web would use is
        // too old for the shell (`node:zlib` zstd needs ≥ 22.5), instead of
        // surfacing the loader errors from inside pi-web. The chosen node
        // also drives the cached-install launch, so the precheck and the
        // spawn agree.
        let (_, node) = crate::env_detection::check_node_requirement()?;
        let mut cmd = web_launch_command(app, &node)?;
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }

        let mut child = cmd.spawn().map_err(|e| format!("SPAWN_FAILED: 无法启动 pi-web：{e}"))?;
        let pid = child.id();
        crate::logger::log_line(&format!(
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
                if is_port_open(crate::resolve_port()) {
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
                    // Release the pid so a retry can re-spawn, and kill the
                    // zombie child so it does not linger holding resources.
                    #[cfg(not(debug_assertions))]
                    {
                        let pid = app.state::<ServerState>().pid.lock().unwrap().take();
                        if let Some(pid) = pid {
                            kill_process_group(pid);
                        }
                    }
                    let _ = app.emit("server:timeout", ());
                    return;
                }
                std::thread::sleep(Duration::from_millis(250));
            }
        });
    }

    Ok(status_of(true))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn web_source_as_str_matches_expected_labels() {
        assert_eq!(WebSource::Override.as_str(), "override");
        assert_eq!(WebSource::System.as_str(), "system");
        assert_eq!(WebSource::Cached.as_str(), "cached");
        assert_eq!(WebSource::Missing.as_str(), "missing");
        assert_eq!(WebSource::Local.as_str(), "local");
    }

    #[test]
    fn status_of_reports_current_port_and_url() {
        let s = status_of(false);
        assert!(!s.running);
        assert_eq!(s.port, crate::resolve_port());
        assert_eq!(s.url, format!("http://127.0.0.1:{}", crate::resolve_port()));
    }

    #[cfg(debug_assertions)]
    #[test]
    fn debug_web_source_is_local() {
        assert!(matches!(web_source(), WebSource::Local));
    }

    /// Mock process: spawn a long-running `sleep` as its own process group
    /// leader, then verify kill_process_group tears the whole group down.
    #[cfg(unix)]
    #[test]
    fn kill_process_group_terminates_spawned_group() {
        use std::os::unix::process::CommandExt;

        let mut cmd = std::process::Command::new("sleep");
        cmd.arg("300");
        cmd.process_group(0); // child becomes its own group leader
        let mut child = cmd.spawn().expect("spawn mock sleep");
        let pid = child.id();

        // Group exists while the process is alive.
        let alive = unsafe { libc::kill(-(pid as i32), 0) };
        assert_eq!(alive, 0, "process group should exist after spawn");

        kill_process_group(pid);
        let _ = child.wait(); // reap the zombie so the group is gone

        let alive = unsafe { libc::kill(-(pid as i32), 0) };
        assert_eq!(alive, -1, "process group should be gone after kill");
    }

    /// is_port_open polls a TCP port; verify it sees a listener. The
    /// "closed after drop" half is intentionally not asserted: `bind :0`
    /// ports are immediately reusable and a parallel test may grab the same
    /// port, making that assertion racy.
    #[test]
    fn is_port_open_tracks_listener_lifecycle() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        assert!(is_port_open(port), "listening port should read as open");
    }

    /// Serve one canned byte response on an OS-assigned port; returns the
    /// port. The responder reads the probe's request line first (so its own
    /// write can't block on an unread socket), then answers once.
    fn serve_one(response: &'static str) -> u16 {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        std::thread::spawn(move || {
            use std::io::{Read as _, Write as _};
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 256];
                let _ = stream.read(&mut buf);
                let _ = stream.write_all(response.as_bytes());
            }
        });
        port
    }

    /// A 2xx on the /poweri entry route is the positive identity signal:
    /// the probe must accept it for reuse.
    #[test]
    fn identity_probe_accepts_poweri_web_entry() {
        let port = serve_one("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n");
        assert!(is_poweri_web_serving(port), "2xx /poweri = poweri-web");
    }

    /// Upstream pi-web (and any foreign service) does not serve /poweri:
    /// 404 and non-HTTP garbage must both read as "not poweri-web".
    #[test]
    fn identity_probe_rejects_foreign_services() {
        let not_found = serve_one("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
        assert!(!is_poweri_web_serving(not_found), "404 /poweri ≠ poweri-web");
        let garbage = serve_one("NOT-HTTP at all\r\n");
        assert!(!is_poweri_web_serving(garbage), "non-HTTP reply ≠ poweri-web");
    }

    /// Write `<root>/node_modules/@poweri/poweri-web/{bin/pi-web.js,
    /// package.json}` — the npm layout `version_from_bin` walks up from the
    /// resolved bin to find. Returns the bin path.
    fn write_versioned_package(root: &Path, version: &str) -> PathBuf {
        let pkg = root.join("node_modules").join("@poweri").join("pi-web");
        let bin = pkg.join("bin").join("pi-web.js");
        std::fs::create_dir_all(bin.parent().unwrap()).unwrap();
        std::fs::write(&bin, "#!/usr/bin/env node\n").unwrap();
        std::fs::write(
            pkg.join("package.json"),
            format!(r#"{{"name":"@poweri/poweri-web","version":"{version}"}}"#),
        )
        .unwrap();
        bin
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("poweri-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn version_from_bin_walks_up_to_package_json() {
        let dir = temp_dir("verbin");
        let bin = write_versioned_package(&dir, "9.9.9");

        assert_eq!(version_from_bin(&bin).as_deref(), Some("9.9.9"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn version_from_bin_returns_none_without_package_json() {
        let dir = temp_dir("verbin-none");
        let bin = dir.join("bin").join("pi-web.js");
        std::fs::create_dir_all(bin.parent().unwrap()).unwrap();
        std::fs::write(&bin, "x").unwrap();

        assert_eq!(version_from_bin(&bin), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The Windows seam from the work order: npm installs `.cmd` shims in
    /// `node_modules/.bin` that never canonicalize to the JS entry they run,
    /// so `version_from_bin` must parse the shim's `%dp0%` target. Modeled
    /// on the real npm-generated shim format (the `SET dp0=%~dp0` variable
    /// form). Runs only on the Windows CI leg.
    #[cfg(windows)]
    #[test]
    fn version_from_bin_resolves_through_cmd_shim_on_windows() {
        let dir = temp_dir("verbin-cmd");
        let real_bin = write_versioned_package(&dir, "7.7.7");
        let shim_dir = dir.join("node_modules").join(".bin");
        std::fs::create_dir_all(&shim_dir).unwrap();
        let shim = shim_dir.join("pi-web.cmd");
        std::fs::write(
            &shim,
            "@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST \"%dp0%\\node.exe\" (\r\n  SET \"_prog=%dp0%\\node.exe\"\r\n) ELSE (\r\n  SET \"_prog=node\"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & \"%_prog%\"  \"%dp0%\\..\\@poweri\\pi-web\\bin\\pi-web.js\" %*\r\n",
        )
        .unwrap();

        // The shim must resolve to the real entry's package version even
        // though the shim file itself sits outside the package tree.
        assert_eq!(version_from_bin(&shim).as_deref(), Some("7.7.7"));
        assert!(real_bin.is_file());

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Windows branch of `kill_process_group` runs `taskkill /T /F`. Spawn a
    /// long-running `cmd` tree (ping is the classic Windows sleep), kill the
    /// group, and assert the child actually exits — bounded by a 10 s
    /// timeout so a broken taskkill path fails loudly instead of hanging the
    /// suite. Runs only on the Windows CI leg.
    #[cfg(windows)]
    #[test]
    fn kill_process_group_terminates_spawned_cmd_tree() {
        use std::sync::mpsc;

        let mut child = std::process::Command::new("cmd")
            .args(["/C", "ping", "-n", "300", "127.0.0.1"])
            .spawn()
            .expect("spawn mock cmd");
        let pid = child.id();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let _ = child.wait();
            let _ = tx.send(());
        });

        kill_process_group(pid);

        match rx.recv_timeout(Duration::from_secs(10)) {
            Ok(()) => {}
            Err(_) => panic!("taskkill did not terminate the spawned process tree"),
        }
    }
}
