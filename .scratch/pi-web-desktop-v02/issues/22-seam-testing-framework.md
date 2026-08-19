---
title: 接缝测试体系
status: ready-for-agent
type: task
blocked-by: [19]
---

# 接缝测试体系

## Problem Statement

PowerI 的关键接缝（环境检测、安装流程、进程管理、跨平台兼容）无自动化测试。Minke 的经验表明，桌面应用最昂贵的回归集中在"源码—构建—runtime—安装包—操作系统"这条长链路的接缝上。PowerI 需要建立类似的测试纪律。

## Solution

建立接缝测试体系，覆盖：
1. **环境检测接缝**：fnm/nvm/PATH 探测链、版本检查
2. **安装接缝**：npm install 参数构建、错误码解析
3. **进程管理接缝**：子进程 spawn/kill、端口就绪轮询
4. **跨平台接缝**：Windows .cmd shim、WSL 路径、macOS fnm 路径

## User Stories

1. As a maintainer, I want automated tests for the environment detection seam, so that I can verify fnm/nvm/PATH detection works across macOS/Windows/Linux
2. As a CI engineer, I want tests for the installation seam, so that npm install timeout and error code parsing are validated before release
3. As a release manager, I want tests for the process management seam, so that zombie processes and port conflicts are caught in CI
4. As a cross-platform developer, I want tests for Windows .cmd shim resolution and WSL path handling, so that Windows-specific bugs don't slip through

## Implementation Decisions

### 测试框架

- **Rust 单元测试**：`#[cfg(test)]` 模块，每个模块独立测试
- **Rust 集成测试**：`tests/` 目录，测试模块间协作
- **运行命令**：`cd src-tauri && cargo test`

### 关键接缝测试

#### 1. 环境检测接缝

```rust
// src-tauri/src/env_detection.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_node_version() {
        assert_eq!(parse_version("v22.19.0"), Some((22, 19, 0)));
        assert_eq!(parse_version("v20.0.0"), Some((20, 0, 0)));
        assert_eq!(parse_version("invalid"), None);
    }

    #[test]
    fn test_check_node_compatibility() {
        assert!(check_node_version(22, 19, 0)); // >= 22.5
        assert!(!check_node_version(20, 0, 0)); // < 22.5
        assert!(check_node_version(22, 5, 0));  // 边界
        assert!(!check_node_version(22, 4, 9)); // 边界
    }

    #[test]
    fn test_fnm_candidates_platform_specific() {
        let candidates = get_fnm_candidates();
        #[cfg(target_os = "macos")]
        assert!(candidates.iter().any(|p| p.contains("/opt/homebrew")));
    }
}
```

#### 2. 安装接缝

```rust
// src-tauri/src/installer.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_install_error() {
        let json = r#"{"error":{"code":"E404","summary":"package not found"}}"#;
        let (code, summary) = extract_install_error(json);
        assert_eq!(code, "E404");
        assert_eq!(summary, "package not found");
    }

    #[test]
    fn test_extract_installed_version() {
        let json = r#"{"add":[{"name":"@agegr/pi-web","version":"0.8.9"}]}"#;
        let version = extract_installed_version(json);
        assert_eq!(version, Some("0.8.9".to_string()));
    }

    #[test]
    fn test_build_npm_args_includes_omit() {
        let args = build_npm_args("/tmp/test");
        assert!(args.contains(&"--omit=dev".to_string()));
        assert!(args.contains(&"--omit=optional".to_string()));
    }

    #[test]
    fn test_build_npm_args_platform_specific() {
        let args = build_npm_args("/tmp/test");
        #[cfg(target_os = "macos")]
        assert!(args.contains(&"--os=darwin".to_string()));
        #[cfg(target_arch = "aarch64")]
        assert!(args.contains(&"--cpu=arm64".to_string()));
    }
}
```

#### 3. 进程管理接缝

```rust
// src-tauri/src/process_manager.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_port_open_unused_port() {
        // 端口 30141 未监听
        assert!(!is_port_open(30141));
    }

    #[test]
    fn test_kill_process_group() {
        // 启动一个测试进程
        let mut child = Command::new("sleep")
            .arg("10")
            .spawn()
            .unwrap();
        let pid = child.id();
        
        // 杀死进程组
        kill_process_group(pid);
        
        // 验证进程已退出
        let status = child.wait().unwrap();
        assert!(!status.success());
    }

    #[test]
    fn test_wait_for_port_timeout() {
        // 端口未监听，应该超时
        let start = std::time::Instant::now();
        let result = wait_for_port(30141, Duration::from_millis(100));
        assert!(!result);
        assert!(start.elapsed() >= Duration::from_millis(100));
    }
}
```

#### 4. 跨平台接缝

```rust
// src-tauri/tests/cross_platform_test.rs
#[cfg(target_os = "macos")]
#[test]
fn test_fnm_candidates_macos() {
    use pi_web_desktop::env_detection::FNM_CANDIDATES;
    assert!(FNM_CANDIDATES.contains(&"/opt/homebrew/bin/fnm"));
}

#[cfg(target_os = "windows")]
#[test]
fn test_cmd_shim_resolution() {
    // 测试 pi-web.cmd 解析
    let shim_content = r#"@ECHO off
"%~dp0\..\@agegr\pi-web\bin\pi-web.js" %*"#;
    let resolved = resolve_cmd_shim(shim_content);
    assert!(resolved.contains("pi-web.js"));
}

#[cfg(target_os = "windows")]
#[test]
fn test_wsl_path_normalization() {
    let wsl_path = "\\\\wsl$\\Ubuntu\\home\\user";
    let normalized = normalize_wsl_path(wsl_path);
    assert!(normalized.contains("/home/user"));
}
```

### CI 集成

```yaml
# .github/workflows/test.yml
name: Rust Tests

on:
  push:
    paths:
      - 'src-tauri/**'
  pull_request:
    paths:
      - 'src-tauri/**'

jobs:
  test:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - name: Run Rust tests
        run: cd src-tauri && cargo test
```

## Testing Decisions

### 测试原则

1. **只测试外部行为，不测试实现细节**：测试 `detect_node()` 的返回值，不测试内部 PATH 探测顺序
2. **优先测试关键接缝**：环境检测、安装、进程管理是用户首次启动失败的主因
3. **跨平台测试矩阵**：macOS/Windows/Linux 各跑一遍

### 测试覆盖目标

| 接缝 | 测试类型 | 优先级 | 预期覆盖率 |
|------|----------|--------|------------|
| 环境检测 | 单元测试 | P0 | > 90% |
| 安装流程 | 单元测试 + 集成测试 | P0 | > 80% |
| 进程管理 | 单元测试 + 集成测试 | P0 | > 80% |
| 跨平台兼容 | 集成测试（CI 矩阵） | P1 | > 70% |

## Out of Scope

- 不做 E2E 测试（Playwright，后置）
- 不做性能测试（启动时间、内存占用）
- 不做 100% 覆盖率（优先关键路径）

## Further Notes

- 测试运行时间预期 < 30s（纯单元测试）
- CI 矩阵测试时间预期 < 5min（三平台并行）
- 参考 Minke 的 227 项桌面测试覆盖策略

---

## 实施记录（issue 22，已完成）

### 1. 现有 35 个测试盘点（实施前）

| 模块 | 已有测试 | 覆盖 |
|------|----------|------|
| env_detection.rs | 3 | version_cmp、parse_node_version、newest_version_bin（temp dir 注入） |
| process_manager.rs | 5 | WebSource::as_str、status_of、debug web_source、kill_process_group（unix，mock sleep）、is_port_open |
| installer.rs | 20（mac 上） | extract_install_error ×3、extract_installed_version ×2、build_npm_args（shape + cfg 平台/arch ×5）、verify_installation 健康检查全套（check_required_files、extract_package_version、verify_installation_with、probe_executable、truncate_stderr） |
| logger.rs | 2 | append_line 写入/追加/吞错 |
| commands.rs | 3 | latest_session_cwd 三分支 |
| main.rs | 2 | resolve_port env 覆盖 / debug 默认值 |

### 2. 真实缺口与本次补充（35 → 44，macOS 本地；Windows CI 上 46）

工单示例中的 `parse_version`、`check_node_version`、`get_fnm_candidates`、`resolve_cmd_shim`、`normalize_wsl_path`、`wait_for_port` 均为虚构接口，**未实现**；以真实代码为准补测：

- **main.rs（+2）**：`resolve_host` 的 env 覆盖与 loopback 默认值（cfg-gated debug）。新增 crate 级 `TEST_ENV_LOCK`（`#[cfg(test)]`，仅测试编译，零生产影响），统一串行化所有改环境变量的测试，避免跨模块并行竞态。
- **env_detection.rs（+1）**：`home_dir` 的 USERPROFILE 优先于 HOME（Windows 接缝，全平台断言真实优先级）。
- **commands.rs（+3）**：`default_cwd` 优先级链三分支——session cwd 优先于旧 pi-cwd 目录 / 取最新 pi-cwd 目录 / 无任何状态时创建今日 `pi-cwd-YYYYMMDD`（含日期格式断言）。用临时 HOME 注入保持封闭性。
- **process_manager.rs（+4，mac 上 +2）**：
  - `version_from_bin` 沿父目录找到 `@agegr/pi-web` 的 package.json 版本（全平台）；
  - `version_from_bin` 无 package.json 时返回 None（全平台）；
  - `#[cfg(windows)]`：`.cmd` shim 解析（真实 npm shim 格式 `%dp0%` 变量形式，`node_modules/.bin/pi-web.cmd` 穿透到真实入口版本）；
  - `#[cfg(windows)]`：`kill_process_group` 的 taskkill 分支冒烟测试（spawn `cmd /C ping -n 300`，10s 超时通道确认进程树被终止）。
- **installer.rs（+1）**：`extract_installed_version` 非 JSON 输入降级为 "unknown"。

未补（宁缺毋滥 / 无法在 debug 下测）：
- `check_node_requirement`/`find_bin`/`launcher`/`install_dir`/`run_npm`/`ensure_web_installed` 均为 `#[cfg(not(debug_assertions))]`，`cargo test`（debug）下不编译，无法单元测试（release-only，CI 不跑 release test，未强行加 `--release` 矩阵）。
- `is_port_open` 的"关闭后为 false"半段：`bind :0` 端口可被并行测试立即复用，断言有竞态（已有注释说明，保持不测）。

### 3. 集成测试层（tests/）结论：**不做**

src-tauri 是纯 bin crate（无 lib.rs），集成测试无法访问私有/`pub(crate)` 函数。加 lib.rs 暴露 pub 接口是大改动且会改变 crate 结构，与"不改变生产代码行为"约束冲突。模块间协作（如 `status_of`→`resolve_port`、`default_cwd`→`home_dir`/`version_cmp`、`verify_installation_with`→installer 内部）已由单元测试覆盖，协作接缝无真实缺口，故跳过 tests/ 层。

### 4. CI 三平台矩阵

新增 `.github/workflows/test-poweri-desktop.yml`：
- 触发：push/PR + `workflow_dispatch`，路径 `src-tauri/**`、`Cargo.toml`（src-tauri 下）、workflow 自身；`concurrency` 取消旧跑。
- 矩阵：`macos-latest / windows-latest / ubuntu-latest`，`fail-fast: false`。
- 步骤：checkout@v6 → （Linux 专用 apt 安装 Tauri v2 系统依赖 webkit2gtk-4.1 等，因 `cargo test` 编译完整 tauri app）→ `dtolnay/rust-toolchain@stable` → `swatinem/rust-cache@v2`（workspaces `./src-tauri -> target`，与 build workflow 一致）→ `cargo test`（working-directory: src-tauri）。
- 未加 clippy 强制（与现有 workflow 一致，保持最小可行）。平台/arch 断言均按 `#[cfg]` 门控，macos-latest（arm64）上成立。

### 5. 验证结果

- `cargo build`：通过（0 警告）。
- `cargo test`：44 passed（macOS debug；连续 3 次稳定无 flake）。Windows CI 上预期 46（多 2 个 `#[cfg(windows)]` 测试）。
- `cargo clippy --all-targets`：零新增 warning。
- YAML 语法：python3 yaml.safe_load 校验通过。
- 生产代码改动：仅 main.rs 增加 `#[cfg(test)] pub(crate) static TEST_ENV_LOCK`（测试基础设施，不进入生产二进制），其余全部为测试代码。无新增依赖。
