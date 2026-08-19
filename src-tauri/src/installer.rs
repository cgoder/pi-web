//! npm install logic for the pi-web package and parseable npm result/error
//! extraction. The package is installed into a fixed directory under the
//! user's home instead of being fetched with `npx` (see `install_dir`).

#[cfg(not(debug_assertions))]
use std::io::BufRead;
#[cfg(not(debug_assertions))]
use std::io::BufReader;
#[cfg(all(unix, not(debug_assertions)))]
use std::os::unix::process::CommandExt;
#[cfg(not(debug_assertions))]
use std::path::Path;
#[cfg(not(debug_assertions))]
use std::path::PathBuf;
#[cfg(not(debug_assertions))]
use std::process::Stdio;
use std::time::Duration;
#[cfg(not(debug_assertions))]
use std::time::Instant;

use serde_json::Value;
#[cfg(not(debug_assertions))]
use tauri::{AppHandle, Emitter};

/// The pi-web npm package PowerI installs, upgrades and reports the version
/// of.
pub(crate) const PACKAGE: &str = "@agegr/pi-web";

/// npm-install timeout for the first install and for upgrades. Downloads can
/// take minutes on slow networks; the readiness poll keeps the UI informed
/// during the wait.
#[cfg_attr(debug_assertions, allow(dead_code))]
pub(crate) const INSTALL_TIMEOUT: Duration = Duration::from_secs(300);

/// Shared npm arguments that apply to every install/upgrade: `--json`
/// for parseable results, `--fetch-retries=0` for fast failure on network
/// errors (npm's default silent retry >60 s produces zero output),
/// `--loglevel=info` so stderr carries `npm http fetch` lines the shell
/// uses as download progress, and lockfile/audit noise suppressed.
/// `--legacy-peer-deps=false` pins the default peer-install behavior so a
/// user `~/.npmrc` with `legacy-peer-deps=true` (a common ERESOLVE
/// workaround) cannot silently skip the peerDependencies pi-web needs at
/// runtime.
///
/// Kept compilable under debug builds (like `INSTALL_TIMEOUT`) so
/// `build_npm_args` — which embeds it — can be unit-tested by `cargo test`.
#[cfg_attr(debug_assertions, allow(dead_code))]
pub(crate) const NPM_COMMON: &[&str] = &[
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
#[cfg_attr(debug_assertions, allow(dead_code))]
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
#[cfg_attr(debug_assertions, allow(dead_code))]
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

/// The pi-web npm package is installed into a fixed directory under the
/// user's home instead of being fetched with `npx`. npm's exec runner has a
/// known bug (npm/cli#9870): it launches the package bin via `sh -c <bin>`
/// without adding the npx cache bin dir to PATH, so every `npx --yes <pkg>`
/// fails with "command not found". A dedicated `npm install --prefix` +
/// direct spawn of the installed bin path sidesteps the broken shim
/// entirely and keeps the "always fetch the latest npm release" behavior.
/// The directory is overridable so tests can point at throwaway prefixes.
#[cfg(not(debug_assertions))]
pub(crate) fn install_dir() -> PathBuf {
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
pub(crate) fn installed_web_bin() -> Option<PathBuf> {
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

/// Spawn npm (via the fnm-aware base launcher). stdout is the `--json` big
/// document — only collected for parsing, never forwarded (otherwise the
/// CLI log is 500+ lines of JSON). Progress goes through stderr (fetch
/// lines), results through `web:installed` / `web:install-failed` events.
/// `node` is the node the version precheck chose: npm runs under it so a
/// stale system npm (e.g. node 14 / npm 6 from nodejs.org) can never
/// execute the install.
#[cfg(not(debug_assertions))]
pub(crate) fn run_npm(app: &AppHandle, node: &Path, args: &[String], timeout: Duration) -> Result<(), String> {
    // Prefer the npm that ships next to the precheck-chosen node; fall
    // back to the probe chain (fnm, nvm, Homebrew, PATH) when that node
    // has no npm of its own.
    let node_dir = node.parent();
    let npm = node_dir
        .map(|d| d.join(if cfg!(windows) { "npm.cmd" } else { "npm" }))
        .filter(|p| p.is_file())
        .or_else(|| crate::env_detection::find_bin("npm"))
        .ok_or_else(|| {
            "NPM_NOT_FOUND: 未找到 npm：请先安装 Node.js ≥ 22.5（nodejs.org，或 fnm / nvm / Homebrew）".to_string()
        })?;
    let mut cmd = crate::env_detection::launcher(&npm.to_string_lossy(), node.parent());
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
            crate::process_manager::kill_process_group(child.id());
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

/// Build the full npm install argument list for `PACKAGE` into `prefix`.
///
/// On top of the shared `NPM_COMMON` flags this adds the size optimization:
/// - `--omit=dev`: pi-web runs `next start` (production mode) inside PowerI,
///   so its devDependencies are never needed at runtime. (npm does not
///   install a dependency's devDependencies anyway, so this is a cheap,
///   future-proof intent marker.)
/// - `--os=<platform> --cpu=<arch>`: pin npm to the current platform/arch.
///   npm ≥ 9 already skips optional native binaries that do not match the
///   host (e.g. only the matching `@next/swc-*` variant of `next` is ever
///   installed), so this is a zero-cost safety net against future deps whose
///   native variants are not filtered.
///
/// `--omit=optional` is deliberately NOT used: `next` declares its SWC
/// binary (`@next/swc-darwin-arm64` …) as an optionalDependency, and
/// `next start` still needs it to load `next.config.ts`. Empirically (issue
/// 20 "验证") omitting optional deps makes Next re-download + unpack the
/// binary at first boot (31 MB tarball into `~/Library/Caches/next-swc`,
/// 85 MB into `node_modules/next/next-swc-fallback`, ~10 s blocked boot,
/// network required at boot, outside PowerI's progress/timeout control) —
/// the size saving largely evaporates and first-run reliability regresses.
///
/// Argument order: `install --prefix <prefix> --omit=dev [--os] [--cpu]
/// <NPM_COMMON> <PACKAGE>`. Platform args are resolved at compile time with
/// `#[cfg]` so the shipped binary always matches the machine it runs on.
///
/// Not cfg-gated (only dead-code-allowed in debug) so `cargo test` can
/// assert the produced argument list; release behavior is identical.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn build_npm_args(prefix: &str) -> Vec<String> {
    let mut args = vec![
        "install".to_string(),
        "--prefix".to_string(),
        prefix.to_string(),
        "--omit=dev".to_string(),
    ];
    // Pin npm to the host platform/arch so only matching native binaries are
    // fetched (npm 9+; PowerI ships with npm ≥ 11).
    #[cfg(target_os = "macos")]
    args.push("--os=darwin".to_string());
    #[cfg(target_os = "windows")]
    args.push("--os=win32".to_string());
    #[cfg(target_os = "linux")]
    args.push("--os=linux".to_string());
    #[cfg(target_arch = "aarch64")]
    args.push("--cpu=arm64".to_string());
    #[cfg(target_arch = "x86_64")]
    args.push("--cpu=x64".to_string());
    args.extend(NPM_COMMON.iter().map(|s| s.to_string()));
    args.push(PACKAGE.to_string());
    args
}

/// Ensure the pi-web npm package is installed into the fixed directory.
/// First use downloads it (several minutes on slow networks); subsequent
/// starts reuse it. Emits `web:installing` before the download and
/// `web:installed` / `web:install-failed` (from `run_npm`) with the result.
/// `node` is the node the caller's version precheck chose; it drives the
/// npm invocation so the precheck and the spawn agree.
#[cfg(not(debug_assertions))]
pub(crate) fn ensure_web_installed(app: &AppHandle, node: &Path) -> Result<PathBuf, String> {
    if let Some(bin) = installed_web_bin() {
        return Ok(bin);
    }
    let dir = install_dir();
    let prefix = dir.to_str().ok_or_else(|| "安装目录路径无效".to_string())?;
    crate::logger::log_line(&format!("web source: missing -> downloading into {prefix}"));
    let _ = app.emit("web:installing", ());
    let _ = app.emit(
        "server:stdout",
        format!("$ npm install --prefix {prefix} {PACKAGE}"),
    );
    let args = build_npm_args(prefix);
    run_npm(app, node, &args, INSTALL_TIMEOUT)?;
    installed_web_bin().ok_or_else(|| format!("pi-web 已安装但未找到 bin：{}", dir.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_install_error_prefers_detail_over_summary() {
        let json = r#"{"error":{"code":"ERESOLVE","summary":"could not resolve","detail":"Conflicting peer dependency: @agegr/pi-web"}}"#;
        let (code, summary) = extract_install_error(json);
        assert_eq!(code, "ERESOLVE");
        assert_eq!(summary, "Conflicting peer dependency: @agegr/pi-web");
    }

    #[test]
    fn extract_install_error_falls_back_to_summary_and_unknown() {
        let json = r#"{"error":{"summary":"network down"}}"#;
        let (code, summary) = extract_install_error(json);
        assert_eq!(code, "UNKNOWN");
        assert_eq!(summary, "network down");
    }

    #[test]
    fn extract_install_error_handles_non_json() {
        let (code, summary) = extract_install_error("not json at all");
        assert_eq!(code, "UNKNOWN");
        assert!(summary.contains("安装失败"));
    }

    #[test]
    fn extract_installed_version_matches_package_by_name() {
        let json = r#"{"add":[{"name":"other","version":"1.0.0"},{"name":"@agegr/pi-web","version":"9.9.9"}]}"#;
        assert_eq!(extract_installed_version(json), "9.9.9");
    }

    #[test]
    fn extract_installed_version_unknown_when_package_missing() {
        let json = r#"{"add":[{"name":"other","version":"1.0.0"}]}"#;
        assert_eq!(extract_installed_version(json), "unknown");
    }

    #[test]
    fn build_npm_args_shape_and_order() {
        let args = build_npm_args("/tmp/prefix");
        assert_eq!(args.first().map(String::as_str), Some("install"));
        let prefix_at = args
            .iter()
            .position(|a| a == "--prefix")
            .expect("--prefix present");
        assert_eq!(args[prefix_at + 1], "/tmp/prefix");
        // Size optimization flags are always present.
        assert!(args.contains(&"--omit=dev".to_string()));
        // `--omit=optional` is deliberately absent: Next re-downloads its
        // SWC binary at first boot when omitted (see build_npm_args docs).
        assert!(!args.contains(&"--omit=optional".to_string()));
        // Platform/arch pins are always present, matching the build target.
        assert!(args.iter().any(|a| a.starts_with("--os=")));
        assert!(args.iter().any(|a| a.starts_with("--cpu=")));
        // NPM_COMMON flags are embedded before the package name.
        assert!(args.contains(&"--no-audit".to_string()));
        assert!(args.contains(&"--no-package-lock".to_string()));
        assert!(args.contains(&"--legacy-peer-deps=false".to_string()));
        assert_eq!(args.last().map(String::as_str), Some(PACKAGE));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn build_npm_args_os_is_darwin_on_macos() {
        let args = build_npm_args("/tmp/prefix");
        assert!(args.contains(&"--os=darwin".to_string()));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn build_npm_args_os_is_win32_on_windows() {
        let args = build_npm_args("/tmp/prefix");
        assert!(args.contains(&"--os=win32".to_string()));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn build_npm_args_os_is_linux_on_linux() {
        let args = build_npm_args("/tmp/prefix");
        assert!(args.contains(&"--os=linux".to_string()));
    }

    #[cfg(target_arch = "aarch64")]
    #[test]
    fn build_npm_args_cpu_is_arm64_on_aarch64() {
        let args = build_npm_args("/tmp/prefix");
        assert!(args.contains(&"--cpu=arm64".to_string()));
    }

    #[cfg(target_arch = "x86_64")]
    #[test]
    fn build_npm_args_cpu_is_x64_on_x86_64() {
        let args = build_npm_args("/tmp/prefix");
        assert!(args.contains(&"--cpu=x64".to_string()));
    }
}
