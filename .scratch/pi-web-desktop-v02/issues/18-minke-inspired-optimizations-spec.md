---
title: Minke 启发的工程优化总纲
status: backlog
type: spec
---

# Minke 启发的工程优化总纲

> 来源：Minke v0.1.0（DeepSeek Harness 桌面应用）开发经验分析
> 关联：[temp/research/minke-architecture-insights.md](../../temp/research/minke-architecture-insights.md)

## Problem Statement

PowerI v0.1.8 已完成基础功能（启动向导、系统 pi-web 检测、升级按钮），但工程成熟度与 Minke v0.1.0 存在差距：

1. **Rust 后端复杂度高**：`main.rs` 1477 行，承担环境检测、进程管理、安装、升级、日志所有职责，跨平台 PATH 探测逻辑脆弱
2. **安装体积大**：pi-web 首次下载 ~270MB（含所有平台的 optional dependencies），用户体验差
3. **无体积监控**：pi-web 依赖膨胀无法感知，无 CI 门禁
4. **无安装后验证**：npm install 成功后无健康检查，损坏的安装无法自动恢复
5. **接缝测试缺失**：环境检测、安装流程、进程管理等关键接缝无自动化测试

Minke 的经验提示：**桌面应用最昂贵的回归集中在"源码—构建—runtime—安装包—操作系统"这条长链路的接缝上**。PowerI 需要建立类似的工程纪律。

## Solution

分阶段实施五项工程优化：

1. **Rust 后端模块化**（18-rust-backend-modularization）：拆分 main.rs 为多个职责单一的模块
2. **安装体积优化**（19-install-size-optimization）：依赖闭包计算 + 平台裁剪
3. **安装后健康检查**（20-post-install-health-check）：验证 pi-web 安装完整性
4. **接缝测试体系**（21-seam-testing-framework）：覆盖环境检测、安装、进程管理、跨平台兼容
5. **CI 体积监控**（22-ci-size-monitoring）：每次构建验证安装体积，防止膨胀

## User Stories

### Rust 后端模块化

1. As a maintainer, I want main.rs split into modules, so that each responsibility (env detection, process management, installation, logging) can be tested and evolved independently
2. As a contributor, I want to locate environment detection logic in a dedicated module, so that I can add support for new Node version managers without touching process management code
3. As a CI engineer, I want to run unit tests on individual modules, so that regressions in env detection don't require building the full Tauri app

### 安装体积优化

4. As a first-time user, I want the initial pi-web download to be as small as possible, so that I can start using PowerI quickly even on slow networks
5. As a macOS ARM64 user, I don't want to download Windows/Linux native modules, so that disk space is not wasted on incompatible binaries
6. As a maintainer, I want to control which dependencies are installed, so that I can prevent volume regression when pi-web adds new optional dependencies

### 安装后健康检查

7. As a user, I want PowerI to verify that pi-web was installed correctly, so that I don't encounter cryptic runtime errors on first launch
8. As a maintainer, I want the health check to run automatically after npm install, so that corrupted installations are detected and can be retried
9. As a support engineer, I want the health check to log detailed diagnostics, so that I can troubleshoot installation failures remotely

### 接缝测试体系

10. As a maintainer, I want automated tests for the environment detection seam, so that I can verify fnm/nvm/PATH detection works across macOS/Windows/Linux
11. As a CI engineer, I want tests for the installation seam, so that npm install timeout and error code parsing are validated before release
12. As a release manager, I want tests for the process management seam, so that zombie processes and port conflicts are caught in CI
13. As a cross-platform developer, I want tests for Windows .cmd shim resolution and WSL path handling, so that Windows-specific bugs don't slip through

### CI 体积监控

14. As a maintainer, I want CI to report pi-web install size on every build, so that I can detect volume regression early
15. As a release manager, I want CI to fail the build if install size exceeds a budget, so that users don't experience unexpected download bloat
16. As a contributor, I want to see install size breakdown in CI logs, so that I can identify which dependencies are growing

## Implementation Decisions

### 1. Rust 后端模块化

**模块划分**：
- `env_detection.rs`：Node/npm/fnm/nvm/PATH 探测链，版本检查
- `process_manager.rs`：pi-web 子进程 spawn/kill/reuse，端口就绪轮询
- `installer.rs`：npm install --prefix 逻辑，错误码解析
- `logger.rs`：日志写入 ~/Library/Logs/PowerI/（macOS）
- `commands.rs`：Tauri command 定义（invoke 入口）
- `main.rs`：入口，Tauri 配置，模块协调

**接口边界**：
- `env_detection::detect_node() -> Result<NodeInfo, EnvError>`
- `process_manager::spawn_piweb(node: &NodeInfo) -> Result<Child, SpawnError>`
- `installer::ensure_installed(prefix: &Path) -> Result<InstallInfo, InstallError>`

**迁移策略**：
- 先提取纯函数（extract_install_error、parse_version）到独立模块
- 再提取状态ful 逻辑（env detection、process management）
- main.rs 保留 Tauri setup/builder 配置，调用模块函数

### 2. 安装体积优化

**依赖闭包计算**：
```rust
// installer.rs
fn build_npm_args(prefix: &str) -> Vec<String> {
    let mut args = vec![
        "install".to_string(),
        "--prefix".to_string(),
        prefix.to_string(),
        "--omit=dev".to_string(),      // 移除 devDependencies
        "--omit=optional".to_string(), // 移除 optional dependencies
    ];
    
    // 平台裁剪
    #[cfg(target_os = "macos")]
    args.push("--os=darwin".to_string());
    #[cfg(target_arch = "aarch64")]
    args.push("--cpu=arm64".to_string());
    
    args.push(PACKAGE.to_string());
    args
}
```

**预期收益**：270MB → 150-180MB（减少 30-40%）

**验证**：
- 安装后运行 `pi-web --version` 验证功能完整
- CI 对比优化前后体积

### 3. 安装后健康检查

**检查项**：
- `pi-web --version` 可执行
- 关键依赖文件存在（node_modules/@agegr/pi-web/bin/pi-web.js）
- 端口 30141 未被占用（可选，启动时再检查）

**实现**：
```rust
// installer.rs
fn verify_installation(prefix: &Path) -> Result<(), HealthCheckError> {
    let piweb_bin = prefix.join("node_modules/.bin/pi-web");
    
    let output = Command::new(&piweb_bin)
        .arg("--version")
        .output()
        .map_err(|e| HealthCheckError::ExecutionFailed(e.to_string()))?;
    
    if !output.status.success() {
        return Err(HealthCheckError::VersionCheckFailed);
    }
    
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    log_line(&format!("pi-web health check passed: {}", version));
    
    Ok(())
}
```

**失败处理**：
- 健康检查失败 → 删除安装目录，提示用户重试
- 连续 3 次失败 → 显示详细错误日志，引导用户手动安装

### 4. 接缝测试体系

**测试框架**：
- Rust 后端：`#[cfg(test)]` 模块 + `tests/` 集成测试
- Shell UI：Vitest 单元测试（与 pi-web 一致）
- E2E：Playwright（iframe 交互，可选）

**关键接缝**：

#### 4.1 环境检测接缝

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
    }
}
```

#### 4.2 安装接缝

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
    fn test_build_npm_args_platform_specific() {
        let args = build_npm_args("/tmp/test");
        assert!(args.contains(&"--omit=dev".to_string()));
        #[cfg(target_os = "macos")]
        assert!(args.contains(&"--os=darwin".to_string()));
    }
}
```

#### 4.3 进程管理接缝

```rust
// src-tauri/src/process_manager.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_port_open() {
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
}
```

#### 4.4 跨平台接缝

```rust
// src-tauri/tests/cross_platform_test.rs
#[cfg(target_os = "macos")]
#[test]
fn test_fnm_candidates_macos() {
    assert!(FNM_CANDIDATES.contains(&"/opt/homebrew/bin/fnm"));
}

#[cfg(target_os = "windows")]
#[test]
fn test_cmd_shim_resolution() {
    // 测试 pi-web.cmd 解析
    let shim_content = r#"@ECHO off
"%~dp0\..\@agegr\pi-web\bin\pi-web.js" %*"#;
    // 验证解析逻辑
}
```

### 5. CI 体积监控

**实现**：
```yaml
# .github/workflows/size-check.yml
name: Install Size Check

on:
  push:
    paths:
      - 'src-tauri/**'
      - 'package.json'
  pull_request:
    paths:
      - 'src-tauri/**'
      - 'package.json'

jobs:
  check-size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - name: Install pi-web and measure size
        run: |
          npm install --prefix ./test-install --omit=dev --omit=optional @agegr/pi-web
          SIZE=$(du -sm ./test-install | cut -f1)
          echo "Install size: ${SIZE}MB"
          echo "SIZE=${SIZE}" >> $GITHUB_ENV
      
      - name: Check size budget
        run: |
          BUDGET=200  # MB
          if [ ${{ env.SIZE }} -gt $BUDGET ]; then
            echo "::error::Install size ${{ env.SIZE }}MB exceeds budget ${BUDGET}MB"
            exit 1
          fi
      
      - name: Upload size report
        run: |
          echo "## Install Size Report" > size-report.md
          echo "- Install size: ${{ env.SIZE }}MB" >> size-report.md
          echo "- Budget: 200MB" >> size-report.md
      
      - uses: actions/upload-artifact@v4
        with:
          name: size-report
          path: size-report.md
```

**体积预算**：
- 初始预算：200MB（优化后预期 150-180MB）
- 每次 PR 检查，超预算则 CI 失败
- 每月审查预算合理性，按需调整

## Testing Decisions

### 测试原则

1. **只测试外部行为，不测试实现细节**：测试 `detect_node()` 的返回值，不测试内部 PATH 探测顺序
2. **优先测试关键接缝**：环境检测、安装、进程管理是用户首次启动失败的主因
3. **跨平台测试矩阵**：macOS/Windows/Linux 各跑一遍，Windows 重点测试 .cmd shim 和 WSL 路径

### 测试覆盖

| 接缝 | 测试类型 | 优先级 | 预期覆盖率 |
|------|----------|--------|------------|
| 环境检测 | 单元测试 | P0 | > 90% |
| 安装流程 | 单元测试 + 集成测试 | P0 | > 80% |
| 进程管理 | 单元测试 + 集成测试 | P0 | > 80% |
| 跨平台兼容 | 集成测试（CI 矩阵） | P1 | > 70% |
| 健康检查 | 单元测试 | P1 | > 80% |

### 测试运行

```bash
# Rust 单元测试
cd src-tauri && cargo test

# Rust 集成测试
cd src-tauri && cargo test --test '*'

# Shell UI 测试
npm run test -- shell/

# CI 全平台测试
# 见 .github/workflows/test.yml
```

## Out of Scope

1. **插件系统**：当前阶段不引入 Cordis 或类似插件系统，保持 shell 职责单一
2. **Tauri → Electron 迁移**：PowerI 架构与 Tauri 匹配，无迁移压力
3. **多 Agent Runtime 支持**：v0.2 只做 pi-web，多 runtime 后置
4. **离线模式**：首次安装仍需网络，离线安装包后置
5. **多窗口支持**：v0.2 单窗口，多窗口后置

## Further Notes

### 优先级路线图

| 阶段 | 时间 | 目标 | 关键任务 |
|------|------|------|----------|
| **v0.2.0** | 1-3 月 | 架构优化 | Rust 模块化、安装体积优化、健康检查 |
| **v0.3.0** | 3-6 月 | 工程成熟 | 接缝测试体系、CI 体积监控、自动更新 |
| **v1.0.0** | 6-12 月 | 产品成熟 | 离线模式、多窗口、与 Minke 互操作 |

### 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Rust 模块化重构引入 bug | 高 | 先写测试，再重构；分步提取，每步验证 |
| 平台裁剪导致功能缺失 | 中 | 健康检查验证功能完整；CI 全平台测试 |
| 体积预算过严限制功能 | 中 | 每月审查预算合理性，按需调整 |
| 接缝测试维护成本高 | 低 | 优先测试关键接缝，不追求 100% 覆盖 |

### 关键指标

**监控指标**：
- 首次启动时间（目标 < 30s）
- pi-web 安装体积（目标 < 180MB）
- 环境检测成功率（目标 > 95%）
- 跨平台测试覆盖率（目标 > 80%）

**质量门禁**：
- 每次构建验证安装体积
- 每次发布运行完整测试矩阵
- 每次 PR 检查 Rust 代码复杂度（main.rs < 500 行）

### 参考资源

- [Minke v0.1.0 开发经验文章](https://mp.weixin.qq.com/s/VT_RcdN70nsBauAYbIIXkg)
- [Minke 架构分析笔记](../../temp/research/minke-architecture-insights.md)
- [PowerI v0.2 航图](./map.md)
