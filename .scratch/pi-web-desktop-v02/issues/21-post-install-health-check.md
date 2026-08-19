---
title: 安装后健康检查
status: ready-for-agent
type: task
blocked-by: [19]
---

# 安装后健康检查

## Problem Statement

npm install 成功后无验证机制，损坏的安装（网络中断、磁盘满、权限问题）会导致首次启动失败，用户看到 cryptic 错误信息。Minke 的经验表明，每项删除都需要证明生产能力保持完整——安装也需要验证。

## Solution

在 `installer.rs` 中添加 `verify_installation()` 函数，安装完成后：
1. 运行 `pi-web --version` 验证可执行
2. 检查关键文件存在（bin/pi-web.js）
3. 失败时删除安装目录，提示用户重试

## User Stories

1. As a user, I want PowerI to verify that pi-web was installed correctly, so that I don't encounter cryptic runtime errors on first launch
2. As a maintainer, I want the health check to run automatically after npm install, so that corrupted installations are detected and can be retried
3. As a support engineer, I want the health check to log detailed diagnostics, so that I can troubleshoot installation failures remotely

## Implementation Decisions

### 健康检查流程

```rust
// installer.rs
fn verify_installation(prefix: &Path) -> Result<(), HealthCheckError> {
    // 1. 检查关键文件存在
    let piweb_js = prefix.join("node_modules/@agegr/pi-web/bin/pi-web.js");
    if !piweb_js.exists() {
        return Err(HealthCheckError::MissingFile(piweb_js));
    }
    
    // 2. 运行 pi-web --version
    let piweb_bin = prefix.join("node_modules/.bin/pi-web");
    let output = Command::new(&piweb_bin)
        .arg("--version")
        .output()
        .map_err(|e| HealthCheckError::ExecutionFailed(e.to_string()))?;
    
    if !output.status.success() {
        return Err(HealthCheckError::VersionCheckFailed);
    }
    
    // 3. 记录版本
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    log_line(&format!("pi-web health check passed: {}", version));
    
    Ok(())
}
```

### 失败处理

- 健康检查失败 → 删除安装目录（`fs::remove_dir_all(prefix)`）
- 启动向导显示错误：「安装损坏，已清理。请重试」
- 连续 3 次失败 → 显示详细日志路径，引导用户手动安装（`npm install -g @agegr/pi-web`）

### 错误类型

```rust
enum HealthCheckError {
    MissingFile(PathBuf),
    ExecutionFailed(String),
    VersionCheckFailed,
}
```

## Testing Decisions

- 单元测试：mock Command 执行，验证错误处理逻辑
- 集成测试：在临时目录安装，故意破坏文件，验证检测
- 运行：`cargo test verify_installation`

## Out of Scope

- 不做安装完整性校验（checksum 验证）
- 不做自动重试（由启动向导 FSM 控制重试逻辑）
- 不做远程诊断上报（日志写本地，用户手动分享）

## Further Notes

- 健康检查增加首次启动时间 ~1-2s（可接受）
- Windows 上 `.bin/pi-web` 实际是 `pi-web.cmd`，需要处理 shim
- 与 20（安装体积优化）配合：体积裁剪后更需要验证功能完整

---

## 实施记录（agent）

### 实测结论：`--version` 不存在 → 探针方案（已实测验证）

`bin/pi-web.js` **不支持 `--version`**，也**不能**用 `--help` 探活：

- `parseLaunchOptions()`（bin/pi-web-options.js）只解析 `--port/-p`、`--hostname/-H`、`--no-open`，用 `parseArgs({ strict: false })` —— 未知 flag（如 `--help`/`--version`）会被**静默忽略**，脚本随后继续 `spawn next start`（阻塞型服务器），探活会挂住。
- 实测（pi-web 0.8.9 + node v24.13.0）：`node bin/pi-web.js --port not-a-port` → **exit 1，约 150ms 确定性退出**，stderr 含 `Error: Port must be a non-negative integer.`（`normalizePort` 在服务器启动*之前*抛错）。同一台机器 `next start` 真实启动 123ms Ready。

**最终验证方案**（三步，全部确定性、无阻塞）：
1. 关键文件：`node_modules/@agegr/pi-web/bin/{pi-web.js,pi-web-options.js,node-version.js,process-lifecycle.js}`（`files` 字段确认随包发布）+ `.next/BUILD_ID`（`next build` 产物，实测安装目录存在，21 字符 build id）。
2. 版本：读包内 `package.json` 的 `version` 字段（`files` 含 package.json，实测 0.8.9）。
3. 可执行探针：`node <pi-web.js> --port not-a-port`，断言 exit≠0 且 stderr 含 `Port must be a non-negative integer.` —— 一次探针同时证明 node 预检通过、入口脚本 + 兄弟模块可加载、参数解析可达。

### 实现

- `src-tauri/src/installer.rs`（唯一改动模块）：
  - `HealthCheckError`（MissingFile / MissingBuild / VersionUnreadable / ProbeFailed）+ Display（中文，风格一致）
  - `verify_installation(prefix, node)` / `verify_installation_with(prefix, run_probe)`（探针可注入，测试传假命令）
  - `check_required_files` / `read_package_version` / `extract_package_version` / `probe_executable` / `truncate_stderr`
  - `ensure_web_installed` 在 npm 成功、bin 就位后调用验证：成功 `log_line` 记录 `web health check passed: pi-web v<version>`；失败 → `remove_dir_all(install_dir)`（失败则提示手动删除）→ emit `web:install-failed`（code `INSTALL_VERIFY_FAILED`，summary 含清理+重试提示）→ 返回 `Err("INSTALL_VERIFY_FAILED: …")`
  - 探针注入：`verify_installation_with(prefix, |p| probe_executable(node, p))`，单测传假闭包；`probe_executable` 本身用假 node 脚本（unix）实测命令执行路径
  - cfg 门控：所有新函数 `#[cfg_attr(debug_assertions, allow(dead_code))]`，`Path/PathBuf/Command` import 改为无条件（debug 下也要编译）

### 测试（+13，共 35 全绿）

- 关键文件缺失（缺 pi-web.js → MissingFile、缺 BUILD_ID → MissingBuild、完整 → Ok）
- 版本解析纯函数（合法 / 无 version / 非 JSON）
- 编排：探针成功返回版本、探针失败 → ProbeFailed、文件缺失时探针不执行、版本不可读 → VersionUnreadable
- 错误消息格式（Display 中文文案）、truncate_stderr（≤300 字符）
- 探针命令路径（unix 假 node：达参数解析 → Ok；意外成功 → Err；stderr 透出）

### 注意：FSM 时序（未改 shell，符合本工单范围）

`run_npm` 成功时**先** emit `web:installed`（shell FSM `installing`→`starting`），随后验证失败再 emit `web:install-failed` 会被 `starting` 状态忽略（launch-machine.ts 只处理 ready/timeout/exited）。但 main.ts 的 listener 副作用仍执行（setStatus "启动失败" + appendLog 展示我们的清理提示），且目录已删，重试按钮重新走 boot→detecting→install。

结论：Rust 侧按工单要求做（删目录 + emit + Err），FSM 自然重试，功能正确；若后续要精确的 "安装损坏" 引导视图，需在 shell 层 `starting` 状态处理 `install-failed`/`launch-error`（超出本工单范围，建议另开工单）。
