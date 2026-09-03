# src-tauri/ — PowerI 桌面壳

> Tauri 2 原生宿主。全局架构与范畴边界见 [`docs/desktop/architecture-and-scope-boundary.md`](../docs/desktop/architecture-and-scope-boundary.md)，构建/验证归属见 [`docs/desktop/file-map.md`](../docs/desktop/file-map.md)，发布流程见 [`docs/desktop/release.md`](../docs/desktop/release.md)。

壳**不打包 Web 应用**：它负责安装/拉起/升级 `@poweri/poweri-web` 子进程，等待端口就绪后把 UI 以 iframe 嵌入系统 WebView（macOS WKWebView / Windows WebView2 / Linux WebKitGTK）。产品本身全部住在上层：产品层见 [`poweri/README.md`](../poweri/README.md)。

## 目录导览

```
src-tauri/
├── src/                        # Rust 宿主
│   ├── main.rs                 # 入口、插件注册、托盘/窗口事件、DEFAULT_PORT（dev 9527 / prod 9989）、
│   │                           #   settings_path() = ~/.poweri/settings.json
│   ├── commands.rs             # Tauri IPC 命令（start_server、upgrade_poweri、check_update 等）
│   ├── process_manager.rs      # Node/Next.js 子进程拉起、健康检查、端口探活、退出时进程组清理
│   ├── env_detection.rs        # 系统 Node.js/npm/fnm/nvm 与 PATH 探测
│   ├── installer.rs            # npm 安装/升级流水线（PACKAGE_NAME = @poweri/poweri-web，
│   │                           #   安装 spec 恒为 @latest，与 npm 包版本解耦；
│   │                           #   托管目录 ~/.poweri/web，可用 POWERI_INSTALL_DIR 覆盖）
│   └── logger.rs               # 滚动日志：macOS ~/Library/Logs/PowerI/poweri.log、
│                               #   Windows %USERPROFILE%\.poweri\poweri.log
├── shell/                      # 壳宿主前端（Vite，产物输出 ../dist/）
│   ├── index.html + styles.css # 启动过渡界面、初始化动画、系统设置抽屉
│   ├── launch-machine.ts       # 启动状态机：Probing → Installing → Starting → Ready
│   ├── launch-machine.test.ts  # 状态机单测
│   └── main.ts                 # 状态机绑定、Tauri 事件监听、iframe 挂载
└── tauri.conf.json             # productName PowerI / identifier com.poweri.desktop
```

## 启动流程

1. 壳前端 `createLaunchMachine()` 向 Rust 发 `start_server`。
2. 端口探活（默认 9989）：**复用以 poweri-web 身份为前提**——`GET /poweri` 返回 2xx 才认定是自家服务（独立安装的 npm 包也在此端口）；被其他程序占用则报 `PORT_OCCUPIED`，不抢占。dev 模式（`tauri dev`）直接复用 `scripts/dev-shell.mjs` 拉起的 `next dev`（9527），Rust 不 spawn 子进程。
3. 无可用服务时由 `process_manager` 拉起 Node 子进程（优先系统安装副本，含 fnm 根目录探测；否则走 `installer` 自管安装）。
4. Rust 广播 `server:ready` → 壳前端把 iframe `src` 置为 `http://127.0.0.1:<PORT>/poweri?cwd=<ENCODED_CWD>`。
5. 应用退出时按进程组精确清理，杜绝 Node 孤儿进程。

## 端口约定

| 端口 | 归属 |
| --- | --- |
| 9989 | release 壳默认 + poweri-web 独立运行默认 + npm scripts |
| 9527 | dev 壳（`scripts/dev-shell.mjs`，与 Rust dev build 配对） |
| 1420 | 壳 UI 自身（vite devUrl） |
| 30141 | 上游 pi-web 遗留，PowerI 不使用 |

## 构建与发布

```bash
npm install
npm run tauri dev      # dev：beforeDevCommand = npm run desktop:dev（next dev + vite 并行）
npm run desktop        # 生产：shell:build（vite build → dist/）+ tauri build
npm run shell:test     # 壳前端状态机单测
cargo test             # 在 src-tauri/ 内跑 Rust 测试
```

安装包产出 `src-tauri/target/release/bundle/`（`.dmg` / `-setup.exe` / `.msi`）。CI：`.github/workflows/build-poweri-desktop.yml`（触达 `src-tauri/**` 的推送构建矩阵）、`test-poweri-desktop.yml`（测试）。发布走两条 tag 路径——**联发 `poweri-v*`**（npm 包 + 壳同步，默认路径）与**壳独立 `poweri-app-v*`**（仅壳，不触发 npm publish）；tag 一经推送不可移动，流程见 [`docs/desktop/release.md`](../docs/desktop/release.md)。

**版本解耦**：首装与升级均拉 `@poweri/poweri-web@latest`（`installer.rs package_spec()`），壳版本号与 npm 包版本号互不锁定，壳/Web 兼容性是发布时的人工检查项（runbook §门禁 5）。版本一致性只在打 tag 时由 CI 校验：联发 `poweri-v*` 要求 `package.json`（含 lock 两处）+ `tauri.conf.json` + `Cargo.toml`/`Cargo.lock` 五处同步；壳独立 `poweri-app-v*` 只要求 `src-tauri` 侧三处。

## 约定与注意事项

- 原生窗口、进程控制、托盘、日志等系统级代码**只能**写在本目录；界面与业务逻辑写在 `poweri/`——边界见 architecture-and-scope-boundary.md §7。
- 根 `tsconfig.json` exclude 了 `src-tauri/**`：改 `shell/` 后须单独 `tsc -p src-tauri/shell/tsconfig.json`。
- 壳内强制 `--no-open`，防止 pi-web 在桌面窗口内再弹浏览器标签页。
- Windows 侧需解析 `.cmd` shim 并容忍 WSL `\\wsl$` / `\\wsl.localhost` 路径（相关修复历史见 ownership.md §3）。
- 升级按钮 = `upgrade_poweri` → `npm install @poweri/poweri-web@latest` → 重启服务；更新检测走 `check_update`（`npm view` 比对），是壳升级按钮与 Web 内更新横幅的单一事实源。
