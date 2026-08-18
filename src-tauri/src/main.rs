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
/// Windows-only base launcher: GUI-launched processes may inherit a stale
/// PATH (Node.js not visible), and Rust's Command::new("npx") cannot
/// resolve the npx.cmd batch shim the way cmd.exe does. So run through
/// "cmd /C npx ..." — exactly like a user typing it in a terminal — and
/// merge the standard Node.js install directories into PATH as a safety
/// net. The console is kept hidden so no cmd window flashes up.
/// On unix, cached installs run under the precheck-chosen node instead
/// (see web_launch_command), so this wrapper is Windows-only.
#[cfg(windows)]
#[cfg_attr(debug_assertions, allow(dead_code))]
fn base_launcher(bin: &str) -> Command {
    let mut c = Command::new("cmd");
    c.args(["/C", bin]);
    augment_path_with_node(&mut c);
    hide_console(&mut c);
    c
}

/// Find a binary by probing PATH, the fnm-managed environment, the known
/// Homebrew directories, nvm installs, and `npm prefix -g`. GUI-launched
/// macOS processes carry a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`),
/// so a plain `Command::new("npm")` would fail even when Node is installed.
#[cfg(not(debug_assertions))]
fn find_bin(name: &str) -> Option<PathBuf> {
    #[cfg(unix)]
    {
        // Current PATH (works when launched from a terminal).
        if let Some(p) = probe_command(&["sh", "-c", &format!("command -v {name} || true")]) {
            return Some(p);
        }
        // fnm-managed environment.
        for fnm in FNM_CANDIDATES {
            if Path::new(fnm).is_file() {
                if let Some(p) =
                    probe_command(&[fnm, "exec", "--using", "default", "--", "sh", "-c", &format!("command -v {name} || true")])
                {
                    return Some(p);
                }
            }
        }
        // fnm data roots.
        if let Some(home) = home_dir() {
            for root in [
                home.join(".fnm"),
                home.join(".local").join("share").join("fnm"),
            ] {
                // Multiple node versions live under node-versions/ and
                // read_dir order is arbitrary — the numerically newest
                // must win, never a stale v16/v18.
                if let Some(bin) = newest_version_bin(&root.join("node-versions"), "installation", name) {
                    return Some(bin);
                }
                let alias = root.join("aliases").join("default").join("bin").join(name);
                if alias.is_file() { return Some(alias); }
            }
            // nvm
            let nvm = home.join(".nvm").join("versions").join("node");
            if let Some(bin) = newest_version_bin(&nvm, "", name) {
                return Some(bin);
            }
        }
        // Well-known dirs.
        for dir in ["/opt/homebrew/bin", "/usr/local/bin"] {
            let bin = PathBuf::from(dir).join(name);
            if bin.is_file() { return Some(bin); }
        }
        None
    }
    #[cfg(windows)]
    {
        // `where` through cmd with augmented PATH.
        let mut c = Command::new("cmd");
        c.args(["/C", "where", name]);
        augment_path_with_node(&mut c);
        hide_console(&mut c);
        let out = c.output().ok()?;
        if !out.status.success() { return None; }
        let text = String::from_utf8_lossy(&out.stdout);
        text.lines().next().filter(|l| !l.is_empty()).map(PathBuf::from)
    }
}

/// Build a `Command` for `bin`, prepending `node_dir` to the child PATH so
/// the `#!/usr/bin/env node` shebang resolves to the matching Node (fnm /
/// nvm / Homebrew / nodejs.org).
#[cfg(not(debug_assertions))]
fn launcher(bin: &str, node_dir: Option<&Path>) -> Command {
    let mut c = Command::new(bin);
    if let Some(dir) = node_dir {
        let dir = dir.to_string_lossy().to_string();
        let path = match std::env::var("PATH") {
            Ok(p) if !p.is_empty() => format!("{dir}:{p}"),
            _ => dir,
        };
        c.env("PATH", path);
    }
    c
}

/// Minimum Node.js the pi-web package actually runs on: its compiled code
/// imports `node:zlib` zstd APIs (added in 22.5) and uses
/// `Promise.withResolvers` (22.0), so anything below 22.5 fails plugin
/// loading with cryptic loader errors. The docs recommend ≥ 22.19.
#[cfg(not(debug_assertions))]
const MIN_NODE_VERSION: (u32, u32) = (22, 5);

/// Parse `node --version` output (`v22.19.0`) into (major, minor).
#[cfg(not(debug_assertions))]
fn parse_node_version(v: &str) -> Option<(u32, u32)> {
    let s = v.trim().strip_prefix('v')?;
    let mut it = s.split('.');
    let major = it.next()?.parse().ok()?;
    let minor = it.next()?.parse().ok()?;
    Some((major, minor))
}

/// Every plausible node binary on this machine, in probe order: PATH,
/// each fnm candidate's default env, Homebrew, nodejs.org, the newest
/// nvm version, the newest legacy-fnm (~/.fnm) version. The version
/// precheck walks this list and uses the first one that reports ≥ 22.5 —
/// a stale fnm default must never beat a user's nvm v24 just because the
/// fnm branch sorts first.
#[cfg(all(unix, not(debug_assertions)))]
fn node_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    let probe = |args: &[&str]| -> Option<PathBuf> {
        let ok = Command::new(args[0]).args(&args[1..]).output().ok()?;
        if !ok.status.success() {
            return None;
        }
        let line = String::from_utf8_lossy(&ok.stdout);
        let line = line.trim();
        if line.is_empty() {
            return None;
        }
        Path::new(line).is_file().then(|| PathBuf::from(line))
    };
    let which = "command -v node || true";
    if let Some(p) = probe(&["sh", "-c", which]) {
        out.push(p);
    }
    for fnm in FNM_CANDIDATES {
        if Path::new(fnm).is_file() {
            if let Some(p) =
                probe(&[fnm, "exec", "--using", "default", "--", "sh", "-c", which])
            {
                out.push(p);
            }
        }
    }
    for dir in ["/opt/homebrew/bin", "/usr/local/bin"] {
        let p = Path::new(dir).join("node");
        if p.is_file() {
            out.push(p);
        }
    }
    if let Some(nvm) = home_dir().map(|h| h.join(".nvm").join("versions").join("node")) {
        if let Some(p) = newest_version_bin(&nvm, "", "node") {
            out.push(p);
        }
    }
    if let Some(fnm) = home_dir().map(|h| h.join(".fnm").join("node-versions")) {
        if let Some(p) = newest_version_bin(&fnm, "installation", "node") {
            out.push(p);
        }
    }
    out
}

#[cfg(all(windows, not(debug_assertions)))]
fn node_candidates() -> Vec<PathBuf> {
    find_bin("node").into_iter().collect()
}

/// Verify the Node pi-web would run with meets the pi-web requirement,
/// so an old Node fails with a clear message instead of the loader errors
/// (`node:zlib` zstd / `Promise.withResolvers`) that surface as "plugin
/// tree failed to load" from inside the shell. Walks every candidate node
/// and returns (version, chosen node path) of the first one that reports
/// ≥ 22.5.
#[cfg(not(debug_assertions))]
fn check_node_requirement() -> Result<(String, PathBuf), String> {
    let mut best: Option<(u32, u32)> = None; // highest seen, for the error message
    let mut best_version = String::new();
    let mut tried = 0usize;
    let mut seen = std::collections::HashSet::new();
    for bin in node_candidates() {
        if !seen.insert(bin.clone()) {
            continue;
        }
        tried += 1;
        let Ok(out) = Command::new(&bin).arg("--version").output() else {
            continue;
        };
        if !out.status.success() {
            continue;
        }
        let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let Some(nums) = parse_node_version(&v) else {
            continue;
        };
        if nums < MIN_NODE_VERSION {
            if best.is_none_or(|b| nums > b) {
                best = Some(nums);
                best_version = v.clone();
            }
            continue;
        }
        log_line(&format!("node precheck: {v} at {}", bin.display()));
        return Ok((v, bin));
    }
    if tried == 0 {
        return Err(
            "NODE_NOT_FOUND: 未找到 Node.js：请先安装 Node.js ≥ 22.5（推荐 22.19+，nodejs.org，或 fnm / nvm / Homebrew）".to_string(),
        );
    }
    let v = if best_version.is_empty() {
        "未知版本".to_string()
    } else {
        best_version
    };
    Err(format!(
        "NODE_TOO_OLD: 检测到 Node.js {v}，pi-web 需要 Node.js ≥ 22.5（依赖 node:zlib zstd 与 \
         Promise.withResolvers）。请升级后重试：fnm install 22 / nvm install 22 / brew install node"
    ))
}

/// Return the `name` bin under the numerically-newest version dir of a
/// version-manager layout (`<root>/<vX>/<sub>/bin/<name>`) — nvm
/// (`~/.nvm/versions/node`) and legacy fnm (`~/.fnm/node-versions`) both
/// keep several node versions around and read_dir order is arbitrary, so
/// the newest wins (a stale v16/v18 must never beat an installed v22/v24).
fn newest_version_bin(root: &Path, sub: &str, name: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(root).ok()?;
    let mut versions: Vec<(String, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let dir = e.file_name().to_string_lossy().to_string();
            let bin = e.path().join(sub).join("bin").join(name);
            bin.is_file().then(|| (dir.trim_start_matches('v').to_string(), bin))
        })
        .collect();
    versions.sort_by(|a, b| version_cmp(&b.0, &a.0));
    versions.first().map(|(_, p)| p.clone())
}

/// Compare dotted numeric versions (`24.19.0 > 8.0.0`) without semver
/// parsing; used to pick the newest node under nvm.
fn version_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let pa: Vec<u64> = a.split('.').filter_map(|s| s.parse().ok()).collect();
    let pb: Vec<u64> = b.split('.').filter_map(|s| s.parse().ok()).collect();
    for i in 0..pa.len().max(pb.len()) {
        let x = pa.get(i).copied().unwrap_or(0);
        let y = pb.get(i).copied().unwrap_or(0);
        if x != y {
            return x.cmp(&y);
        }
    }
    std::cmp::Ordering::Equal
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
/// direct filesystem probe covers both roots unconditionally. When a root
/// holds several node versions, the numerically newest wins (read_dir
/// order is arbitrary; a stale v16/v18 must never beat an installed
/// v22/v24).
fn probe_fnm_roots() -> Option<PathBuf> {
    let home = home_dir()?;
    let roots = [
        home.join(".fnm"),
        home.join(".local").join("share").join("fnm"),
    ];
    for root in roots {
        if let Some(bin) = newest_version_bin(&root.join("node-versions"), "installation", "pi-web") {
            return Some(bin);
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
/// Several node versions may be installed; the numerically newest wins.
fn probe_nvm_dirs() -> Option<PathBuf> {
    let nvm = home_dir()?.join(".nvm").join("versions").join("node");
    newest_version_bin(&nvm, "", "pi-web")
}

/// Resolve the user's configured npm global root via `npm prefix -g` and
/// report its bin (works for any custom prefix configuration).
/// Release builds run the resolved npm with its own bin dir prepended to
/// PATH, so GUI launches (minimal PATH) still find npm and the fnm
/// wrapper never runs npm under the wrong Node for nvm/Homebrew installs;
/// debug builds run on the developer's machine with a full PATH.
fn probe_npm_prefix() -> Option<PathBuf> {
    #[cfg(not(debug_assertions))]
    let out = {
        let npm = find_bin("npm")?;
        let dir = npm.parent()?;
        launcher(&npm.to_string_lossy(), Some(dir))
            .args(["prefix", "-g"])
            .output()
            .ok()?
    };
    #[cfg(debug_assertions)]
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

    // Windows npm installs place `.cmd` shims in `node_modules/.bin`; the
    // shim never canonicalizes to the JS entry it runs, so the walk below
    // would stop at `node_modules` and miss the package.json. Read the shim
    // and resolve the target it embeds (e.g. `"%dp0%\\..\\@agegr\\pi-web\\bin\\pi-web.js"`)
    // to the real entry before walking up.
    #[cfg(windows)]
    if bin.extension().and_then(|e| e.to_str()) == Some("cmd") {
        if let Ok(shim) = std::fs::read_to_string(&bin) {
            let rel = shim.lines().find_map(|l| {
                let l = l.trim();
                if !l.contains("%dp0%") || !l.contains("pi-web") {
                    return None;
                }
                // The target sits inside a quoted token: `"%dp0%\..\@agegr\pi-web\bin\pi-web.js"`.
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
///
/// 1. `POWERI_WEB_BIN` (+ optional whitespace-separated `POWERI_WEB_ARGS`)
///    — explicit override in any build.
/// 2. A system-wide pi-web on PATH (`npm install -g @agegr/pi-web`), so a
///    globally installed pi-web stays the single source of truth and PowerI
///    never downloads a duplicate copy.
/// 3. The pi-web npm package installed into `install_dir()`, downloading it
///    on first use with a visible banner.
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
    let bin = ensure_web_installed(app, node)?;
    let bin = bin
        .to_str()
        .ok_or_else(|| "pi-web bin 路径无效".to_string())?;
    log_line(&format!("web source: cached ({bin})"));
    #[cfg(unix)]
    let mut c = launcher(bin, node.parent());
    #[cfg(windows)]
    let mut c = base_launcher(bin);
    c.args(["--no-open"]);
    Ok(c)
}

/// Shared npm arguments that apply to every install/upgrade: `--json`
/// for parseable results, `--fetch-retries=0` for fast failure on network
/// errors (npm's default silent retry >60 s produces zero output),
/// `--loglevel=info` so stderr carries `npm http fetch` lines the shell
/// uses as download progress, and lockfile/audit noise suppressed.
/// `--legacy-peer-deps=false` pins the default peer-install behavior so a
/// user `~/.npmrc` with `legacy-peer-deps=true` (a common ERESOLVE
/// workaround) cannot silently skip the peerDependencies pi-web needs at
/// runtime.
#[cfg(not(debug_assertions))]
const NPM_COMMON: &[&str] = &[
    "--no-audit",
    "--no-fund",
    "--no-update-notifier",
    "--fetch-retries=0",
    "--no-save",
    "--no-package-lock",
    "--json",
    "--loglevel=info",
    "--legacy-peer-deps=false",
];

/// Error payload emitted with `web:install-failed`.
#[derive(Clone, serde::Serialize)]
#[cfg(not(debug_assertions))]
struct InstallError {
    code: String,
    summary: String,
}

/// Extract the installed `PACKAGE` version from an npm `--json` install
/// result (`{"add":[{"name","version",...}]}`). The `add` array order is
/// npm's internal order, so match by `name` — never trust `add[0]`.
#[cfg(not(debug_assertions))]
fn extract_installed_version(json: &str) -> String {
    serde_json::from_str::<Value>(json)
        .ok()
        .as_ref()
        .and_then(|v| v.get("add"))
        .and_then(|a| a.as_array())
        .and_then(|add| {
            add.iter().find(|p| {
                p.get("name").and_then(|n| n.as_str()) == Some(PACKAGE)
            })
        })
        .and_then(|p| p.get("version"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string()
}

/// Extract the npm error code and human-readable detail from a failed
/// `--json` install (`{"error":{"code","summary","detail"}}`). Prefer
/// `detail` (it carries the network/permission guidance text).
#[cfg(not(debug_assertions))]
fn extract_install_error(json: &str) -> (String, String) {
    match serde_json::from_str::<Value>(json) {
        Ok(v) => {
            let err = v.get("error");
            let code = err
                .and_then(|e| e.get("code"))
                .and_then(|c| c.as_str())
                .unwrap_or("UNKNOWN")
                .to_string();
            let summary = err
                .and_then(|e| e.get("detail").or_else(|| e.get("summary")))
                .and_then(|s| s.as_str())
                .unwrap_or("")
                .to_string();
            (code, summary)
        }
        Err(_) => ("UNKNOWN".to_string(), "安装失败，无更多信息".to_string()),
    }
}

/// Spawn npm (via the fnm-aware base launcher). stdout is the `--json` big
/// document — only collected for parsing, never forwarded (otherwise the
/// CLI log is 500+ lines of JSON). Progress goes through stderr (fetch
/// lines), results through `web:installed` / `web:install-failed` events.
/// `node` is the node the version precheck chose: npm runs under it so a
/// stale system npm (e.g. node 14 / npm 6 from nodejs.org) can never
/// execute the install.
#[cfg(not(debug_assertions))]
fn run_npm(app: &AppHandle, node: &Path, args: &[String], timeout: Duration) -> Result<(), String> {
    // Prefer the npm that ships next to the precheck-chosen node; fall
    // back to the probe chain (fnm, nvm, Homebrew, PATH) when that node
    // has no npm of its own.
    let node_dir = node.parent();
    let npm = node_dir
        .map(|d| d.join(if cfg!(windows) { "npm.cmd" } else { "npm" }))
        .filter(|p| p.is_file())
        .or_else(|| find_bin("npm"))
        .ok_or_else(|| {
            "NPM_NOT_FOUND: 未找到 npm：请先安装 Node.js ≥ 22.5（nodejs.org，或 fnm / nvm / Homebrew）".to_string()
        })?;
    let mut cmd = launcher(&npm.to_string_lossy(), node.parent());
    cmd.args(args);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(unix)]
    {
        cmd.process_group(0);
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("INSTALL_FAILED: 无法启动 npm：{e}"))?;

    // Collect stdout (the --json blob) for parsing after exit.
    let collected = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    let mut readers = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        let collected = collected.clone();
        readers.push(std::thread::spawn(move || {
            for l in BufReader::new(stdout).lines().map_while(Result::ok) {
                let mut buf = collected.lock().unwrap();
                buf.push_str(&l);
                buf.push('\n');
            }
        }));
    }
    // Forward stderr (fetch lines = progress) to the log panel.
    if let Some(stderr) = child.stderr.take() {
        let app = app.clone();
        std::thread::spawn(move || {
            for l in BufReader::new(stderr).lines().map_while(Result::ok) {
                let _ = app.emit("server:stderr", l);
            }
        });
    }

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                // Child exited → stdout pipe is at EOF; join the reader so the
                // final JSON line is collected before we parse.
                for h in readers.drain(..) {
                    let _ = h.join();
                }
                let json = collected.lock().unwrap().clone();
                if status.success() {
                    let _ = app.emit("web:installed", extract_installed_version(&json));
                    return Ok(());
                }
                let (code, summary) = extract_install_error(&json);
                let _ = app.emit(
                    "web:install-failed",
                    InstallError {
                        code: code.clone(),
                        summary: summary.clone(),
                    },
                );
                return Err(format!(
                    "INSTALL_FAILED: npm {} 失败（退出码 {:?}）：{}",
                    args.join(" "),
                    status.code(),
                    if summary.is_empty() { code } else { summary }
                ));
            }
            Ok(None) => {}
            Err(e) => return Err(format!("等待 npm 退出失败：{e}")),
        }
        if started.elapsed() >= timeout {
            kill_process_group(child.id());
            let _ = app.emit(
                "web:install-failed",
                InstallError {
                    code: "TIMEOUT".to_string(),
                    summary: format!("安装超时（{}s），已终止", timeout.as_secs()),
                },
            );
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
/// starts reuse it. Emits `web:installing` before the download and
/// `web:installed` / `web:install-failed` (from `run_npm`) with the result.
/// `node` is the node the caller's version precheck chose; it drives the
/// npm invocation so the precheck and the spawn agree.
#[cfg(not(debug_assertions))]
fn ensure_web_installed(app: &AppHandle, node: &Path) -> Result<PathBuf, String> {
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
    let mut args: Vec<String> = vec![
        "install".to_string(),
        "--prefix".to_string(),
        prefix.to_string(),
    ];
    args.extend(NPM_COMMON.iter().map(|s| s.to_string()));
    args.push(PACKAGE.to_string());
    run_npm(app, node, &args, INSTALL_TIMEOUT)?;
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
        // Fail fast with a clear message when the Node pi-web would use is
        // too old for the shell (`node:zlib` zstd needs ≥ 22.5), instead of
        // surfacing the loader errors from inside pi-web. The chosen node
        // also drives the cached-install launch, so the precheck and the
        // spawn agree.
        let (_, node) = check_node_requirement()?;
        let mut cmd = web_launch_command(app, &node)?;
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }

        let mut child = cmd.spawn().map_err(|e| format!("SPAWN_FAILED: 无法启动 pi-web：{e}"))?;
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

/// Start (or reuse) the pi-web server. Must be `async` + `spawn_blocking`
/// because `start_internal` may run a 300 s npm install on first use; a
/// synchronous command would freeze the Tauri main thread (macOS WebView
/// beach-ball) and progress events could never render.
#[tauri::command]
async fn start_server(app: AppHandle) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || start_internal(&app))
        .await
        .map_err(|e| format!("SPAWN_FAILED: 后台启动任务失败：{e}"))?
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

/// Restart the server: stop the owned process (if any), wait for the
/// port to free, then start again. Async for the same reason as
/// `start_server` — the restart may trigger a first-run download.
#[tauri::command]
async fn restart_server(app: AppHandle) -> Result<Status, String> {
    stop_server(app.clone());
    std::thread::sleep(Duration::from_millis(600));
    tauri::async_runtime::spawn_blocking(move || start_internal(&app))
        .await
        .map_err(|e| format!("SPAWN_FAILED: 后台重启任务失败：{e}"))?
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
        // Run the upgrade under the precheck-chosen node so npm matches the
        // validated runtime (a stale system npm could fail on native deps).
        let (_, node) = check_node_requirement()?;
        let dir = install_dir();
        let prefix = dir.to_str().unwrap_or_default();
        let _ = app.emit(
            "server:stdout",
            format!("$ npm install --prefix {prefix} {PACKAGE}@latest"),
        );
        let mut upgrade_args: Vec<String> = vec![
            "install".to_string(),
            "--prefix".to_string(),
            prefix.to_string(),
        ];
        upgrade_args.extend(NPM_COMMON.iter().map(|s| s.to_string()));
        upgrade_args.push(format!("{PACKAGE}@latest"));
        match run_npm(&app, &node, &upgrade_args, INSTALL_TIMEOUT) {
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
fn default_cwd() -> String {
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
            default_cwd,
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
