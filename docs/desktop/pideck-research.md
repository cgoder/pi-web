# PiDeck 打包方案研究报告（与我们的方案对比）

> 研究日期：2026-08-16
> 对象：https://github.com/ayuayue/PiDeck（v0.7.1，Electron 38/43 + React 19 + TypeScript）
> 方法：DeepWiki + GitHub README + 源码浅克隆（/tmp/pideck-research）交叉验证

## 一句话结论

PiDeck 是「厚壳薄运行时」：React UI 全部打包进 Electron，Agent 运行时靠用户系统已安装的 `pi` CLI（spawn `pi --mode rpc` 子进程，stdio JSONL 通信）。
与我们的「Tauri 壳 + npx 运行时拉取 + iframe 内嵌」方案**不相同**，但同属「壳 + 外部 pi 运行时」流派——**Agent 能力不重实现，由 pi 本体提供，壳只做编排与呈现**。

## 架构要点（源码证据）

- **框架**：Electron 43 + electron-vite + electron-builder（asar: true, compression: maximum）；无任何 Rust/Tauri 代码
- **UI 入包**：React renderer 构建为静态资源打进 asar，主进程 `loadFile("../renderer/index.html")` 直接加载，离线可用；主 UI 无 iframe（webview 仅用于附加的"内置浏览器预览"功能，且默认 `webviewTag: false`）
- **Agent 运行时不入包**：`src/main/pi/PiLocator.ts` 注释原文 *"These directories only locate an existing pi installation; pi itself is not bundled yet."* —— 扫描 PATH + 20+ 跨平台目录（npm/pnpm/yarn/volta/asdf/mise/fnm/scoop/bun/deno/homebrew 等）定位系统已装的 pi，`--version` 健康检查，找不到则提示用户安装
- **进程模型**：一个 Agent Tab = 一个 `PiProcess`（`pi --mode rpc --no-themes --offline [-e 内置扩展] [--session xxx]`），绑定项目目录为 cwd；`PiRpcClient` 走 **JSONL over stdin/stdout**（请求 id + 30s 超时 + 事件流），零端口、无 HTTP 层
- **数据对接**：直接读写 pi 的 `.pi/sessions/*.jsonl` 与 `models.json`/`auth.json`/`settings.json`
- **更新机制**：主进程查 GitHub Release API → 弹窗展示发布日志 → 系统浏览器下载新安装包（不做静默自动更新）

## 与「Tauri + npx + iframe」方案对比

| 维度 | PiDeck | 我们的方案 |
|---|---|---|
| 壳框架 | Electron 43（捆绑 Chromium，~100MB 级） | Tauri（系统 WebView，~2MB） |
| 业务 UI 位置 | 全部打包进 asar，离线可用 | npx 运行时拉取，需网络/缓存 |
| 主 UI 承载 | BrowserWindow loadFile 打包资源 | iframe 内嵌本地 HTTP 服务 |
| 与 Agent 通信 | stdio JSONL（零端口零网络栈） | HTTP 端口 + 轮询/事件流 |
| pi 获取 | 定位系统已装 pi（不装不下载） | npx 拉取（自带分发与版本管理） |
| 更新 | GitHub Release 提示下载 | 需自建（壳更新 vs 业务热更新分层） |
| 原生能力 | pty 终端/托盘/系统通知/Git 集成/局域网 Web | 几乎无 |

## 它踩过的坑（实战经验）

1. 打包应用 PATH 不完整（macOS GUI 无 Homebrew PATH、Windows Explorer 启动 PATH 缺失）→ PiLocator 多目录扫描 + login shell PATH + 用户手动指定
2. Windows cmd shim 引号地狱：路径含空格时自控引号包装 + `windowsVerbatimArguments` 禁止 Node 二次转义；弃用 .ps1 走 .cmd
3. Windows 中文 GBK stderr 乱码：`--version` 检查用 buffer + `TextDecoder('gbk')` 兜底
4. 子进程环境消毒：spawn 前剔除 `ELECTRON_*`/`CHROME_*`/`GOOGLE_API_*` 及 NODE_OPTIONS 中 electron token
5. dev server 固定 127.0.0.1（避免 IPv6 ::1 优先解析超时）；5173 落 Hyper-V 动态端口排除区 → 改 5181
6. 会话文件兼容预检：旧版私有 `sessionName` 头行会导致 pi "Session file is not a valid pi session" 直接 exit 1
7. 第三方扩展冲突：spawn 前临时"停放"黑名单扩展，退出后还原
8. 版本特性兼容：`--approve` 等新参数按 `--version` 次版本号条件传递

## 对我们的借鉴点

1. **RPC over stdio 优于 HTTP 端口轮询**（无端口冲突、无 CORS、天然隔离）——若未来走深度集成路线，参考其 JSONL 协议设计
2. **pi 定位三件套**：候选目录扫描 + `--version` 健康检查 + 诊断信息收集（stderr 缓冲 + 等效命令行回显）——npx 方案同样需要降级路径
3. **子进程环境消毒**：壳 spawn 业务进程时剔除壳注入的环境变量
4. **升级分层**：壳更新（检查→提示→交系统浏览器）与运行时版本各管各的
5. **托盘常驻**：解决"关窗中断 agent"痛点；PiDeck 默认关窗最小化到托盘
