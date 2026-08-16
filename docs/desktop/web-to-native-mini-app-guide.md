# 把 Web 项目打包成「超小原生应用」——原理与 Agent 执行手册

> 来源：逆向分析 `dsh-desktop`（Tauri 2 项目，src-tauri/src/main.rs 仅 479 行）。
> 事实基线：macOS dmg = **1.8 MB**，Windows exe = **1.4 MB**（v0.2.5 release 实测）。

---

## 0. 结论（TL;DR）

「小」来自三个叠加因素，缺一不可：

1. **框架层**：用 **Tauri 2** 而不是 Electron。Tauri 不捆绑 Chromium，而是调用操作系统自带的 WebView 引擎（macOS = WKWebView，Windows = WebView2，Linux = WebKitGTK）。这砍掉了 60~150MB 的浏览器内核。
2. **内容层**：**业务 UI 不入安装包**。安装包里只有一个几百字节的「壳」页面（工具栏），真正的业务界面由应用启动时动态拉取/生成，通过 iframe 加载 `http://127.0.0.1:PORT`。
3. **构建层**：Rust release profile 做了体积优化（`opt-level = "s"` + `lto = true` + `strip = true`）。

dsh-desktop 的核心思路一句话：**做一个「进程管理器 + 全屏 iframe」的薄壳，让 Web 服务在本地跑，壳的 WebView 去访问它。**

---

## 1. 原理剖析（对照源码）

### 1.1 整体架构

```
┌────────────────────────────────────────────────┐
│  DSH Desktop 安装包 (~1.8 MB)                    │
│  ┌──────────────────────────────────────────┐  │
│  │ 系统 WebView（WKWebView / WebView2）      │  │
│  │  ┌────────────────────────────────────┐  │  │
│  │  │ iframe → http://127.0.0.1:3080     │  │  │ ← 业务 UI 在这里
│  │  └────────────────────────────────────┘  │  │
│  │  Tauri IPC（invoke 命令 / event 事件）    │  │
│  └──────────────────┬───────────────────────┘  │
│  │ Rust 进程管理器（main.rs）                 │  │
│  │  spawn / 杀进程树 / 端口探测 / 日志转发     │  │
│  └──────────────────┬───────────────────────┘  │
└─────────────────────┼─────────────────────────┘
                      │ fork/exec
        ┌─────────────▼─────────────┐
        │ npx --yes @deepseek-ai/dsh web │ ← 业务进程（Node，npx 动态拉取最新版）
        │ → 本地 HTTP 服务器 127.0.0.1:3080   │
        └───────────────────────────┘
```

### 1.2 六个关键机制（源码位置即证据）

| # | 机制 | 作用 | dsh-desktop 中的实现位置 |
|---|------|------|--------------------------|
| 1 | **Tauri 2 框架** | 系统 WebView 渲染，安装包小 | `src-tauri/Cargo.toml`（依赖仅 tauri/serde/libc） |
| 2 | **业务进程由 Rust spawn** | 启动 `npx --yes @deepseek-ai/dsh web`，stdout/stderr 走管道 | `main.rs:137-145` `dsh_command()`；`main.rs:180-213` 双线程转发日志 |
| 3 | **端口探测做就绪检测** | `TcpStream::connect(127.0.0.1:3080)` 每 250ms 轮询，90s 超时，成功后 emit `server:ready` | `main.rs:126-128` `is_port_open()`；`main.rs:229-247` 轮询线程 |
| 4 | **进程组管理** | unix 用 `process_group(0)` + `kill(-pid, SIGTERM/SIGKILL)` 杀整棵进程树；Windows 用 `taskkill /T /F` | `main.rs:131-145`；`main.rs:152-163` |
| 5 | **Tauri command + event** | Rust 暴露 6 个命令（start/stop/restart/status/upgrade/version），日志通过 `app.emit` 推给前端 `listen` | `main.rs:255-330`；`src/main.ts:150-190` |
| 6 | **壳页面 iframe 加载远程 URL** | 前端只有一个工具栏页面，业务 UI 在 iframe 中指向 `http://127.0.0.1:3080`，未就绪时显示 loading 遮罩 | `index.html`（54 行）；`src/main.ts:33-38` `showApp()` |

### 1.3 体积优化的构建参数（`src-tauri/Cargo.toml`）

```toml
[profile.release]
codegen-units = 1   # 单代码单元，利于 LTO
lto = true          # 链接期优化，去死代码
opt-level = "s"     # 按体积优化
strip = true        # 剥离符号表
```

### 1.4 平台适配（这些坑是移植时最容易忽略的）

- **macOS**：从 Finder/Dock 启动时 GUI 进程 PATH 很干净（无 node/npx），所以显式探测 `fnm` 路径，用 `fnm exec --using default -- npx` 启动（`main.rs:60-73`）。
- **Windows**：`Command::new("npx")` 找不到 `.cmd` shim，必须走 `cmd /C npx`；子进程加 `CREATE_NO_WINDOW` 避免闪黑窗；把 `Program Files/nodejs` 等目录手动并入 PATH（`main.rs:75-130`）。
- **退出清理**：`RunEvent::ExitRequested` 时 kill 整个进程组，否则 Node 子进程会成为孤儿（`main.rs:464-479`）。
- **端口复用**：若 3080 已被占用（用户自己开过服务），不重复 spawn，直接复用并提示（`main.rs:170-174`）。

---

## 2. 迁移到你的 Web 项目：先判断场景

| 场景 | 你的 web 项目形态 | 做法 | 业务 UI 是否入包 |
|------|------------------|------|------------------|
| **A. 可命令行启动** | 是 npm 包/CLI，能 `npx xxx` 或 `node xxx.js` 起本地服务 | **照抄 dsh-desktop 全流程**，只换包名和端口 | ❌ 不入包（最省，~2MB） |
| **B. 纯静态前端** | 只有 `dist/`（vite build 产物），无后端 | 常规 Tauri 做法：`frontendDist: ../dist`，前端资源直接进包 | ✅ 入包（~10-25MB，仍远小于 Electron） |
| **C. 有后端/数据库** | 前端 + 本地 API 服务（Node/Python/任意二进制） | dsh 模式 spawn 后端进程，前端 iframe 连 localhost；后端可入包（`resources`）或 npx 拉取 | 前端入包 / 后端按需 |

> 场景 A 最贴合本仓库，下文执行手册按 A 写；B/C 的差异点在第 3.3 节单独说明。

---

## 3. Agent 执行手册（可照做）

### 阶段 0：环境准备（一次性）

```bash
# 1. Rust 工具链（必需）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # 或 brew install rust
rustc --version   # 验证

# 2. Node.js 18+（你的 web 服务运行时，若走 npx 方案则必须）
node --version && npm --version

# 3. 系统 WebView（Tauri 需要）
# macOS: WKWebView 系统自带，无需安装
# Windows: WebView2 Runtime —— Win11 自带；Win10 通常已装（Edge 更新附带）
# Linux: sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev

# 4. 脚手架（在目标仓库目录外先练手）
npm create tauri-app@latest my-shell -- --template vanilla-ts
cd my-shell
npm install
npm run tauri dev   # 应弹出空窗口，验证工具链 OK
```

验收标准：`tauri dev` 能弹出窗口，控制台无报错。

### 阶段 1：建壳 —— 把前端换成「工具栏 + iframe」

1. 重写 `index.html`：一个可隐藏的工具栏（状态点/日志 tab/按钮）+ `<iframe id="app-iframe" src="about:blank">` + loading 遮罩。（可直接参考 dsh-desktop 的 `index.html` + `src/main.ts` + `src/styles.css`，共约 540 行，全部可复用改造。）
2. 前端依赖只需 `@tauri-apps/api`（invoke + listen），**不要引入任何 UI 框架**——壳越薄越好。
3. 窗口配置（`src-tauri/tauri.conf.json`）保持默认即可。

### 阶段 2：Rust 侧 —— 抄进程管理器

把 `src-tauri/src/main.rs` 按需改造成你的版本：

```rust
// 1. 改启动命令：把 "npx --yes @deepseek-ai/dsh web" 换成你的
fn server_command() -> Command {
    let mut c = base_npx_cmd();          // 或直接 Command::new("你的可执行文件")
    c.args(["run", "server"]);           // 你的启动参数
    c
}

// 2. 改端口常量
const PORT: u16 = 8080;                  // 你的服务端口
```

必须保留的骨架（每个都有存在理由）：
- ✅ `is_port_open()` + 轮询线程（就绪检测）—— 90s 超时 + 进程提前退出即报错
- ✅ `process_group(0)` + 退出时 kill 进程组 —— 否则关窗留孤儿进程
- ✅ stdout/stderr 双线程管道 → `app.emit` —— 日志面板的数据源
- ✅ `#[tauri::command]` 列表：start/stop/restart/status +（可选）version/upgrade
- ✅ `base_npx_cmd()` 的 macOS fnm 探测 + Windows `cmd /C` 分支 —— 双击启动时 PATH 是干净的，直接 `Command::new("npx")` 在 Finder/桌面启动场景会失败

### 阶段 3：构建体积参数 + 打包配置

```toml
# src-tauri/Cargo.toml —— 照抄
[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

```jsonc
// src-tauri/tauri.conf.json 要点
{
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",     // 开发热更新端口
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"              // 场景 A 下 dist 只有几 KB 的壳
  },
  "bundle": { "active": true, "icon": ["icons/icon.icns", "icons/icon.ico", ...] }
}
```

生成图标：`npx tauri icon your-logo.png`（自动产出全套尺寸）。

### 阶段 4：构建与验证

```bash
npm run tauri build
# 产物: src-tauri/target/release/bundle/
#   macOS: *.dmg / *.app.tar.gz / *.msi(win)
#   Windows: *-setup.exe / *.msi
```

验证清单（每项都要过）：
- [ ] 安装包体积 < 10MB（场景 A 应 ~2MB）
- [ ] 双击图标冷启动 → 自动拉起服务 → 界面出现（无需开终端）
- [ ] 服务未就绪时显示 loading，90s 超时给出错误 + 重试按钮
- [ ] 关闭窗口后 `ps aux | grep <你的服务>` 无残留进程
- [ ] 重启应用，若端口已被外部占用 → 复用而非崩溃
- [ ] CLI 日志面板实时滚动、2000 行截断
- [ ] 卸载/删除 app 后无残留服务进程

### 阶段 5：CI 发布（照抄 `.github/workflows/release.yml`）

- GitHub Actions matrix：`macos-latest`(aarch64 + x86_64) + `windows-latest`
- 三件套：`dtolnay/rust-toolchain`、`swatinem/rust-cache`（workspaces 指向 `./src-tauri -> target`）、`tauri-apps/tauri-action@v0`
- 打 tag `v*` 自动发 release；`tauri-action` 自动上传 dmg/exe/msi 资产

---

## 4. 三种场景的差异点

### 场景 B（纯静态前端，无服务）
- 不需要 main.rs 里的进程管理、端口轮询、日志转发 —— 删掉即可，`frontendDist` 直接指向 build 产物
- 若业务站点**不需要与桌面交互**，甚至可以零 Rust 逻辑：只有 `tauri.conf.json` + 前端
- 体积约 = 前端产物 + 5MB Rust 运行时（前端多少就多少，不再有浏览器内核的 100MB 大头）

### 场景 C（前端 + 本地后端）
- 后端二进制随包分发：`bundle.resources: ["path/to/server-bin"]`，Rust 里用 `app.path().resource_dir()` 定位后 spawn
- 后端是解释型（Node/Python）：要么要求用户装运行时，要么用 npx 方案（场景 A 逻辑原样复用）
- 注意：`bundle.resources` 会让包体积 + 后端大小，但通常仍是 Electron 的 1/5~1/10

### 场景 A 的关键决策：你的服务用什么命令启动
- 已发布为 npm 包 → `npx --yes <pkg> <args>`（永远最新，无需随 app 发版）—— dsh 模式
- 私有/未发布 → `Command::new("node").args(["server.js"])`，把 server.js 放进 `bundle.resources` 随包分发
- 打包成单个可执行文件（bun build --compile / deno compile / pkg）→ 直接 spawn 那个二进制，体验最接近原生

---

## 5. 常见坑速查

| 坑 | 症状 | 解法 |
|----|------|------|
| Finder 双击启动找不到 npx | `无法启动 ...：No such file or directory` | macOS 必须做 fnm/node 路径探测（main.rs `base_npx_cmd`） |
| Windows 闪黑窗 | 启动时 cmd 窗口一闪 | `creation_flags(0x08000000)` = CREATE_NO_WINDOW |
| 关窗后服务还在跑 | `lsof -i :端口` 有残留 | 退出事件 kill 进程组；unix 用负 PID `kill(-pid)` |
| 端口被占 | 服务启动失败 EADDRINUSE | 先探测端口，占用则直接复用并提示 |
| 首次启动慢 | 用户以为卡死 | 就绪前显示 loading + 日志 tab 可见 + 90s 超时兜底 |
| 未签名 App 打不开（macOS） | 「已损坏」提示 | 告知用户 `sudo xattr -cr /Applications/XXX.app`；正式分发买 Developer ID 签名（$99/年） |
| Windows SmartScreen 拦截 | 未知发布者警告 | 正式分发需代码签名证书；小范围使用可忽略 |
| WebView2 缺失（老 Win10） | 白屏 | 引导安装 WebView2 Runtime（或 bundle 里附带引导） |

---

## 6. 实例分析：pi-web →「Pi Web Desktop」（已验证可行）

> 分析对象：`/Users/tianzhao/code/github/pi-web`（@agegr/pi-web，Next.js 16 + React 19 的 pi coding agent Web UI）。

### 6.1 结论

**✅ 完全可行，且属于最省力的场景 A**——pi-web 天生就是「本地服务 + Web UI」，与 dsh-desktop 模式 100% 同构。用 Tauri 壳 + `npx` 拉取 + iframe 内嵌即可，安装包预计 **~2MB**，改动量比 dsh-desktop 还小（因为它本身就是服务，不需要 CLI+Web 双进程管理）。

### 6.2 证据链（为什么可行）

| 前提条件 | pi-web 的实际情况 | 证据位置 |
|---------|------------------|---------|
| 可命令行启动 | `"bin": {"pi-web": "bin/pi-web.js"}`，`npx @agegr/pi-web@latest` 一键启动 | `package.json` |
| 本地 HTTP 服务 | spawn `node next start -p 30141 -H 127.0.0.1`，仅监听 loopback | `bin/pi-web.js` |
| 日志可转发 | stdout 持续输出（含 `Ready` 标记） | `bin/pi-web.js`（child.stdout.on data） |
| 可禁用自动开浏览器 | `--no-open` 参数 / `PI_WEB_NO_OPEN=1`（壳内必须禁用，否则每次弹浏览器） | `bin/pi-web-options.js` |
| 无 iframe 内嵌限制 | 主 UI 无 `X-Frame-Options`/CSP 限制；仅导出 HTML 和文件预览页有限制，不影响 | grep 全库仅 2 处且均非主 UI |
| WebView 请求不被 403 | `lib/request-security.ts`：Host 必须是 loopback/IP 字面量（`127.0.0.1` ✅）；Origin 须与请求同源（iframe 内 fetch 同源 ✅） | `lib/request-security.ts` |
| 数据可访问 | 读 `~/.pi/agent`，Tauri 桌面应用默认无沙箱，直接可读 | README Notes |

### 6.3 相对 dsh-desktop 的差异点（改造清单）

1. **启动命令**：`npx --yes @agegr/pi-web --no-open`（必须带 `--no-open`；dsh 无此参数）
2. **端口常量**：`3080 → 30141`（`main.rs` 的 `const PORT`）
3. **Node 版本门槛更高**：pi-web 要求 **Node >= 22.19.0**（dsh 只要 18+）。无需自己写检查——pi-web 启动时会自行校验并向 stderr 报错（`bin/node-version.js`），桌面壳的「启动失败 → 日志面板可见 → 重试」流程天然兜底；建议 README 写明系统要求
4. **版本显示（可选）**：dsh 的 `npx pkg --version` 探针在 pi-web 上不适用（它没有 `--version` 输出，`next start` 也不认）。替代方案：
   - 简单：从启动日志的 npx 下载行用 `extract_version()` 提取（dsh 已有此函数）
   - 可靠：`npm view @agegr/pi-web version`（需网络，做成异步命令）
   - 或干脆不显示
5. **升级按钮（可选）**：dsh 用 `npx pkg@latest --version` 触发下载。pi-web 替代方案：spawn `npx --yes @agegr/pi-web@latest --no-open -p 39999`（`@latest` 强制更新 npx 缓存），等端口 39999 就绪或超时 15s 后 kill 进程组，再正常重启服务——达到「强制拉最新版」效果
6. **就绪检测**：端口轮询已够（30141 监听即 Ready）；stdout 的 `Ready` 字样可作辅助信号
7. **进程组管理**：**必须保留**。pi-web 在服务器进程内运行 AgentSession，会 spawn 项目命令（git/shell 等），退出时负 PID 杀整组才能清干净
8. **端口复用**：保留 dsh 的「端口已占用则复用」逻辑（用户可能已手动跑过 pi-web）

### 6.4 建议的架构（最小改动版）

- 新建仓库 `pi-web-desktop`，复制 dsh-desktop 结构：`index.html` + `src/main.ts` + `src/styles.css` + `src-tauri/`（main.rs 改 6.3 的差异点）
- 窗口/工具栏文案换成 Pi Web；顶部状态栏可显示「agent 运行中」指示（pi-web 有 `/api/agent/running` 接口，可作为进阶增强：壳定期轮询，用 `app.emit` 或直接 fetch）
- CI 照抄 `.github/workflows/release.yml`（macos arm/x64 + windows matrix）

### 6.5 残余风险（低）

- 首次启动 npx 下载包体积较大（Next.js 依赖树），表现为「启动中…」时间较长——loading 文案提示首次安装需下载即可
- agent 会话运行在服务器进程内，关窗 = 中断会话（与浏览器里关 tab 行为一致，可接受）
- WebView 版本差异（WKWebView vs Chrome）：pi-web 面向现代浏览器，如遇渲染差异可要求用户装 Edge/Chrome 或忽略

---

## 8. 决策附录：这个方案的缺点清单（先读再动手）

> 按严重程度分层。核心认知：**这个方案解决的是「不用开终端/不用记命令/不用管进程」，代价是把版本、网络、环境、体验问题全部转移给了运行时。**

### 架构级（方案根本局限）

1. **不是真正的打包——依赖用户机器环境**：必须预装 Node（pi-web 需 ≥22.19.0）；首次启动联网下载 npm 包；离线/内网不可用。
2. **版本失控**：`@latest` 漂移，无法锁定/回滚；上游发坏版本所有用户同时遭殃；壳与上游 UI 的兼容性不受控。
3. **双进程模型排障面宽**：问题可能来自 Rust 壳 / npx / npm 缓存 / Node 版本 / 网络 / 端口 / 上游 bug，每一层都要排查；main.rs 479 行里一大半在消化这个模型自身的复杂度。

### 体验级

4. **安装包小 ≠ 快 ≠ 省内存**：WebView 本身就是完整浏览器内核 + 常驻 Next.js 服务进程，内存 300~500MB 很正常，与 Electron 相当；启动 5~30 秒（首装更久），远不如原生。
5. **iframe 内嵌的浏览器特性缺失（需逐项实测）**：跨源 iframe 中 `navigator.clipboard` 默认无权限（缓解：iframe 加 `allow="clipboard-write"`）、拖拽文件上传行为因 WebView 而异、`window.open`/`target="_blank"` 弹窗异常、下载/打印怪癖；壳无法访问业务 DOM，任何原生集成只能靠 HTTP API 轮询。
6. **业务页面无桌面感知**：无托盘/通知/开机启动/原生菜单；关窗=杀服务进程。pi-web 场景下 agent 长任务无法「后台继续跑」。

### 工程/分发级

7. **分发信任**：未签名触发 Gatekeeper（`xattr -cr`）/SmartScreen；无法上 Mac App Store（沙箱禁止 spawn + 下载执行代码）；企业白名单环境不可部署。
8. **测试与可复现性差**：CI 依赖外部网络拉包；上游变动可能无声破坏兼容；E2E 要处理下载/端口/网络。
9. **中国网络环境**：npm registry 访问慢/失败，npx 拉取体验差（除非用户自配镜像）。

### 何时应该选别的方式

- 离线/内网部署、应用商店/企业签名分发、非技术用户、重度依赖拖拽/剪贴板/弹窗/下载、需要深度原生集成 → 改走**场景 B（前端入包）**：体积 10~25MB 仍远小于 Electron，且无上述大部分问题。

---

## 9. 最小可行性验证（30 分钟版）

如果只想先证明「这条路走得通」，做这个最小实验：

1. `npm create tauri-app@latest probe -- --template vanilla-ts`
2. 把 `index.html` 的 body 换成：`<iframe src="http://127.0.0.1:3000" style="width:100%;height:100%;border:0">`
3. `tauri.conf.json` 的 `frontendDist` 改为 `../src`（先不管安全配置）
4. 终端另起 `python3 -m http.server 3000`
5. `npm run tauri dev` —— 窗口里应直接显示 python 服务的页面
6. `npm run tauri build` —— 看安装包大小，感受一下 Tauri 的体积

这一步通过后，再按阶段 1-5 做正式版（把 python 换成真正的进程管理）。
