# Key Design Decisions & Traps — 关键决策与陷阱

> 从 AGENTS.md 分流（2026-08-20）。改动相关子系统前先读对应条目。

## Key Design Decisions & Traps

### AgentSession lifecycle (`lib/rpc-manager.ts`)
- One `AgentSessionWrapper` per session id, keyed in `globalThis.__piSessions`
- `globalThis` survives Next.js hot-reload; plain module-level Map does not
- Idle timeout: 10 minutes. Concurrent `startRpcSession()` calls share a single start Promise (`globalThis.__piStartLocks`)

### Fork must destroy the wrapper immediately
`AgentSession.fork()` **mutates the wrapper's inner state in-place** — after fork, `inner.sessionId` is the *new* session's id. If the wrapper stays alive in the registry under the old id, the next request gets the already-forked state and subsequent forks produce a corrupt `parentSession` chain.

**Fix**: `send("fork")` captures `newSessionId`, then calls `this.destroy()` before returning. The next request for the original session reloads a clean AgentSession from the original file.

### Two kinds of branching — don't confuse them
- **Fork** (Fork button on user message): creates a new independent `.jsonl` file. Shown as a child in the sidebar tree via `parentSession` header field.
- **In-session branch** (Continue button / BranchNavigator): calls `navigate_tree` within the same file. Multiple entries share the same `parentId`. Switching between them calls `/api/sessions/[id]/context?leafId=`.

### Session files can be fully rewritten
`parentSession` in the header is **display metadata only** — has zero effect on chat content. Safe to `writeFileSync` the entire file (pi does this itself during migrations). Used when cascade-reparenting children on delete.

### ToolCall field normalization
Pi stores toolCall blocks as `{type:"toolCall", id, name, arguments}` but `ToolCallContent` uses `{toolCallId, toolName, input}`. `normalizeToolCalls()` in `lib/normalize.ts` handles this — called in both `session-reader.ts` (file load) and `ChatWindow.handleAgentEvent()` (streaming).

### New session tool preset
Tool names are passed at session creation (`POST /api/agent/new` → `toolNames[]`). For existing sessions, the active preset is inferred on mount via `get_tools` → `getPresetFromTools()`. When tools are fully disabled (`toolNames = []`), `rpc-manager.ts` passes an empty tool allow-list and forces `agent.state.systemPrompt = ""` after startup/reload/resource discovery.

The last preset explicitly selected by the user is stored in browser `localStorage` and initializes fresh-session composers only. Existing sessions never trust that preference; they use their live `get_tools` state or pi's default when no wrapper exists.

### Model defaults for new sessions
`GET /api/models` returns `defaultModel` read from `~/.pi/agent/settings.json`. `ChatWindow` pre-selects this on mount for new sessions. Explicit browser model/thinking selections are applied atomically during AgentSession construction, then `lib/startup-preferences.ts` persists their effective values without replaying `set_model`/`set_thinking_level`; implicit `enabledModels` fallbacks and thinking pins are not persisted.

### `enabledModels` scoping
The `enabledModels` setting uses pi's `--models` syntax: minimatch globs against `provider/modelId` or a bare `modelId`, fuzzy matching for non-glob patterns, and an optional `:thinkingLevel` suffix. Never compare those patterns as literal strings — `lib/model-scope.ts` delegates to the SDK's `resolveModelScopeWithDiagnostics()` so pi-web and the TUI agree on the visible model list, and falls back to all available models when patterns resolve to nothing. `startRpcSession()` resolves that scope before creating an AgentSession and passes the selected initial model, thinking pin, and SDK-native `scopedModels` atomically; `GET /api/models` reuses the helper only for selector data, `thinkingLevelPins`, and `modelScopeWarnings` display.

### SSE reconnect on page refresh mid-stream
On `ChatWindow` mount, `GET /api/agent/[id]` is called. If `state.isStreaming === true`, SSE is reconnected automatically. `thinkingLevel` and `isCompacting` are also synced from this response.

### Compaction SSE events
Newer pi emits `compaction_start` / `compaction_end`; older versions emitted `auto_compaction_start` / `auto_compaction_end`. `handleAgentEvent` accepts both sets to keep `isCompacting` in sync. Manual compact is a blocking POST — the button stays disabled until the response returns.

### Running state polling + reconciliation
- The sidebar polls `/api/agent/running` every 2.5 seconds while the tab is visible and pauses polling in background tabs. The session-list response remains the initial fallback.
- `useAgentSession` treats per-session SSE as primary for chat events and opens it before each prompt. `prompt_done` completes the current UI stage and notification immediately, but the idle SSE stays open for a 30-second grace window and is reused by the next prompt. `agent_start` cancels that close timer; `agent_settled` finishes extension-injected runs that have no wrapper-level `prompt_done` and starts a fresh grace window. Do not close on the first `agent_end`: retries, compaction, and extension-queued messages can continue the same logical prompt.
- While a run is active, `useAgentSession` periodically calls `GET /api/agent/[id]` and also reconciles on `visibilitychange`/`online`. This fixes missed terminal events from background tabs or half-open connections.
- Prompt runs use a monotonic run id; late SSE or slow reconciliation responses from an old run must be ignored so they cannot resurrect stale streaming bubbles.

### Worktrees and project grouping
- `lib/worktree.ts` resolves linked worktree top-levels back to the main repo `projectRoot`; `listAllSessions()` attaches that to each `SessionInfo` so all worktrees for one repo are grouped together in the sidebar.
- Worktree operations are served by `/api/worktrees` and guarded by the same allowed-root rules as `/api/files`.
- New worktrees are created under `<repoRoot>-worktrees/<sanitized-branch>`. Existing branches are reused; otherwise `git worktree add -b` creates the branch.
- Removing a dirty worktree returns `409` with `{ dirty: true }` so the UI can ask before retrying with `force`.
- Sessions whose cwd points at a removed worktree are inferred back into the main project instead of becoming a phantom project row.
- git prints POSIX-style absolute paths even on Windows, so every path read out of git goes through `toNativePath()` (`lib/paths.ts`) before it is compared or returned. Compare paths with `samePath()`, never `===` — raw equality made `isTopLevel` permanently false on Windows and hid the worktree switcher entirely. Branch names are not paths and must keep their forward slashes. Browser code cannot apply Node path rules, so `/api/worktrees` resolves `currentWorktreePath` server-side; the sidebar must use that identity for highlighting and removal fallback.

### File access allow-list
- `/api/files` is intentionally not a general filesystem browser. Allowed roots come from session cwds, their resolved project roots, `~/pi-cwd-*`, and roots explicitly added with `allowFileRoot()`.
- `/api/cwd/validate`, `/api/default-cwd`, and `/api/worktrees` call `allowFileRoot()` when they make a new location browsable.
- Allowed roots are stored slash-normalized, but that is a Set-key convention, not a correctness requirement: `isPathWithinRoots()` (`lib/path-security.ts`, the single implementation behind `isFilePathAllowed()`) re-resolves and case-folds both sides, so either path form authorizes correctly. Keep that one implementation — it is the security boundary.

### Plugins and skills
- `/api/plugins` uses pi's `SettingsManager` + `DefaultPackageManager` for global/project package install, remove, update, enable, and disable. Disabling writes empty `extensions/skills/prompts/themes` arrays for that package entry.
- `/api/skills` uses `DefaultResourceLoader` so settings paths, package skills, and project `.agents/skills` are listed the same way the runtime sees them.
- Skill toggling edits only the `disable-model-invocation` frontmatter key on the target `SKILL.md`; keep that surgical so user formatting survives.
- `/api/skills/install` shells through `npx skills add ... --agent pi`; project installs run with the selected cwd.

### Auth and model config
- `ModelsConfig` combines models from `~/.pi/agent/models.json` with provider auth status from pi's `AuthStorage`/`ModelRegistry`.
- Provider listing is capability-driven, never id-driven: `lib/provider-listing.ts` decides membership from `auth.apiKey.login` / `auth.oauth` plus the stored credential type, so dual-auth providers (anthropic and github-copilot today — which providers declare both changes between SDK releases, so never assume it from an id) appear exactly once and never fall through both lists (#309). `lib/provider-listing-runtime.ts` adapts `ModelRuntime` to those pure helpers.
- auth.json holds **one** credential per provider and `ModelRuntime.logout()` deletes whichever it is. The delete routes therefore use `removeStoredCredentialIfType()` to compare and delete under the same file lock used by pi's auth storage. `ModelsConfig` also refreshes *both* provider lists after any auth change — refreshing one leaves a dual-auth provider rendered twice.
- OAuth/device-code/manual-code flows are streamed by `GET /api/auth/login/[provider]`; manual code responses POST back with a short-lived token stored in `globalThis.__piLoginCallbacks`.
- API-key routes store and remove keys through `AuthStorage`. Status endpoints must never return the raw key.
- The model test route is `app/api/models-config/test/route.ts`; `app/api/models/test/` is not a real route.

### Completion sound
- `hooks/useAudio.ts` stores the toggle in `localStorage` as `pi-sound-enabled` and reuses one `AudioContext`.
- Browser autoplay policy means sound must be unlocked from a user gesture; `ChatInput` calls the unlock hook from interactive controls, and `ChatWindow` plays the tone from `onAgentEnd`.

### Exported session HTML
- `/api/sessions/[id]/export` delegates to pi's export helper, then patches recursive tree helpers in the generated HTML to iterative versions so very deep linear sessions do not overflow the browser call stack.

### Tauri 壳 IPC：远程 iframe 不能直接 invoke（必须走 postMessage 桥）
poweri 页面运行在**远程 origin**（dev server / cached 包的 `http://127.0.0.1:<port>`），
而 Tauri 2 只给**本地 shell 页面**（`tauri://localhost` / 嵌入的 dist）注入
`__TAURI_INTERNALS__`。远程 iframe 里：

- `window.__TAURI_INTERNALS__` / `window.__TAURI__` **探测不到**（withGlobalTauri 只影响本地页面注入）
- `navigator.clipboard` 在 WKWebView 被拒（NotAllowedError），`execCommand('copy')` 返回 true 但**实际写入为空**（假成功）
- 直接 `invoke("reveal_in_folder")` 之类永远走不到 Rust

**正确姿势**（与 `open_url` 桥同架构）：poweri 通过
`window.parent.postMessage({source:"poweri", type:"invoke", id, cmd, args}, "*")`
发给 shell（本地页面，有 IPC 权限），shell `invoke` 后回传
`{source:"poweri-shell", type:"invoke-result", id, ok, result|error}`。
封装见 `poweri/lib/file-actions.ts` 的 `tauriInvoke()`（探测顺序：直接 IPC →
postMessage 桥 → 纯浏览器返回 null），shell 侧监听见 `shell/main.ts`。
**capabilities 的 `remote.urls` 白名单只解决"远程页面能否加载"，不解决 IPC 注入**；
远程页面需要的 Tauri 命令必须经 shell 转发，并确保命令注册在 `invoke_handler`。
排障通道：`main.rs` 的 `on_page_load` 在页面加载后 eval 注入 console→`log_error`
转发 hook，webview JS 错误会出现在 `~/Library/Logs/PowerI/poweri.log`。

### macOS release 构建必须以 .app bundle 运行（裸二进制白屏）
`src-tauri/target/release/poweri-desktop` 直接运行（或 `cargo run --release`）时，
release 模式下 webview 走 `tauri://localhost` 自定义协议，**裸二进制下该协议不工作**：
窗口正常创建（`NSApplication run`、`on_window_event` 正常）但 **webview 从不发起导航**
（`on_page_load` 连 Started 都不触发），页面白屏、服务不启动。dev 模式不受影响
（devUrl 是 `http://localhost:1420`）。

**正确姿势**：release 验证/运行一律用 bundle 产物：
`npm run tauri build -- --bundles app` 后运行
`src-tauri/target/release/bundle/macos/PowerI.app/Contents/MacOS/poweri-desktop`。
排障提示：症状是"无 `[page-load]` 日志 + 无 node precheck + 服务不启"时，先检查是否在跑裸二进制。

### tauri-build 不监听 dist 变化（前端改动后需触发重建）
`tauri-build` 的 rerun-if-changed 只覆盖 tauri.conf.json / Cargo.toml / capabilities /
resources，**不含 frontendDist（`../dist`）**。改了 shell 前端（vite build 产物变化）后
直接 `cargo build --release` 会因 build.rs 未重跑而嵌入**旧资产清单**，表现与裸二进制
白屏相同（页面资源 404/错乱）。**正确姿势**：前端改动后走 `npm run tauri build`
（beforeBuildCommand 会重跑 vite build，且 tauri CLI 内部处理一致）；或手动
`touch src-tauri/build.rs`（或 `cargo clean -p poweri-desktop`）强制 build.rs 重跑。

### 测试文件禁止硬编码开发机绝对路径（CI 必挂，且本地复现会被污染）
`discover-cache.test.mjs` 曾用 `jiti.import("/home/<user>/code/.../skill-subscriptions.ts")`
硬编码绝对路径引入被测模块：本地永远绿（路径恰好存在），CI（checkout 在
`/home/runner/work/...`）顶层 `await` 抛错 → **该文件全部用例不注册**，node 只报
`✖ <file>:1:1 'test failed'` 一个文件级合成失败（0.2.0 首发 CI 独有失败事故）。
更阴险的是：在本机 `git clone` 到 /tmp 复现 CI 时，硬编码路径仍指向主仓库，
**复现被共享文件系统污染**——克隆里“全绿”并不代表 checkout 独立，会误判“无法复现”。

**正确姿势**：被测模块一律 `path.join(import.meta.dirname, "./x.ts")` 或
`new URL("./x.ts", import.meta.url).href` 相对解析；fixture 字符串里出现机器路径无妨
（只断言字符串处理，不做真实 fs 访问）。
**诊断技巧**：本地 vs CI 的 `tests` 总数对账（本地 966 vs CI 959 = 8 个用例未注册 +
1 个合成失败）；失败 step 耗时跑满全程 ≈ 断言失败，秒挂 ≈ 模块加载错误；
`✖ <file>:1:1 'test failed'` 这种笼统报错 = 文件加载崩了，先查 import。

### cargo test 是 debug profile：release-only 函数的门控必须成对
`#[cfg(not(debug_assertions))]` 门控的函数在 `cargo test`（debug）下**不存在**。
新增调用方漏配同款门控（`fetch_latest_version`、`npm_bin` 事故）→ 三平台 E0425。
而 `tauri build`（release）不受影响——**“release 构建过了”不能证明代码可编译**，
发布构建绿而测试 CI 红是常态组合。

**正确姿势**：新增 release-only 能力时，调用方补同款门控，调用点写
`#[cfg(debug_assertions)]` 兜底分支（dev 走不到也要能编译）；本机（WSL）无 cargo
工具链，Rust 改动验证依赖 `test-poweri-desktop` CI（三平台约几分钟），提交后盯完
workflow 再继续。

### 发布 tag 一旦推送即固化：打 tag 前必须 CI 门禁全绿
`git push -f` 被权限硬拦，tag 无法 force 移动——推送后发现 CI 挂，只能 bump
版本重发（poweri-v0.2.0 因此报废，0.2.1 重发）。**正确姿势**：打 tag 前置门禁：
`npm test` + `npm run shell:test` 本地全绿，且确认近期 push 已让
`test-poweri-desktop` workflow 绿过（Rust 侧无法本地验证）；tag 格式必须
`poweri-v*` 才触发发布 CI（杂散 `0.2.0`/`v0.2.0` tag 不触发，曾造成“以为发布了”
——npm 实际停在 0.1.14）。完整发布流程见 [`docs/desktop/release.md`](release.md)。
