# File Map — pi-web 文件地图

> 从 AGENTS.md 分流（2026-08-20）。静态参考：需要时再读，不必常驻上下文。

## File Map

```
app/api/
  sessions/route.ts               GET  list all sessions
  sessions/[id]/route.ts          GET/PATCH/DELETE session
  sessions/[id]/context/route.ts  GET ?leafId= — context for a specific leaf
  sessions/[id]/export/route.ts   GET exported HTML for a session
  agent/new/route.ts              POST { cwd, message, toolNames?, provider?, modelId? }
  agent/[id]/route.ts             GET state | POST any command
  agent/[id]/events/route.ts      GET SSE stream
  agent/running/route.ts          GET currently-running session ids
  agent/running/events/route.ts   GET SSE stream of currently-running session ids
  auth/all-providers/route.ts     GET API-key provider list
  auth/api-key/[provider]/route.ts GET/POST/DELETE provider API key status/storage
  auth/login/[provider]/route.ts  GET OAuth/device-code SSE | POST manual code
  auth/logout/[provider]/route.ts POST OAuth logout
  auth/providers/route.ts         GET OAuth provider list
  cwd/validate/route.ts           POST validate/select a cwd
  default-cwd/route.ts            POST create ~/pi-cwd-YYYYMMDD
  files/[...path]/route.ts        GET file contents for viewer
  home/route.ts                   GET user home directory
  models/route.ts                 GET { models, modelList, defaultModel }
  models-config/route.ts          GET/PUT — read/write ~/.pi/agent/models.json
  models-config/catalog/route.ts  GET models.dev pricing presets
  models-config/discover/route.ts POST fetch a configured provider's upstream model list
  models-config/test/route.ts     POST test a configured model/provider
  plugins/route.ts                GET/POST package plugin management
  skills/route.ts                 GET/PATCH loaded skills and disable-model-invocation
  skills/install/route.ts         POST install skills through npx skills add
  skills/search/route.ts          GET/POST skills.sh search
  worktrees/route.ts              GET/POST/DELETE git worktrees

lib/
  agent-client.ts      typed fetch helper for /api/agent commands
  draft-store.ts       local draft persistence helpers
  file-access.ts       allowed file roots for /api/files and worktrees
  file-paths.ts        client/server path encoding helpers
  markdown.ts          shared markdown helpers
  npx.ts               npx runner used by skill install
  pi-types.ts          local structural types for pi SDK objects
  rpc-manager.ts      AgentSessionWrapper + registry + startRpcSession
  session-reader.ts   SessionManager wrappers + path cache + buildSessionContext adapter
  tool-presets.ts     PRESET_NONE/READ_ONLY/DEFAULT/FULL + getPresetFromTools()
  tool-preset-preference.ts  browser-persisted default for fresh sessions
  types.ts            shared TypeScript types
  normalize.ts        normalizeToolCalls() — field name mismatch between file format and our types
  worktree.ts         project/worktree resolution and git worktree operations

components/
  AppShell.tsx        layout + URL state + tab management
  SessionSidebar.tsx  session tree + FileExplorer
  ChatWindow.tsx      chat composition + completion sound wrapper
  ChatInput.tsx       input bar + model/thinking/tools/compact controls
  MessageView.tsx     renders one message (user/assistant/toolCall/toolResult)
  BranchNavigator.tsx in-session branch switcher
  ChatMinimap.tsx     scroll minimap alongside the message list
  MarkdownBody.tsx    markdown renderer
  ModelsConfig.tsx    modal for editing models.json (opened from sidebar bottom)
  PluginsConfig.tsx   modal for installed package plugins
  SkillsConfig.tsx    modal for loaded/search/installable skills
  FileExplorer.tsx    file tree inside sidebar
  FileIcons.tsx       file icon helpers
  FileViewer.tsx      file content in a tab
  TabBar.tsx          tab bar (Chat + open file tabs)

hooks/
  useAgentSession.ts  messages + streaming + SSE + fork/navigate/reconciliation logic
  useAudio.ts         completion sound + browser AudioContext unlock
  useDragDrop.ts      shared drag/drop state
  useIsMobile.ts      responsive breakpoint hook
  useTheme.ts         theme state
```

## 壳 / npm 包边界（归属与验证判定）

> 与 [architecture-and-scope-boundary.md](architecture-and-scope-boundary.md)（职责与架构全景）互补：
> 那份回答「谁负责什么」，本节只回答「**一个改动落在哪一侧、用哪条命令验证、跨边界时要同步什么**」。

### 仓库里有两把正交的尺子

| 尺子 | 判的问题 | 判据 | 权威来源 |
|---|---|---|---|
| **上游 / PowerI 持有** | 能不能改（红线） | `git cat-file -e upstream/main:<path>` | `AGENTS.md` + [ownership.md](ownership.md) |
| **壳 / npm 包** | 怎么构建、发布、验证 | 进程边界：Rust + 壳前端 = 壳；Next.js 服务进程 = 包 | 本节 |

两把尺子互不等价：`src-tauri/` 既不是上游文件、也不进 npm 包；
`app/api/**` 既属于 npm 包，又（实测 45/45 路由）全部是上游禁改文件。

> ⚠️ **基线精度**：旧判据用 `origin/main`，但那是 **fork 的 main**，实测比真上游 `upstream/main` 多 4 个提交（含桌面 CI workflow 与 WSL 路径修复）
> → 会把自家文件误判为上游禁改。完整理由与三层归属模型见 [ownership.md](ownership.md)。

### ① Tauri 壳范畴

交付形态 = 桌面安装包（`.github/workflows/build-poweri-desktop.yml` → `npm run desktop` = `shell:build` + `tauri build`）。

| 路径 | 内容 | 验证手段 |
|---|---|---|
| `src-tauri/src/main.rs` | 入口、插件注册、`DEFAULT_PORT`（dev 9527 / prod 30141，`:44`/`:46`）、`settings_path()` = `~/.poweri/settings.json`（`:52`） | `cargo test`（`src-tauri/`） |
| `src-tauri/src/commands.rs` | 14 个 invoke 命令面（见下表） | 同上 |
| `src-tauri/src/process_manager.rs` | spawn 服务进程、端口探活、`server:ready`/`exited`/`timeout`、进程组清理 | 同上 |
| `src-tauri/src/installer.rs` | `PACKAGE_NAME = "@poweri/poweri-web"`（`:29`）、安装 spec `包@CARGO_PKG_VERSION`（`:282`）、托管安装目录 `~/.poweri/web`（`:136`） | 同上 |
| `src-tauri/src/env_detection.rs` | node / npm / fnm / nvm 路径探测（Finder 双击无 PATH 的兜底） | 同上 |
| `src-tauri/src/logger.rs` | 日志：macOS `~/Library/Logs/PowerI/poweri.log`、Windows `%USERPROFILE%\.poweri\poweri.log` | 同上 |
| `src-tauri/{tauri.conf.json,Cargo.toml,capabilities/default.json,icons/}` | 窗口/`devUrl` 1420/`frontendDist: ../dist`；capability 权限与 `remote.urls` | `tauri build` |
| `src-tauri/shell/` | **壳自己的前端**（不是产品 UI）：`index.html` topbar+loading+日志面板+设置抽屉+错误引导；`main.ts` 状态机绑定与 iframe 挂载；`launch-machine.ts` 纯逻辑状态机（`LaunchState` 共 17 态 = 8 正常态 + 9 个 `error-*`）；`styles.css` | `npm run shell:test`；类型检查 `tsc -p src-tauri/shell/tsconfig.json` |
| `vite.config.ts` | 只服务壳：`root: "src-tauri/shell"`、`outDir: "dist"`、port 1420 | `npm run shell:build` |
| `scripts/dev-shell.mjs` | `beforeDevCommand`：并起 `next dev -p 9527` + `vite`（**流程归壳，被启动的进程归包**） | `npm run desktop:dev` |
| `dist/`、`src-tauri/target/`、`src-tauri/gen/schemas/` | 构建产物，已 gitignore | — |
| `~/.poweri/`（运行时，非仓库） | `settings.json`（端口/监听）、`web/`（托管安装）、日志 | 手工验证 |

**注意**：根 `tsconfig.json` 的 `exclude` 含 `src-tauri/**` —— `node_modules/.bin/tsc --noEmit` **不覆盖壳前端**，改 `src-tauri/shell/` 必须单独 `tsc -p src-tauri/shell/tsconfig.json`。

### ② PowerI npm 包范畴（`@poweri/poweri-web`，bin `pi-web`）

交付形态 = npm tarball。实测 `npm pack --dry-run` → 84 files，只含 `bin/ .next/ public/ next.config.ts package.json`，**不含 `src-tauri/`、`dist/`、`poweri/` 源文件**（后者已编译进 `.next/`）。

| 路径 | 层归属 | 可否修改 |
|---|---|---|
| `poweri/{layout,features,components,lib,styles}` | 产品层 | ✅ desktop 自有，永不参与上游合并 |
| `app/poweri/` | 产品层入口 | ✅ `page.tsx`（壳加载 `/poweri`）+ `api/`（8 个自有路由：`session-stats`、`usage`、`session-summaries`、`resolve-file`、`skills/market`、`skills/toggle`、`plugins/packages`、`attachments/upload`） |
| `app/prototype/` | ~~原型~~ | 已于 `4f92d54`（2026-09-01）删除；今后原型写在 `poweri/` 子目录或 throwaway 分支（`prototype/<feature>`） |
| `app/api/**` | 基础引擎层 | ❌ 实测 45/45 全是上游文件 → 禁改 |
| `lib/`、`hooks/`、`components/`、`public/`、`bin/`、`next.config.ts`、`instrumentation.ts`、`proxy.ts`、根配置 | 基础层（上游） | ❌ 禁改 |

验证：`npm run dev`（30141，浏览器直开）→ `node_modules/.bin/tsc --noEmit` → `npm test`（glob `app/components/hooks/lib/public/**/*.test.mjs`，**不含 `poweri/`**）；
PowerI 测试需单独跑：`node --test poweri/lib/*.test.mjs`（实测 50 pass）。

### 速判口诀

- `npm run dev` 刷新即见 → **包**；要 `cargo build` / `tauri build` 才生效 → **壳**。
- 只影响窗口/托盘/进程/安装升级/环境探测/启动引导/设置抽屉 → **壳**。
- 影响 iframe 内任何呈现与业务逻辑 → **包**。

## 跨边界契约（改一侧必须同 PR 同步另一侧）

### IPC：包 → 壳

壳侧 `invoke_handler`（`main.rs`）注册 14 个命令：
`start_server` `stop_server` `restart_server` `server_status` `upgrade_poweri` `poweri_version` `web_info` `check_update` `default_cwd` `get_port` `default_port` `set_server_config` `log_error` `open_url` `reveal_in_folder`。

包侧调用点（代码在包里、语义在壳上）：

| 包侧文件 | 依赖 | 说明 |
|---|---|---|
| `poweri/lib/file-actions.ts:64-65` | `window.__TAURI_INTERNALS__` / `__TAURI__` → `reveal_in_folder`、`open_url` | **跨源 iframe 不注入 `__TAURI_INTERNALS__`**，故有 Web 降级路径；探测顺序即降级契约 |
| `poweri/lib/external-link-bridge.ts` | `postMessage`，`SHELL_SOURCE = "poweri-shell"` ↔ `src-tauri/shell/main.ts` | `target="_blank"` 点击在 webview 里被静默丢弃，须转壳调 `open_url` |
| `poweri/lib/attachment-helper.ts:83` | `isTauriEnv()` | 桌面存盘传相对路径，Web 内联 `<attached_files>` XML |

### 事件：壳 → 包（实际名称，勿凭记忆改写）

`server:ready` `server:stdout` `server:stderr` `server:exited` `server:stopped` `server:timeout` `web:installing` `web:installed` `web:install-failed`。
**没有 `web:ready`**（就绪事件是 `server:ready`）。

### 版本三角锁

`src-tauri/Cargo.toml` version == `src-tauri/tauri.conf.json` version == `package.json` version（现三处均 `0.2.0`）。
理由：`installer.rs:282` 的安装 spec 是 `@poweri/poweri-web@<CARGO_PKG_VERSION>`，壳会去 npm 拉与自己版本号同值的 web 包。

### 端口三对

| 端口 | 两侧对齐点 |
|---|---|
| 9527（dev） | `main.rs:44` ↔ `scripts/dev-shell.mjs` |
| 30141（prod） | `main.rs:46` ↔ `bin/pi-web.js` 默认值 |
| 1420（壳 UI） | `vite.config.ts` ↔ `tauri.conf.json` `devUrl` |

### 升级与版本检测（桌面全走壳，不再经包内 /api/app-update）

- **升级**：`upgrade_poweri` → `npm install @poweri/poweri-web@latest`（`commands.rs`）→ PowerI 本体。
- **版本检测**：`check_update` → `npm view @poweri/poweri-web version` 比对本地版本（`commands.rs`）；壳升级按钮与新会话横幅（`poweri/components/ChatWindow` 经 IPC 桥 `tauriInvoke`）共用此单一事实源。
- 上游 `app/api/app-update/route.ts`（查 `@agegr%2Fpi-web`，链 `github.com/agegr/pi-web`）仅服务上游 `/` 浏览器 UI；PowerI 产品层已不调用。

### iframe 加载契约

`src-tauri/shell/main.ts:703,810` 构造 `APP_URL = http://127.0.0.1:<PORT>/poweri`，首挂附加 `?cwd=<encoded>`（`:205-206`）；`POWERI_ENTRY = "/poweri"`（`:12`）。
包侧任何路由改名都要同步 `POWERI_ENTRY`。
