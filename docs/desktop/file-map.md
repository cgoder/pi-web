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
| `src-tauri/src/main.rs` | 入口、插件注册、`DEFAULT_PORT`（dev 9527 / prod 9989，`:47`/`:49`）、`settings_path()` = `~/.poweri/settings.json`（`:52`） | `cargo test`（`src-tauri/`） |
| `src-tauri/src/commands.rs` | 14 个 invoke 命令面（见下表） | 同上 |
| `src-tauri/src/process_manager.rs` | spawn 服务进程、端口探活、`server:ready`/`exited`/`timeout`、进程组清理 | 同上 |
| `src-tauri/src/installer.rs` | `PACKAGE_NAME = "@poweri/poweri-web"`（`:29`）、安装 spec 恒 `@latest`（`package_spec()` `:333`，首装与升级同路径，壳版本与 npm 包版本解耦）、托管安装目录 `~/.poweri/web`（`install_dir()` `:154`，`POWERI_INSTALL_DIR` 可覆盖） | 同上 |
| `src-tauri/src/env_detection.rs` | node / npm / fnm / nvm 路径探测（Finder 双击无 PATH 的兜底） | 同上 |
| `src-tauri/src/logger.rs` | 日志：macOS `~/Library/Logs/PowerI/poweri.log`、Windows `%USERPROFILE%\.poweri\poweri.log` | 同上 |
| `src-tauri/{tauri.conf.json,Cargo.toml,capabilities/default.json,icons/}` | 窗口/`devUrl` 1420/`frontendDist: ../dist`；capability 权限与 `remote.urls` | `tauri build` |
| `src-tauri/shell/` | **壳自己的前端**（不是产品 UI）：`index.html` topbar+loading+日志面板+设置抽屉+错误引导；`main.ts` 状态机绑定与 iframe 挂载；`launch-machine.ts` 纯逻辑状态机（`LaunchState` 共 17 态 = 8 正常态 + 9 个 `error-*`）；`styles.css` | `npm run shell:test`；类型检查 `tsc -p src-tauri/shell/tsconfig.json` |
| `vite.config.ts` | 只服务壳：`root: "src-tauri/shell"`、`outDir: "dist"`、port 1420 | `npm run shell:build` |
| `scripts/dev-shell.mjs` | `beforeDevCommand`：并起 `next dev -p 9527` + `vite`（**流程归壳，被启动的进程归包**） | `npm run desktop:dev` |
| `dist/`、`src-tauri/target/`、`src-tauri/gen/schemas/` | 构建产物，已 gitignore | — |
| `~/.poweri/`（运行时，非仓库） | `settings.json`（端口/监听）、`web/`（托管安装）、日志 | 手工验证 |

**注意**：根 `tsconfig.json` 的 `exclude` 含 `src-tauri/**` —— `node_modules/.bin/tsc --noEmit` **不覆盖壳前端**，改 `src-tauri/shell/` 必须单独 `tsc -p src-tauri/shell/tsconfig.json`。

### ② PowerI npm 包范畴（`@poweri/poweri-web`，主 bin `poweri-web`）

交付形态 = npm tarball。实测 `npm pack --dry-run` → 84 files，只含 `bin/ .next/ public/ next.config.ts package.json`，**不含 `src-tauri/`、`dist/`、`poweri/` 源文件**（后者已编译进 `.next/`）。

| 路径 | 层归属 | 可否修改 |
|---|---|---|
| `poweri/{layout,features,components,lib,styles}` | 产品层 | ✅ desktop 自有，永不参与上游合并 |
| `app/poweri/` | 产品层入口 | ✅ `page.tsx`（壳加载 `/poweri`）+ `api/`（8 个自有路由：`session-stats`、`usage`、`session-summaries`、`resolve-file`、`skills/market`、`skills/toggle`、`plugins/packages`、`attachments/upload`） |
| `app/prototype/` | ~~原型~~ | 已于 `4f92d54`（2026-09-01）删除；今后原型写在 `poweri/` 子目录或 throwaway 分支（`prototype/<feature>`） |
| `app/api/**` | 基础引擎层 | ❌ 实测 45/45 全是上游文件 → 禁改 |
| `lib/`、`hooks/`、`components/`、`public/`、`bin/`、`next.config.ts`、`instrumentation.ts`、`proxy.ts`、根配置 | 基础层（上游） | ❌ 禁改 |

验证：`npm run dev`（9989，浏览器直开）→ `node_modules/.bin/tsc --noEmit` → `npm test`（glob `app/components/hooks/lib/public/**/*.test.mjs`，**不含 `poweri/`**）；
PowerI 测试需单独跑：`node --test poweri/lib/*.test.mjs`（实测 50 pass）。

### 速判口诀

- `npm run dev` 刷新即见 → **包**；要 `cargo build` / `tauri build` 才生效 → **壳**。
- 只影响窗口/托盘/进程/安装升级/环境探测/启动引导/设置抽屉 → **壳**。
- 影响 iframe 内任何呈现与业务逻辑 → **包**。

## 跨边界契约（改一侧必须同 PR 同步另一侧）

### IPC：包 → 壳

壳侧 `invoke_handler`（`main.rs`）注册 15 个命令：
`start_server` `stop_server` `restart_server` `server_status` `upgrade_poweri` `poweri_version` `web_info` `check_update` `default_cwd` `get_port` `default_port` `set_server_config` `log_error` `open_url` `reveal_in_folder`。

但**包侧经桥能调的不是全集**：`src-tauri/shell/main.ts` 的 `BRIDGE_COMMANDS` 白名单只放行
`check_update` `upgrade_poweri` `reveal_in_folder` `plugin:clipboard-manager|write_text`；
桥同时校验 `event.origin === APP_ORIGIN`（`http://127.0.0.1:<PORT>`）并只向该 origin 回帖。
**包侧新增 `tauriInvoke` 调用必须同 PR 加进白名单**，否则运行时被拒（壳日志会打「已拒绝越权 IPC 调用」）。

包侧调用点（代码在包里、语义在壳上）：

| 包侧文件 | 依赖 | 说明 |
|---|---|---|
| `poweri/lib/file-actions.ts`（`tauriInvoke`） | `window.__TAURI_INTERNALS__` / `__TAURI__` → 否则 postMessage 桥 → `check_update`、`upgrade_poweri`、`reveal_in_folder`、剪贴板插件 | **跨源 iframe 不注入 `__TAURI_INTERNALS__`**，故有降级路径；探测顺序即降级契约，命令集受壳侧 `BRIDGE_COMMANDS` 白名单约束 |
| `poweri/lib/external-link-bridge.ts` | `postMessage`，`SHELL_SOURCE = "poweri-shell"` ↔ `src-tauri/shell/main.ts` | `target="_blank"` 点击在 webview 里被静默丢弃，须转壳调 `open_url` |
| `poweri/lib/attachment-helper.ts:83` | `isTauriEnv()` | 桌面存盘传相对路径，Web 内联 `<attached_files>` XML |

### 事件：壳 → 包（实际名称，勿凭记忆改写）

`server:ready` `server:stdout` `server:stderr` `server:exited` `server:stopped` `server:timeout` `web:installing` `web:installed` `web:install-failed`。
**没有 `web:ready`**（就绪事件是 `server:ready`）。

### 版本解耦（2026-09-03 起）

壳首装/升级均拉 `@poweri/poweri-web@latest`（`installer.rs package_spec()`），壳版本与 npm 包版本互不锁定；壳/Web 兼容性是发布时人工检查项。版本一致性仅由发布 tag 的 CI 校验：联发 `poweri-v*` 五处同步（`package.json`、`package-lock.json`×2、`tauri.conf.json`、`Cargo.toml`/`Cargo.lock`）；壳独立 `poweri-app-v*` 仅 `src-tauri` 侧三处。详见 `docs/desktop/release.md`。

### 端口三对

| 端口 | 两侧对齐点 |
|---|---|
| 9527（dev） | `main.rs:47` ↔ `scripts/dev-shell.mjs` |
| 9989（prod） | `main.rs:49` ↔ `poweri/bin/poweri-web.js`（独立 bin 默认值）↔ package.json scripts（dev/start）。PowerI 专用，pi-web 上游 30141（`bin/pi-web.js` 默认值，legacy `pi-web` bin 仅为旧壳保留）不再被 poweri-web 使用；启动复用按身份判定（boot 快路径 `server_status` 与 `start_internal` 共用 `reusable_web_on_port`：自家 pid 信任，否则 `GET /poweri` 返 2xx 才复用），否则报 `PORT_OCCUPIED`。独立运行详见 `docs/desktop/poweri-web-standalone.md` |
| 1420（壳 UI） | `vite.config.ts` ↔ `tauri.conf.json` `devUrl` |

### 升级与版本检测（桌面全走壳，不再经包内 /api/app-update）

- **升级**：`upgrade_poweri` → `npm install @poweri/poweri-web@latest`（`commands.rs`）→ PowerI 本体。
- **版本检测**：`check_update` → `npm view @poweri/poweri-web version` 比对本地版本（`commands.rs`）；壳升级按钮与新会话横幅（`poweri/components/ChatWindow` 经 IPC 桥 `tauriInvoke`）共用此单一事实源。
- **缓存**：`check_update` 结果缓存在壳进程内（成功 12h / 失败 60s，`UPDATE_CACHE`），启动时由壳按钮预热；升级成功后主动失效。包侧桥超时因此只为首次冷查询留余量（30s），`upgrade_poweri` 给 360s（npm 安装上限 300s）。
- **已知取舍**：纯浏览器自托管（无壳）不渲染更新横幅——`tauriInvoke` 返回 `null` 即隐藏，因为没有可验证的升级执行者；这类用户自行 `npm install -g @poweri/poweri-web@latest`。
- 上游 `app/api/app-update/route.ts`（查 `@agegr%2Fpi-web`，链 `github.com/agegr/pi-web`）仅服务上游 `/` 浏览器 UI；PowerI 产品层已不调用。

### iframe 加载契约

`src-tauri/shell/main.ts:703,810` 构造 `APP_URL = http://127.0.0.1:<PORT>/poweri`，首挂附加 `?cwd=<encoded>`（`:205-206`）；`POWERI_ENTRY = "/poweri"`（`:12`）。
包侧任何路由改名都要同步 `POWERI_ENTRY`。
