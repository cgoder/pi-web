//! Environment detection: Node / npm / fnm / nvm / PATH probing and the
//! Node version precheck that decides whether pi-web can run.
//!
//! GUI-launched processes (Finder/Dock on macOS, Start Menu on Windows)
//! carry a minimal PATH, so nothing here relies on `Command::new("npm")`
//! resolving on its own — every lookup probes the known fnm environments,
//! the Homebrew/nodejs.org/nvm install dirs and `npm prefix -g` before
//! falling back to a plain PATH lookup.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Known fnm binary locations probed before falling back to PATH lookup,
/// so Finder/Dock launches (which carry a minimal PATH) still find the
/// node-family tools and a system-wide pi-web on the fnm-managed Node.
const FNM_CANDIDATES: [&str; 3] = [
    "/opt/homebrew/bin/fnm",
    "/opt/homebrew/opt/fnm/bin/fnm",
    "/usr/local/bin/fnm",
];

/// Minimum Node.js the pi-web package actually runs on: its compiled code
/// imports `node:zlib` zstd APIs (added in 22.5) and uses
/// `Promise.withResolvers` (22.0), so anything below 22.5 fails plugin
/// loading with cryptic loader errors. The docs recommend ≥ 22.19.
#[cfg(not(debug_assertions))]
const MIN_NODE_VERSION: (u32, u32) = (22, 5);

/// OS home directory, honoring Windows' USERPROFILE (HOME is unset there).
pub(crate) fn home_dir() -> Option<PathBuf> {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()
        .map(PathBuf::from)
}

/// Compare dotted numeric versions (`24.19.0 > 8.0.0`) without semver
/// parsing; used to pick the newest node under nvm and the newest pi-cwd
/// directory.
pub(crate) fn version_cmp(a: &str, b: &str) -> std::cmp::Ordering {
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

/// Parse `node --version` output (`v22.19.0`) into (major, minor).
#[cfg_attr(debug_assertions, allow(dead_code))]
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
pub(crate) fn check_node_requirement() -> Result<(String, PathBuf), String> {
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
        crate::logger::log_line(&format!("node precheck: {v} at {}", bin.display()));
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

/// Find a binary by probing PATH, the fnm-managed environment, the known
/// Homebrew directories, nvm installs, and `npm prefix -g`. GUI-launched
/// macOS processes carry a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`),
/// so a plain `Command::new("npm")` would fail even when Node is installed.
#[cfg(not(debug_assertions))]
pub(crate) fn find_bin(name: &str) -> Option<PathBuf> {
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
pub(crate) fn launcher(bin: &str, node_dir: Option<&Path>) -> Command {
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
/// (see process_manager::web_launch_command), so this wrapper is
/// Windows-only.
#[cfg(windows)]
#[cfg_attr(debug_assertions, allow(dead_code))]
pub(crate) fn base_launcher(bin: &str) -> Command {
    let mut c = Command::new("cmd");
    c.args(["/C", bin]);
    augment_path_with_node(&mut c);
    hide_console(&mut c);
    c
}

/// Locate a system-wide pi-web executable (e.g. `npm install -g
/// @agegr/pi-web`) so a globally installed pi-web stays the single source
/// of truth. The GUI-launched process may carry a minimal PATH (Finder/Dock
/// launches), so the search probes, in order: the current PATH, the
/// fnm-resolved environment `base_launcher` would use, the well-known npm
/// global bin directories for Node installs fnm does not manage (Homebrew /
/// nodejs.org / nvm), and the user's configured `npm prefix -g`.
pub(crate) fn system_web_bin() -> Option<PathBuf> {
    #[cfg(unix)]
    {
        probe_command(&["sh", "-c", "command -v pi-web || true"])
            .or_else(probe_fnm_env)
            .or_else(probe_fnm_roots)
            .or_else(|| probe_known_dir("/opt/homebrew/bin/pi-web"))
            .or_else(|| probe_known_dir("/usr/local/bin/pi-web"))
            .or_else(probe_nvm_dirs)
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

#[cfg(windows)]
pub(crate) fn hide_console(c: &mut Command) {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_cmp_orders_dotted_numbers() {
        use std::cmp::Ordering;
        assert_eq!(version_cmp("24.19.0", "8.0.0"), Ordering::Greater);
        assert_eq!(version_cmp("8.0.0", "24.19.0"), Ordering::Less);
        assert_eq!(version_cmp("22.5.0", "22.5.0"), Ordering::Equal);
        assert_eq!(version_cmp("22", "22.0.1"), Ordering::Less);
        assert_eq!(version_cmp("22.10.0", "22.9.9"), Ordering::Greater);
    }

    #[test]
    fn parse_node_version_handles_v_prefix_and_whitespace() {
        assert_eq!(parse_node_version("v22.19.0"), Some((22, 19)));
        assert_eq!(parse_node_version("  v22.19.0\n"), Some((22, 19)));
        assert_eq!(parse_node_version("22.19.0"), None);
        assert_eq!(parse_node_version("v22"), None);
        assert_eq!(parse_node_version("vabc.def"), None);
        assert_eq!(parse_node_version(""), None);
    }

    #[test]
    fn newest_version_bin_picks_numerically_newest_version_dir() {
        let root = std::env::temp_dir().join(format!("poweri-test-fnm-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let versions = root.join("node-versions");
        for v in ["v16.20.0", "v24.3.1"] {
            let bin = versions
                .join(v)
                .join("installation")
                .join("bin")
                .join("node");
            std::fs::create_dir_all(bin.parent().unwrap()).unwrap();
            std::fs::write(&bin, "x").unwrap();
        }

        let found = newest_version_bin(&versions, "installation", "node");
        assert_eq!(
            found,
            Some(
                versions
                    .join("v24.3.1")
                    .join("installation")
                    .join("bin")
                    .join("node")
            )
        );

        let _ = std::fs::remove_dir_all(&root);
    }
}
