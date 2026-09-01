//! npm install logic for the pi-web package and parseable npm result/error
//! extraction. The package is installed into a fixed directory under the
//! user's home instead of being fetched with `npx` (see `install_dir`).

#[cfg(not(debug_assertions))]
use std::io::BufRead;
#[cfg(not(debug_assertions))]
use std::io::BufReader;
#[cfg(all(unix, not(debug_assertions)))]
use std::os::unix::process::CommandExt;
// Path/PathBuf/Command are used by the post-install health check, which is
// compiled in debug builds too (dead-code-allowed) so `cargo test` can cover
// it — hence not cfg-gated like the release-only npm runner below.
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(not(debug_assertions))]
use std::process::Stdio;
use std::time::Duration;
#[cfg(not(debug_assertions))]
use std::time::Instant;

use serde_json::Value;
#[cfg(not(debug_assertions))]
use tauri::{AppHandle, Emitter};

/// The PowerI web npm package the shell installs, upgrades and reports the
/// version of. This is the PowerI fork of pi-web (with the product layer),
/// published by the PowerI CI on `poweri-v*` tags.
pub(crate) const PACKAGE_NAME: &str = "@poweri/poweri-web";

/// npm install spec pinned to the shell version (Cargo.toml), so the web and
/// the shell always come from the same tag and an installed build is
/// reproducible. Upgrades (`upgrade_poweri`) deliberately use `@latest`.
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

/// Extract the installed `PACKAGE_NAME` version from an npm `--json` install
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
                p.get("name").and_then(|n| n.as_str()) == Some(PACKAGE_NAME)
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

/// True when the managed install dir contains the `PACKAGE_NAME` package
/// (as opposed to a stale package from an older shell — e.g. `pweb` — whose
/// `.bin/pi-web` shim would otherwise look installed).
fn managed_pkg_dir_present(install: &Path) -> bool {
    install
        .join("node_modules")
        .join(PACKAGE_NAME)
        .is_dir()
}

/// Absolute path of the installed pi-web bin, when present. On Windows npm
/// installs `.cmd` shims; the extensionless POSIX shim is not executable by
/// CreateProcess.
#[cfg(not(debug_assertions))]
pub(crate) fn installed_web_bin() -> Option<PathBuf> {
    // 校验安装目录里确实存在 `PACKAGE_NAME` 包：旧版 NPM 包（如 pweb，无
    // /poweri 入口路由）残留时 `.bin/pi-web` 仍然存在，升级壳后继续使用会
    // 404。包目录不匹配视为未安装，走首次下载路径自动安装正确包。
    if !managed_pkg_dir_present(&install_dir()) {
        return None;
    }
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

/// Resolve the npm executable for a precheck-chosen `node`: prefer the npm
/// that ships next to it, fall back to the probe chain (fnm, nvm, Homebrew,
/// PATH) when that node has no npm of its own. Shared by `run_npm` (installs
/// and upgrades) and the `check_update` version probe, so both always agree
/// on which npm — and therefore which registry config — they talk to.
pub(crate) fn npm_bin(node: &Path) -> Option<PathBuf> {
    node.parent()
        .map(|d| d.join(if cfg!(windows) { "npm.cmd" } else { "npm" }))
        .filter(|p| p.is_file())
        .or_else(|| crate::env_detection::find_bin("npm"))
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
    let npm = npm_bin(node).ok_or_else(|| {
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

/// The install spec for the PowerI web package, pinned to the shell
/// version: `@poweri/poweri-web@<Cargo.toml version>`.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn package_spec() -> String {
    format!("{PACKAGE_NAME}@{}", env!("CARGO_PKG_VERSION"))
}

/// Build the full npm install argument list for `PACKAGE_NAME` into `prefix`.
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
/// <NPM_COMMON> <PACKAGE_NAME>`. Platform args are resolved at compile time with
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
    args.push(package_spec());
    args
}

/// A verification failure from [`verify_installation`], reported after a
/// successful npm install so a corrupted install (interrupted download,
/// disk full, partial extraction) is caught before the first launch instead
/// of surfacing as a cryptic runtime error.
#[cfg_attr(debug_assertions, allow(dead_code))]
#[derive(Debug, PartialEq, Eq)]
enum HealthCheckError {
    /// One of the bin entry scripts shipped by the package is missing.
    MissingFile(PathBuf),
    /// Production build artifacts (`<pkg>/.next/BUILD_ID`) are missing.
    MissingBuild(PathBuf),
    /// `package.json` is unreadable or carries no `version` field.
    VersionUnreadable(PathBuf),
    /// The executability probe did not reach pi-web's argument parsing.
    ProbeFailed(String),
}

impl std::fmt::Display for HealthCheckError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingFile(p) => write!(f, "缺少关键文件：{}", p.display()),
            Self::MissingBuild(p) => write!(f, "缺少构建产物：{}", p.display()),
            Self::VersionUnreadable(p) => write!(f, "无法读取版本信息：{}", p.display()),
            Self::ProbeFailed(detail) => write!(f, "可执行性验证失败：{detail}"),
        }
    }
}

/// Successful health-check outcome: the verified pi-web version.
#[cfg_attr(debug_assertions, allow(dead_code))]
#[derive(Debug)]
struct HealthCheckOutcome {
    version: String,
}

/// Extract the `version` field from an installed pi-web `package.json`.
/// `None` when the file is not JSON or carries no version — the caller maps
/// that to [`HealthCheckError::VersionUnreadable`].
#[cfg_attr(debug_assertions, allow(dead_code))]
fn extract_package_version(json: &str) -> Option<String> {
    serde_json::from_str::<Value>(json)
        .ok()
        .as_ref()
        .and_then(|v| v.get("version"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

/// Root of the installed pi-web package inside `prefix`.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn package_dir(prefix: &Path) -> PathBuf {
    prefix.join("node_modules").join(PACKAGE_NAME)
}

/// Bin scripts the launcher requires at runtime, plus the production build
/// artifacts (`BUILD_ID` is written by `next build` and consumed by
/// `next start`). A partial extraction typically drops one of these.
#[cfg_attr(debug_assertions, allow(dead_code))]
const REQUIRED_BIN_FILES: [&str; 4] = [
    "bin/pi-web.js",
    "bin/pi-web-options.js",
    "bin/node-version.js",
    "bin/process-lifecycle.js",
];

/// Step 1 of the health check: every file pi-web needs to boot must exist.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn check_required_files(prefix: &Path) -> Result<(), HealthCheckError> {
    let pkg = package_dir(prefix);
    for rel in REQUIRED_BIN_FILES {
        let p = pkg.join(rel);
        if !p.is_file() {
            return Err(HealthCheckError::MissingFile(p));
        }
    }
    let build_id = pkg.join(".next").join("BUILD_ID");
    if !build_id.is_file() {
        return Err(HealthCheckError::MissingBuild(build_id));
    }
    Ok(())
}

/// Step 2 of the health check: the installed package version, read from its
/// own `package.json` (pi-web.js exposes no `--version` flag to query).
#[cfg_attr(debug_assertions, allow(dead_code))]
fn read_package_version(prefix: &Path) -> Result<String, HealthCheckError> {
    let pkg_json = package_dir(prefix).join("package.json");
    let text = std::fs::read_to_string(&pkg_json)
        .map_err(|_| HealthCheckError::VersionUnreadable(pkg_json.clone()))?;
    extract_package_version(&text)
        .ok_or(HealthCheckError::VersionUnreadable(pkg_json))
}

/// Cap probe stderr at 300 chars so a node stack trace never floods the
/// install-failed summary or the log file.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn truncate_stderr(stderr: &str) -> String {
    let s = stderr.trim();
    if s.chars().count() <= 300 {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(300).collect();
        out.push('…');
        out
    }
}

/// Step 3 of the health check — executability probe. `bin/pi-web.js` has
/// **no** `--version` flag: `parseArgs(strict: false)` (pi-web-options.js)
/// silently ignores unknown flags such as `--help`, and probing the launcher
/// normally would start `next start` and block forever. Instead the real
/// launcher is run with an invalid `--port` value: `normalizePort` throws
/// *before* any server starts, so a healthy install exits almost instantly
/// with code 1 and `Port must be a non-negative integer.` on stderr
/// (verified empirically against pi-web 0.8.9). One probe therefore proves
/// the node precheck passes, pi-web.js and its required sibling modules
/// load, and argument parsing works — everything that must be in place
/// before `next start` can boot.
///
/// `node` is the precheck-chosen node the cached install will run under, so
/// the probe and the real launch agree.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn probe_executable(node: &Path, piweb_js: &Path) -> Result<(), String> {
    let mut cmd = Command::new(node);
    #[cfg(windows)]
    crate::env_detection::hide_console(&mut cmd);
    cmd.arg(piweb_js).arg("--port").arg("not-a-port");
    let output = cmd
        .output()
        .map_err(|e| format!("无法启动 node 探针：{e}"))?;
    if output.status.success() {
        return Err("探针意外成功退出：pi-web 参数解析行为与预期不符".to_string());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stderr.contains("Port must be a non-negative integer.") {
        return Err(format!(
            "探针未到达参数解析（退出码 {:?}）：{}",
            output.status.code(),
            truncate_stderr(&stderr)
        ));
    }
    Ok(())
}

/// Run the health check with an injectable probe — tests pass a fake runner,
/// the real path uses [`probe_executable`].
#[cfg_attr(debug_assertions, allow(dead_code))]
fn verify_installation_with(
    prefix: &Path,
    run_probe: impl Fn(&Path) -> Result<(), String>,
) -> Result<HealthCheckOutcome, HealthCheckError> {
    check_required_files(prefix)?;
    let version = read_package_version(prefix)?;
    let piweb_js = package_dir(prefix).join("bin").join("pi-web.js");
    run_probe(&piweb_js).map_err(HealthCheckError::ProbeFailed)?;
    Ok(HealthCheckOutcome { version })
}

/// Verify a freshly installed pi-web package: critical files present,
/// version readable, and the launcher actually boots to argument parsing
/// under the precheck-chosen node. Called by `ensure_web_installed` right
/// after npm reports success.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn verify_installation(
    prefix: &Path,
    node: &Path,
) -> Result<HealthCheckOutcome, HealthCheckError> {
    verify_installation_with(prefix, |piweb_js| probe_executable(node, piweb_js))
}

// ---- post-install whitelist pruning (issue 25) ----
//
// After a successful `npm install` the installed tree is pruned with a
// white-list: only paths that classify into [`PruneCategory`] are deleted
// (source maps, type declarations, build caches, docs, incompatible-platform
// natives); every other file — JS products, `.next` build output, binaries,
// `LICENSE*` — is preserved. The design mirrors Minke's
// `runtime-prune.mjs` (`runtimeArtifactCategory` + `prunableRuntimeDirectory`)
// adapted to npm's flat (non-pnpm) layout.

/// Host platform triplets for the incompatible-platform-asset rule.
/// npm names platform-specific native optional deps `<family>-<os>-<arch>`
/// (or the bare triplet for `@esbuild/*`); a directory whose triplet does
/// not match the host cannot run here.
#[cfg(target_os = "macos")]
#[cfg_attr(debug_assertions, allow(dead_code))]
const HOST_OS: &str = "darwin";
#[cfg(target_os = "windows")]
#[cfg_attr(debug_assertions, allow(dead_code))]
const HOST_OS: &str = "win32";
#[cfg(target_os = "linux")]
#[cfg_attr(debug_assertions, allow(dead_code))]
const HOST_OS: &str = "linux";
#[cfg(target_arch = "aarch64")]
#[cfg_attr(debug_assertions, allow(dead_code))]
const HOST_ARCH: &str = "arm64";
#[cfg(target_arch = "x86_64")]
#[cfg_attr(debug_assertions, allow(dead_code))]
const HOST_ARCH: &str = "x64";

/// White-list prune categories (issue 25). Only paths classified into one of
/// these are ever deleted.
#[cfg_attr(debug_assertions, allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PruneCategory {
    /// `.map` source-map files — dev-only; `next start`/Node ignore them.
    SourceMaps,
    /// `.d.ts` / `.d.mts` / `.d.cts` TypeScript declarations — compile-time
    /// only, never loaded by Node.
    TypeDeclarations,
    /// `.tsbuildinfo` incremental-build caches.
    BuildCaches,
    /// `readme` / `changelog` / `changes` / `history` docs (md/txt).
    /// **`LICENSE*` is deliberately excluded** (legal requirement).
    Documentation,
    /// Native optional-dependency directories for a platform/arch other than
    /// the host (e.g. `@esbuild/win32-x64` on macOS).
    IncompatiblePlatformAssets,
}

#[cfg_attr(debug_assertions, allow(dead_code))]
impl PruneCategory {
    const ALL: [PruneCategory; 5] = [
        Self::SourceMaps,
        Self::TypeDeclarations,
        Self::BuildCaches,
        Self::Documentation,
        Self::IncompatiblePlatformAssets,
    ];

    const fn index(self) -> usize {
        match self {
            Self::SourceMaps => 0,
            Self::TypeDeclarations => 1,
            Self::BuildCaches => 2,
            Self::Documentation => 3,
            Self::IncompatiblePlatformAssets => 4,
        }
    }

    const fn label(self) -> &'static str {
        match self {
            Self::SourceMaps => "sourceMaps",
            Self::TypeDeclarations => "typeDeclarations",
            Self::BuildCaches => "buildCaches",
            Self::Documentation => "documentation",
            Self::IncompatiblePlatformAssets => "incompatiblePlatformAssets",
        }
    }
}

/// Outcome of [`prune_runtime`]: what was removed, for the install log (and
/// the issue-23 size tracking).
#[cfg_attr(debug_assertions, allow(dead_code))]
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
struct PruneStats {
    files: u64,
    bytes: u64,
    /// Removed files per category (index via [`PruneCategory::index`]).
    by_category: [u64; 5],
}

/// True when `lower_name` (already lowercased) is a documentation file Minke
/// prunes: `readme|changelog|changes|history` with an optional
/// `.md` / `.markdown` / `.txt` extension — Minke's `DOCUMENTATION_FILE`
/// regex `/^(?:readme|changelog|changes|history)(?:\\.(?:md|markdown|txt))?$/iu`.
/// Deliberately excludes `LICENSE*`.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn is_documentation_name(lower_name: &str) -> bool {
    let base = lower_name
        .strip_suffix(".md")
        .or_else(|| lower_name.strip_suffix(".markdown"))
        .or_else(|| lower_name.strip_suffix(".txt"))
        .unwrap_or(lower_name);
    matches!(base, "readme" | "changelog" | "changes" | "history")
}

/// Platform/arch triplets used by npm's platform-suffixed native
/// optional-dependency package names (`<family>-<os>-<arch>`, or the bare
/// triplet for `@esbuild/*`).
#[cfg_attr(debug_assertions, allow(dead_code))]
const NATIVE_PLATFORMS: &[&str] = &["darwin", "win32", "linux", "freebsd"];
#[cfg_attr(debug_assertions, allow(dead_code))]
const NATIVE_ARCHES: &[&str] = &["arm64", "x64", "ia32", "arm"];

/// Split a trailing `-<os>-<arch>` triplet off a package name
/// ("swc-darwin-arm64" → ("swc", "darwin", "arm64"); the bare triplet
/// "darwin-arm64" → ("", "darwin", "arm64")). `None` when the name does
/// not end in a known triplet.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn split_platform_arch(name: &str) -> Option<(&str, &str, &str)> {
    let mut parts = name.rsplitn(3, '-');
    let arch = parts.next()?;
    let platform = parts.next()?;
    let stem = parts.next().unwrap_or("");
    (NATIVE_PLATFORMS.contains(&platform) && NATIVE_ARCHES.contains(&arch))
        .then_some((stem, platform, arch))
}

/// Map a (scope, stem) pair to the native package family it belongs to —
/// the white-list of platform-suffixed native deps **surveyed in pi-web's
/// dependency tree** (issue 25): `esbuild`, `@next/swc`, `@img/sharp`,
/// `@img/sharp-libvips`, `@tailwindcss/oxide`, `@rollup/rollup`,
/// `@unrs/resolver-binding`, `lightningcss`. A directory carrying a known
/// triplet but not in this list is NOT pruned (whitelist discipline: delete
/// only what is clearly a platform binary).
#[cfg_attr(debug_assertions, allow(dead_code))]
fn native_family(scope: Option<&str>, stem: &str) -> Option<&'static str> {
    match (scope, stem) {
        (Some("@esbuild"), "") => Some("esbuild"),
        (Some("@next"), "swc") => Some("swc"),
        (Some("@img"), "sharp" | "sharp-libvips") => Some("sharp"),
        (Some("@tailwindcss"), "oxide") => Some("oxide"),
        (Some("@rollup"), "rollup") => Some("rollup"),
        (Some("@unrs"), "resolver-binding") => Some("resolver-binding"),
        (None, "lightningcss") => Some("lightningcss"),
        _ => None,
    }
}

/// Whole-directory incompatible-platform rule (Minke's
/// `prunableRuntimeDirectory`, adapted to npm's flat layout): directories
/// that only exist for another OS/arch. When matched, the whole directory is
/// removed (more efficient than per-file removal). `rel` is the
/// `/`-normalized path relative to the install root; nested `node_modules`
/// (version conflicts) are handled too.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn incompatible_platform_dir(rel: &str, os: &str, arch: &str) -> bool {
    let parts: Vec<&str> = rel.split('/').collect();
    // node-pty's Windows-only machinery (absent from pi-web's dependency
    // tree — the rule is defensive, ported from Minke).
    if os != "win32"
        && (parts == ["node_modules", "node-pty", "deps", "winpty"]
            || parts == ["node_modules", "node-pty", "third_party", "conpty"])
    {
        return true;
    }
    // Platform-suffixed native package dirs, e.g.
    // node_modules/@esbuild/<triplet>, node_modules/@next/swc-<triplet>,
    // node_modules/lightningcss-<triplet>.
    for i in 0..parts.len() {
        if parts[i] != "node_modules" {
            continue;
        }
        let (scope, name) = match parts.get(i + 1).copied() {
            Some(p) if p.starts_with('@') => (Some(p), parts.get(i + 2).copied()),
            Some(p) => (None, Some(p)),
            None => (None, None),
        };
        let Some(name) = name else { continue };
        let Some((stem, plat, a)) = split_platform_arch(name) else { continue };
        if native_family(scope, stem).is_some() && (plat != os || a != arch) {
            return true;
        }
    }
    false
}

/// White-list classifier: map a `/`-normalized path relative to the install
/// root to the prune category that justifies deleting it, or `None` to keep
/// it. Mirrors Minke's `runtimeArtifactCategory` plus its
/// `prunableRuntimeDirectory` platform rule, adapted to npm's flat layout.
/// Pure function — unit-testable without touching the real node_modules.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn prune_category(rel: &str, os: &str, arch: &str) -> Option<PruneCategory> {
    if incompatible_platform_dir(rel, os, arch) {
        return Some(PruneCategory::IncompatiblePlatformAssets);
    }
    let name = rel.rsplit('/').next().unwrap_or(rel);
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".map") {
        Some(PruneCategory::SourceMaps)
    } else if lower.ends_with(".d.ts") || lower.ends_with(".d.mts") || lower.ends_with(".d.cts") {
        Some(PruneCategory::TypeDeclarations)
    } else if lower.ends_with(".tsbuildinfo") {
        Some(PruneCategory::BuildCaches)
    } else if is_documentation_name(&lower) {
        Some(PruneCategory::Documentation)
    } else {
        None
    }
}

/// Count files/bytes under `dir` before removing an incompatible-platform
/// directory (symlinks skipped, errors tolerated) so the prune stats stay
/// truthful. Iterative — no recursion-depth risk on deep trees.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn count_tree(dir: &Path) -> (u64, u64) {
    let mut files = 0u64;
    let mut bytes = 0u64;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for entry in rd.flatten() {
            let Ok(ft) = entry.file_type() else { continue };
            let p = entry.path();
            if ft.is_symlink() {
                continue;
            }
            if ft.is_dir() {
                stack.push(p);
            } else if ft.is_file() {
                files += 1;
                bytes += std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    (files, bytes)
}

/// Recursive half of [`prune_runtime`]. Errors on individual entries are
/// tolerated — one unreadable entry must never abort the walk of a
/// multi-hundred-MB tree.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn prune_tree(root: &Path, dir: &Path, stats: &mut PruneStats) {
    let entries = match std::fs::read_dir(dir) {
        Ok(it) => it,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(ft) = entry.file_type() else { continue };
        // Defensive symlink skip: npm flat installs have none, but `.bin`
        // shims are symlinks on unix and must not be followed.
        if ft.is_symlink() {
            continue;
        }
        let Ok(rel) = path.strip_prefix(root) else { continue };
        let rel = rel.to_string_lossy().replace('\\', "/");
        if ft.is_dir() {
            if prune_category(&rel, HOST_OS, HOST_ARCH)
                == Some(PruneCategory::IncompatiblePlatformAssets)
            {
                let (files, bytes) = count_tree(&path);
                if std::fs::remove_dir_all(&path).is_ok() {
                    stats.files += files;
                    stats.bytes += bytes;
                    stats.by_category[PruneCategory::IncompatiblePlatformAssets.index()] +=
                        files;
                }
            } else {
                prune_tree(root, &path, stats);
            }
        } else if ft.is_file() {
            if let Some(cat) = prune_category(&rel, HOST_OS, HOST_ARCH) {
                let len = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                if std::fs::remove_file(&path).is_ok() {
                    stats.files += 1;
                    stats.bytes += len;
                    stats.by_category[cat.index()] += 1;
                }
            }
        }
        // Other file types (sockets, fifos) are left alone.
    }
}

/// Post-install whitelist pruning (issue 25): walk the install tree and
/// remove files whose path classifies into [`prune_category`], plus whole
/// incompatible-platform directories. Runs after `npm install` and before
/// the health check — the health check is what proves the prune removed
/// nothing pi-web needs at runtime. Idempotent: a second pass removes 0
/// files.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn prune_runtime(root: &Path) -> PruneStats {
    let mut stats = PruneStats::default();
    prune_tree(root, root, &mut stats);
    stats
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
        format!("$ npm install --prefix {prefix} {PACKAGE_NAME}"),
    );
    let args = build_npm_args(prefix);
    run_npm(app, node, &args, INSTALL_TIMEOUT)?;

    // Post-install whitelist pruning (issue 25): source maps, type
    // declarations, build caches, docs and incompatible-platform natives are
    // removed BEFORE the health check. Pruning is best-effort (never fails),
    // and the health check below remains the gate: if the prune removed
    // something pi-web needs, verify fails and the install is re-downloaded.
    let stats = prune_runtime(&dir);
    if stats.files > 0 {
        let mut breakdown: Vec<String> = Vec::new();
        for cat in PruneCategory::ALL {
            let n = stats.by_category[cat.index()];
            if n > 0 {
                breakdown.push(format!("{}={}", cat.label(), n));
            }
        }
        crate::logger::log_line(&format!(
            "web prune: removed {} files / {} bytes ({})",
            stats.files,
            stats.bytes,
            breakdown.join(", ")
        ));
    } else {
        crate::logger::log_line("web prune: nothing to prune");
    }

    // Post-install health check: a corrupted install (interrupted download,
    // disk full, partial extraction) must be caught here, not as a cryptic
    // first-launch failure. On failure the install dir is removed so the
    // launch wizard's retry re-downloads from scratch.
    let outcome = match verify_installation(&dir, node) {
        Ok(outcome) => outcome,
        Err(err) => {
            let detail = err.to_string();
            crate::logger::log_line(&format!("web health check FAILED: {detail}"));
            let cleanup = match std::fs::remove_dir_all(&dir) {
                Ok(()) => {
                    crate::logger::log_line(&format!(
                        "web health check: removed corrupt install at {prefix}"
                    ));
                    "已清理损坏的安装，请点击重试".to_string()
                }
                Err(e) => {
                    crate::logger::log_line(&format!(
                        "web health check: 清理失败 {prefix}: {e}"
                    ));
                    format!("清理失败（{e}），请手动删除 {prefix} 后重试")
                }
            };
            let _ = app.emit(
                "web:install-failed",
                InstallError {
                    code: "INSTALL_VERIFY_FAILED".to_string(),
                    summary: format!("安装验证失败：{detail}。{cleanup}"),
                },
            );
            return Err(format!("INSTALL_VERIFY_FAILED: {detail}。{cleanup}"));
        }
    };
    crate::logger::log_line(&format!(
        "web health check passed: pi-web v{}",
        outcome.version
    ));
    installed_web_bin().ok_or_else(|| format!("pi-web 已安装但未找到 bin：{}", dir.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_install_error_prefers_detail_over_summary() {
        let json = r#"{"error":{"code":"ERESOLVE","summary":"could not resolve","detail":"Conflicting peer dependency: @poweri/poweri-web"}}"#;
        let (code, summary) = extract_install_error(json);
        assert_eq!(code, "ERESOLVE");
        assert_eq!(summary, "Conflicting peer dependency: @poweri/poweri-web");
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
        let json = r#"{"add":[{"name":"other","version":"1.0.0"},{"name":"@poweri/poweri-web","version":"9.9.9"}]}"#;
        assert_eq!(extract_installed_version(json), "9.9.9");
    }

    #[test]
    fn extract_installed_version_unknown_when_package_missing() {
        let json = r#"{"add":[{"name":"other","version":"1.0.0"}]}"#;
        assert_eq!(extract_installed_version(json), "unknown");
    }

    #[test]
    fn extract_installed_version_handles_non_json() {
        // A malformed stdout blob must degrade to "unknown", never panic.
        assert_eq!(extract_installed_version("not json at all"), "unknown");
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
        assert_eq!(args.last().map(String::as_str), Some(package_spec().as_str()));
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

    // ---- post-install health check ----

    /// Write a minimal valid pi-web package tree under `root`
    /// (`node_modules/@poweri/poweri-web/{bin/*, .next/BUILD_ID, package.json}`).
    fn write_fake_package(root: &Path) {
        let pkg = root.join("node_modules").join(PACKAGE_NAME);
        for rel in REQUIRED_BIN_FILES {
            let p = pkg.join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(&p, "#!/usr/bin/env node\n").unwrap();
        }
        let build = pkg.join(".next").join("BUILD_ID");
        std::fs::create_dir_all(build.parent().unwrap()).unwrap();
        std::fs::write(&build, "fake-build-id").unwrap();
        std::fs::write(
            pkg.join("package.json"),
            r#"{"name":"@poweri/poweri-web","version":"0.8.9"}"#,
        )
        .unwrap();
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("poweri-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn check_required_files_passes_on_complete_package() {
        let dir = temp_dir("hc-ok");
        write_fake_package(&dir);
        assert!(check_required_files(&dir).is_ok());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn check_required_files_detects_missing_entry_script() {
        let dir = temp_dir("hc-missing-js");
        write_fake_package(&dir);
        std::fs::remove_file(
            dir.join("node_modules")
                .join(PACKAGE_NAME)
                .join("bin")
                .join("pi-web.js"),
        )
        .unwrap();
        let err = check_required_files(&dir).unwrap_err();
        assert!(matches!(
            &err,
            HealthCheckError::MissingFile(p) if p.ends_with("bin/pi-web.js")
        ));
        assert!(err.to_string().contains("缺少关键文件"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn check_required_files_detects_missing_build_artifacts() {
        let dir = temp_dir("hc-missing-build");
        write_fake_package(&dir);
        std::fs::remove_file(
            dir.join("node_modules")
                .join(PACKAGE_NAME)
                .join(".next")
                .join("BUILD_ID"),
        )
        .unwrap();
        let err = check_required_files(&dir).unwrap_err();
        assert!(matches!(err, HealthCheckError::MissingBuild(_)));
        assert!(err.to_string().contains("缺少构建产物"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---- managed install dir package check (stale-package migration) ----

    #[test]
    fn managed_pkg_dir_present_false_without_package() {
        let dir = temp_dir("stale-empty");
        assert!(!managed_pkg_dir_present(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn managed_pkg_dir_present_true_with_correct_package() {
        let dir = temp_dir("stale-ok");
        write_fake_package(&dir);
        assert!(managed_pkg_dir_present(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn managed_pkg_dir_present_false_with_stale_package() {
        // Old shells installed `pweb` (upstream pi-web, no /poweri route);
        // its `.bin/pi-web` shim must not count as an install of
        // `PACKAGE_NAME` or the shell would launch a 404-ing web app.
        let dir = temp_dir("stale-pweb");
        std::fs::create_dir_all(dir.join("node_modules").join(".bin")).unwrap();
        std::fs::write(dir.join("node_modules").join(".bin").join("pi-web"), "#!/bin/sh\n").unwrap();
        std::fs::create_dir_all(dir.join("node_modules").join("pweb")).unwrap();
        assert!(!managed_pkg_dir_present(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn extract_package_version_parses_installed_json() {
        assert_eq!(
            extract_package_version(r#"{"name":"@poweri/poweri-web","version":"0.8.9"}"#),
            Some("0.8.9".to_string())
        );
        assert_eq!(extract_package_version(r#"{"name":"x"}"#), None);
        assert_eq!(extract_package_version("not json"), None);
    }

    #[test]
    fn verify_installation_with_succeeds_and_reports_version() {
        let dir = temp_dir("hc-verify-ok");
        write_fake_package(&dir);
        let outcome = verify_installation_with(&dir, |_| Ok(())).unwrap();
        assert_eq!(outcome.version, "0.8.9");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn verify_installation_with_surfaces_probe_failure() {
        let dir = temp_dir("hc-verify-probe");
        write_fake_package(&dir);
        let err = verify_installation_with(&dir, |_| Err("模拟探针失败".to_string())).unwrap_err();
        assert!(matches!(err, HealthCheckError::ProbeFailed(_)));
        assert!(err.to_string().contains("模拟探针失败"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn verify_installation_with_stops_before_probe_when_file_missing() {
        let dir = temp_dir("hc-verify-noprobe");
        write_fake_package(&dir);
        std::fs::remove_file(
            dir.join("node_modules")
                .join(PACKAGE_NAME)
                .join("bin")
                .join("node-version.js"),
        )
        .unwrap();
        let probed = std::cell::Cell::new(false);
        let err = verify_installation_with(&dir, |_| {
            probed.set(true);
            Ok(())
        })
        .unwrap_err();
        assert!(matches!(err, HealthCheckError::MissingFile(_)));
        assert!(!probed.get(), "探针不得在文件缺失时运行");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn verify_installation_with_reports_unreadable_version() {
        let dir = temp_dir("hc-verify-ver");
        write_fake_package(&dir);
        std::fs::write(
            dir.join("node_modules")
                .join(PACKAGE_NAME)
                .join("package.json"),
            "not json",
        )
        .unwrap();
        let err = verify_installation_with(&dir, |_| Ok(())).unwrap_err();
        assert!(matches!(err, HealthCheckError::VersionUnreadable(_)));
        assert!(err.to_string().contains("无法读取版本信息"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn truncate_stderr_keeps_short_and_caps_long() {
        assert_eq!(truncate_stderr("  short  "), "short");
        let long = "x".repeat(500);
        let t = truncate_stderr(&long);
        assert!(t.chars().count() <= 301);
        assert!(t.ends_with('…'));
    }

    /// A fake `node` executable whose behavior mirrors the real pi-web
    /// launcher: an invalid `--port` reaches argument parsing and exits 1
    /// with the port error on stderr; anything else exits 0.
    #[cfg(unix)]
    fn write_fake_node(dir: &Path, body: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let fake = dir.join("fake-node");
        std::fs::write(&fake, body).unwrap();
        let mut perms = std::fs::metadata(&fake).unwrap().permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&fake, perms).unwrap();
        fake
    }

    #[cfg(unix)]
    #[test]
    fn probe_executable_accepts_launcher_reaching_arg_parsing() {
        let dir = temp_dir("hc-probe-ok");
        let fake_node = write_fake_node(
            &dir,
            "#!/bin/sh\ncase \"$*\" in\n  *\"--port not-a-port\"*) echo 'Error: Port must be a non-negative integer.' >&2; exit 1 ;;\n  *) exit 0 ;;

esac\n",
        );
        let piweb_js = dir.join("pi-web.js");
        std::fs::write(&piweb_js, "x").unwrap();

        assert!(probe_executable(&fake_node, &piweb_js).is_ok());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn probe_executable_rejects_unexpected_success() {
        let dir = temp_dir("hc-probe-success");
        let fake_node = write_fake_node(&dir, "#!/bin/sh\nexit 0\n");
        let piweb_js = dir.join("pi-web.js");
        std::fs::write(&piweb_js, "x").unwrap();

        let err = probe_executable(&fake_node, &piweb_js).unwrap_err();
        assert!(err.contains("意外成功退出"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn probe_executable_reports_stderr_when_arg_parsing_not_reached() {
        let dir = temp_dir("hc-probe-stderr");
        let fake_node = write_fake_node(
            &dir,
            "#!/bin/sh\necho 'MODULE_NOT_FOUND: cannot find module' >&2\nexit 1\n",
        );
        let piweb_js = dir.join("pi-web.js");
        std::fs::write(&piweb_js, "x").unwrap();

        let err = probe_executable(&fake_node, &piweb_js).unwrap_err();
        assert!(err.contains("未到达参数解析"));
        assert!(err.contains("MODULE_NOT_FOUND"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---- post-install pruning (issue 25) ----

    /// Write a file at `rel` (relative to `dir`), creating parents.
    fn write_file(dir: &Path, rel: &str, contents: &str) {
        let p = dir.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, contents).unwrap();
    }

    #[test]
    fn prune_category_matches_all_five_categories() {
        assert_eq!(
            prune_category("node_modules/a/dist/index.js.map", "darwin", "arm64"),
            Some(PruneCategory::SourceMaps)
        );
        assert_eq!(
            prune_category("node_modules/a/dist/index.d.ts", "darwin", "arm64"),
            Some(PruneCategory::TypeDeclarations)
        );
        assert_eq!(
            prune_category("node_modules/a/dist/index.d.mts", "darwin", "arm64"),
            Some(PruneCategory::TypeDeclarations)
        );
        assert_eq!(
            prune_category("node_modules/a/dist/index.d.cts", "darwin", "arm64"),
            Some(PruneCategory::TypeDeclarations)
        );
        assert_eq!(
            prune_category("node_modules/a/tsconfig.tsbuildinfo", "darwin", "arm64"),
            Some(PruneCategory::BuildCaches)
        );
        assert_eq!(
            prune_category("node_modules/a/readme.md", "darwin", "arm64"),
            Some(PruneCategory::Documentation)
        );
        assert_eq!(
            prune_category("node_modules/@esbuild/win32-x64", "darwin", "arm64"),
            Some(PruneCategory::IncompatiblePlatformAssets)
        );
    }

    #[test]
    fn prune_category_documentation_matches_and_excludes_license() {
        // Documentation: Minke's DOCUMENTATION_FILE regex, case-insensitive,
        // optional .md/.markdown/.txt extension.
        for p in [
            "node_modules/a/README",
            "node_modules/a/readme.md",
            "node_modules/a/Readme.MD",
            "node_modules/a/CHANGELOG.md",
            "node_modules/a/CHANGELOG.markdown",
            "node_modules/a/changes",
            "node_modules/a/HISTORY.txt",
        ] {
            assert_eq!(
                prune_category(p, "darwin", "arm64"),
                Some(PruneCategory::Documentation),
                "{p} 应判定为 documentation"
            );
        }
        // LICENSE is a legal requirement and must never be pruned — even
        // though it is a "doc" by content.
        for p in [
            "node_modules/a/LICENSE",
            "node_modules/a/LICENSE.md",
            "node_modules/a/LICENSE-MIT",
            "node_modules/a/license",
        ] {
            assert_eq!(prune_category(p, "darwin", "arm64"), None, "{p} 必须保留");
        }
    }

    #[test]
    fn prune_category_keeps_runtime_assets() {
        for p in [
            "node_modules/a/package.json",
            "node_modules/a/dist/index.js",
            "node_modules/a/dist/index.cjs",
            "node_modules/a/dist/index.mjs",
            "node_modules/a/.next/BUILD_ID",
            "node_modules/a/.next/server/app-paths-manifest.js",
            "node_modules/a/bin/native.node", // binary
            "node_modules/a/readme.md.bak",   // not exactly readme.*
            "node_modules/a/myreadme.md",
            "node_modules/a/readme.html",     // html is not in Minke's regex
            "node_modules/a/docs/guide.md",   // only basename readme/changelog/…
            "node_modules/a/LICENSE.md",
        ] {
            assert_eq!(
                prune_category(p, "darwin", "arm64"),
                None,
                "{p} 不应被裁剪"
            );
        }
    }

    #[test]
    fn prune_category_platform_dir_keeps_host_deletes_foreign() {
        // Host variant is kept on whatever platform we build on.
        assert_eq!(
            prune_category(
                &format!("node_modules/@esbuild/{HOST_OS}-{HOST_ARCH}"),
                HOST_OS,
                HOST_ARCH
            ),
            None
        );
        // A triplet guaranteed to differ from the host is pruned.
        let (foreign_os, foreign_arch) = if HOST_OS == "linux" {
            ("darwin", "arm64")
        } else {
            ("linux", "x64")
        };
        assert_eq!(
            prune_category(
                &format!("node_modules/@esbuild/{foreign_os}-{foreign_arch}"),
                HOST_OS,
                HOST_ARCH
            ),
            Some(PruneCategory::IncompatiblePlatformAssets)
        );
        // node-pty's Windows-only machinery: pruned on every non-Windows
        // host, kept on Windows.
        assert_eq!(
            prune_category("node_modules/node-pty/deps/winpty", HOST_OS, HOST_ARCH),
            if HOST_OS == "win32" {
                None
            } else {
                Some(PruneCategory::IncompatiblePlatformAssets)
            }
        );
        assert_eq!(
            prune_category(
                "node_modules/node-pty/third_party/conpty",
                HOST_OS,
                HOST_ARCH
            ),
            if HOST_OS == "win32" {
                None
            } else {
                Some(PruneCategory::IncompatiblePlatformAssets)
            }
        );
    }

    #[test]
    fn prune_category_recognizes_surveyed_native_families() {
        // Families observed in pi-web's dependency tree (issue 25 survey):
        // only host variants are ever installed, so every foreign triplet
        // must classify as prunable.
        for dir in [
            "node_modules/@esbuild/win32-x64",
            "node_modules/@next/swc-linux-arm64",
            "node_modules/@img/sharp-linux-x64",
            "node_modules/@img/sharp-libvips-win32-x64",
            "node_modules/@tailwindcss/oxide-linux-x64",
            "node_modules/@rollup/rollup-win32-x64",
            "node_modules/@unrs/resolver-binding-linux-x64",
            "node_modules/lightningcss-win32-x64",
        ] {
            assert_eq!(
                prune_category(dir, "darwin", "arm64"),
                Some(PruneCategory::IncompatiblePlatformAssets),
                "{dir}"
            );
        }
        // Whitelist discipline: platform-looking names of unknown families
        // are NOT pruned.
        assert_eq!(prune_category("node_modules/win32-x64", "darwin", "arm64"), None);
        assert_eq!(
            prune_category("node_modules/@scope/win32-x64", "darwin", "arm64"),
            None
        );
        assert_eq!(
            prune_category("node_modules/some-lib/win32-x64", "darwin", "arm64"),
            None
        );
        // Nested node_modules (version conflicts) are handled too.
        assert_eq!(
            prune_category(
                "node_modules/a/node_modules/@esbuild/win32-x64",
                "darwin",
                "arm64"
            ),
            Some(PruneCategory::IncompatiblePlatformAssets)
        );
    }

    #[test]
    fn prune_runtime_removes_categorized_files_and_counts_them() {
        let dir = temp_dir("prune-basic");
        write_file(&dir, "node_modules/pkg/readme.md", "# docs");
        write_file(&dir, "node_modules/pkg/dist/index.js.map", "{}");
        write_file(&dir, "node_modules/pkg/dist/index.d.ts", "declare");
        write_file(&dir, "node_modules/pkg/tsconfig.tsbuildinfo", "x");
        write_file(&dir, "node_modules/pkg/LICENSE", "MIT");
        write_file(&dir, "node_modules/pkg/dist/index.js", "console.log(1)");
        write_file(&dir, "node_modules/pkg/.next/BUILD_ID", "build-id");

        let stats = prune_runtime(&dir);
        assert_eq!(stats.files, 4);
        assert!(stats.bytes > 0);
        assert_eq!(stats.by_category[PruneCategory::SourceMaps.index()], 1);
        assert_eq!(stats.by_category[PruneCategory::TypeDeclarations.index()], 1);
        assert_eq!(stats.by_category[PruneCategory::BuildCaches.index()], 1);
        assert_eq!(stats.by_category[PruneCategory::Documentation.index()], 1);
        // Deleted…
        assert!(!dir.join("node_modules/pkg/readme.md").exists());
        assert!(!dir.join("node_modules/pkg/dist/index.js.map").exists());
        assert!(!dir.join("node_modules/pkg/dist/index.d.ts").exists());
        assert!(!dir.join("node_modules/pkg/tsconfig.tsbuildinfo").exists());
        // …and kept.
        assert!(dir.join("node_modules/pkg/LICENSE").exists());
        assert!(dir.join("node_modules/pkg/dist/index.js").exists());
        assert!(dir.join("node_modules/pkg/.next/BUILD_ID").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prune_runtime_is_idempotent() {
        let dir = temp_dir("prune-idem");
        write_file(&dir, "node_modules/pkg/readme.md", "docs");
        write_file(&dir, "node_modules/pkg/a.js.map", "{}");
        write_file(&dir, "node_modules/pkg/a.js", "x");

        let first = prune_runtime(&dir);
        assert_eq!(first.files, 2);
        assert!(first.bytes > 0);

        let second = prune_runtime(&dir);
        assert_eq!(second.files, 0);
        assert_eq!(second.bytes, 0);
        assert!(dir.join("node_modules/pkg/a.js").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prune_runtime_removes_foreign_platform_dir_whole() {
        let dir = temp_dir("prune-platform");
        let (foreign_os, foreign_arch) = if HOST_OS == "win32" {
            ("linux", "x64")
        } else {
            ("win32", "x64")
        };
        write_file(
            &dir,
            &format!(
                "node_modules/@esbuild/{foreign_os}-{foreign_arch}/bin/esbuild.exe",
            ),
            "MZ",
        );
        write_file(
            &dir,
            &format!("node_modules/@esbuild/{foreign_os}-{foreign_arch}/package.json"),
            "{}",
        );
        // Host-variant dir is kept.
        write_file(
            &dir,
            &format!(
                "node_modules/@esbuild/{HOST_OS}-{HOST_ARCH}/bin/esbuild",
            ),
            "ELF",
        );

        let stats = prune_runtime(&dir);
        assert!(!dir
            .join(format!(
                "node_modules/@esbuild/{foreign_os}-{foreign_arch}"
            ))
            .exists());
        // Parent scope dir survives (other families may live there).
        assert!(dir.join("node_modules/@esbuild").is_dir());
        assert!(dir
            .join(format!(
                "node_modules/@esbuild/{HOST_OS}-{HOST_ARCH}/bin/esbuild"
            ))
            .exists());
        // Both files of the foreign dir were counted via count_tree.
        assert_eq!(stats.files, 2);
        assert_eq!(
            stats.by_category[PruneCategory::IncompatiblePlatformAssets.index()],
            2
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn prune_runtime_skips_symlinks() {
        use std::os::unix::fs::symlink;
        let dir = temp_dir("prune-symlink");
        write_file(&dir, "node_modules/pkg/target.js.map", "{}");
        symlink(
            dir.join("node_modules/pkg/target.js.map"),
            dir.join("node_modules/pkg/link.js.map"),
        )
        .unwrap();

        let stats = prune_runtime(&dir);
        // Only the real file is removed; the symlink (now dangling) stays.
        assert_eq!(stats.files, 1);
        let link_ft = std::fs::symlink_metadata(dir.join("node_modules/pkg/link.js.map"))
            .unwrap()
            .file_type();
        assert!(link_ft.is_symlink());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prune_runtime_keeps_files_verify_installation_needs() {
        // Issue-25 discipline: pruning must never remove what the health
        // check requires. Build a fake package with prunable extras, prune,
        // then the existing health check must still pass.
        let dir = temp_dir("prune-verify");
        write_fake_package(&dir);
        // Prunable extras that must NOT affect the health check.
        write_file(&dir, "node_modules/@poweri/poweri-web/README.md", "docs");
        write_file(&dir, "node_modules/@poweri/poweri-web/dist/index.js.map", "{}");
        write_file(&dir, "node_modules/@poweri/poweri-web/dist/index.d.ts", "declare");

        let stats = prune_runtime(&dir);
        assert_eq!(stats.files, 3);

        let outcome = verify_installation_with(&dir, |_| Ok(())).unwrap();
        assert_eq!(outcome.version, "0.8.9");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// End-to-end (ignored): prune a real copied production install.
    /// Run with:
    ///   PRUNE_E2E_DIR=/tmp/prune-e2e cargo test e2e_prune_real_install -- --ignored --nocapture
    #[test]
    #[ignore]
    fn e2e_prune_real_install() {
        let dir = std::path::PathBuf::from(
            std::env::var("PRUNE_E2E_DIR").expect("PRUNE_E2E_DIR env"),
        );
        let before = count_tree(&dir);
        let stats = prune_runtime(&dir);
        let after = count_tree(&dir);
        println!("BEFORE files={} bytes={}", before.0, before.1);
        println!("PRUNED files={} bytes={}", stats.files, stats.bytes);
        println!("AFTER  files={} bytes={}", after.0, after.1);
        // Sanity: no JS/build artifacts removed.
        for keep in [
            "node_modules/@poweri/poweri-web/bin/pi-web.js",
            "node_modules/@poweri/poweri-web/.next/BUILD_ID",
            "node_modules/@poweri/poweri-web/package.json",
        ] {
            assert!(
                dir.join(keep).exists(),
                "prune must keep {keep} (health-check requirement)",
            );
        }
    }
}