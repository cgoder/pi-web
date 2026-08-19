---
title: Rust 后端模块化重构
status: done
type: task
blocked-by: []
---

# Rust 后端模块化重构

## Problem Statement

`src-tauri/src/main.rs` 当前 1477 行，承担环境检测、进程管理、安装、升级、日志所有职责。跨平台 PATH 探测逻辑脆弱，难以测试和维护。Minke 的三层架构提示了拆分方向。

## Solution

将 main.rs 拆分为多个职责单一的模块：

```
src-tauri/src/
├── main.rs              # 入口，Tauri 配置，模块协调
├── env_detection.rs     # Node/npm/fnm/nvm/PATH 探测，版本检查
├── process_manager.rs   # pi-web 子进程 spawn/kill/reuse，端口就绪轮询
├── installer.rs         # npm install --prefix 逻辑，错误码解析
├── logger.rs            # 日志写入
└── commands.rs          # Tauri command 定义（invoke 入口）
```

## User Stories

1. As a maintainer, I want main.rs split into modules, so that each responsibility can be tested and evolved independently
2. As a contributor, I want to locate environment detection logic in a dedicated module, so that I can add support for new Node version managers without touching process management code
3. As a CI engineer, I want to run unit tests on individual modules, so that regressions in env detection don't require building the full Tauri app

## Implementation Decisions

### 模块接口

- `env_detection::detect_node() -> Result<NodeInfo, EnvError>`
- `env_detection::find_piweb() -> Result<PathBuf, EnvError>`
- `process_manager::spawn_piweb(node: &NodeInfo, port: u16) -> Result<Child, SpawnError>`
- `process_manager::kill_process_group(pid: u32)`
- `process_manager::is_port_open(port: u16) -> bool`
- `installer::ensure_installed(prefix: &Path) -> Result<InstallInfo, InstallError>`
- `installer::extract_install_error(json: &str) -> (String, String)`
- `logger::init() -> Result<(), LoggerError>`
- `logger::log_line(msg: &str)`

### 迁移策略

1. **先提取纯函数**：`extract_install_error`、`parse_version` 等无状态函数先移到独立模块
2. **再提取状态ful 逻辑**：env detection、process management 带状态，需要仔细处理生命周期
3. **main.rs 保留 Tauri setup/builder**：调用模块函数，不删除 Tauri 配置代码

> **接口命名决定（2026-08-19，重构实施时）**：保留原有函数名（`check_node_requirement`/`start_internal`/`ensure_web_installed` 等）而非 spec 提案的 `detect_node`/`spawn_piweb`/`ensure_installed`，以保持行为不变、减少回归风险；若后续需要新接口名，可再单独重构。

### 测试要求

- 每个模块至少一个 `#[cfg(test)]` 测试块
- 纯函数 100% 覆盖（parse_version、extract_install_error）
- 进程管理测试用 mock 进程，不依赖真实 pi-web

## Testing Decisions

- 单元测试：每个模块的 `#[cfg(test)]` 块
- 集成测试：`tests/` 目录，测试模块间协作
- 运行：`cd src-tauri && cargo test`

## Out of Scope

- 不改变 Tauri command 的外部接口（invoke 参数不变）
- 不引入新的依赖（如 async runtime 切换）
- 不做环境检测逻辑迁移到 shell 层（后置）

## Further Notes

- 预期 main.rs 从 1477 行降到 < 500 行
- 每步提取后运行 `cargo build` 和 `cargo test` 验证
- 参考 Minke 的 HarnessRuntime 模块划分
