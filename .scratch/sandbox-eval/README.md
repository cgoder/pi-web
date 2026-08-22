---
status: active
triage: ready-for-human
feature: sandbox-eval
created: 2026-08-22
adr: docs/adr/0004-agent-deployment-and-execution-plane.md
---

# 沙箱执行环境评估报告（拓扑 A vs 拓扑 B）

> 分支 `eval/sandbox-execution`，基于 ADR-0004（提议状态）。本文档为评估结论的实测依据，
> 目标是验证或推翻 ADR 中"拓扑 B 为目标形态"的倾向，为 ADR 转正提供证据。

## 1. 执行平面触点盘点（全部实测）

### A. SDK 工具层（模型驱动的执行）

| 触点 | 位置 | 事实 |
| --- | --- | --- |
| bash 工具 | SDK `core/tools/bash.js` | 直接 `spawn(shell, ...)` 宿主 shell；有 `spawnHook?: BashSpawnHook` 扩展点 |
| read/write/edit/grep/find/ls | SDK 内置工具 | 直访宿主 FS；可被扩展 override（Gondolin 示范路由进 micro-VM） |
| 扩展 override 在 pi-web 已实战 | `lib/rpc-manager.ts` L1614 起 | `createAgentSessionServices({ extensionFactories: [createProjectCommandBashExtension(...)] })` —— **pi-web 今天就在用扩展工厂注入/替换工具**，接缝已被验证可用 |

### B. API 路由层（Web UI 驱动的 FS 访问，非 SDK 工具协议）

直接触宿主文件系统/子进程的路由（grep `node:fs` / `child_process` 实测）：

```
app/api/agent/new/route.ts          # 会话创建
app/api/cwd/validate/route.ts       # 目录校验
app/api/default-cwd/route.ts        # 默认工作目录
app/api/file-index/route.ts         # 文件索引（含子进程 ripgrep）
app/api/files/[...path]/route.ts    # 文件读写
app/api/git/status/route.ts         # git 状态
app/api/models-config/test/route.ts # 模型连通性测试
app/api/plugins/route.ts            # 插件管理
app/api/sessions/[id]/route.ts      # 会话 CRUD + export（子进程）
app/api/skills/route.ts             # 技能管理
app/api/worktrees/route.ts          # git worktree 管理
```

**共 11 组路由、约 14 个端点直接触宿主 FS。这些不属于 SDK 工具协议，工具路由方案覆盖不到。**

### C. 会话运行时

- `lib/rpc-manager.ts` 导出全部是进程内内存态：`getRpcSession / startRpcSession / destroyRpcSessionsForCwd / registry: Map<sessionId, AgentSessionWrapper>`
- 会话持久化在本地 FS：`~/.poweri/agent/sessions/<encoded-cwd>/*.jsonl`
- 前端经同源相对路径访问（`fetch(\`/api/agent/${id}\`)`）+ SSE 同源推流 —— **换 origin 对前端协议零改动**

### D. Tauri 壳假设

- `src-tauri/src/commands.rs`：`spawn_blocking` 启动本地 pi-web server（dev 9527 / prod 30141），iframe 承载 localhost。
- 云模式下壳退化为纯浏览器容器指向远程 origin —— 影响小，但安装器/更新器逻辑不适用。

## 2. 拓扑 B 评估：整进程入沙箱 + 代理

**关键洞察：不需要用 pi RPC mode 重写任何协议。** pi-web 本身就是"headless 后端 + Web UI"，最简拓扑 B = **把整个 pi-web 容器化**：

```
浏览器 → 控制面(编排/认证/反代) → 容器(pi-web 全栈: Next server + 进程内 AgentSession)
                                        └── 会话卷 volume + 工具直跑容器内 FS
```

前端从"指向本机 origin"改为"指向控制面代理的 per-会话 origin"，协议不变。

### 改造点清单

| 层 | 改动 | 量级 |
| --- | --- | --- |
| 打包 | `Dockerfile.piweb`：node:24-bookworm-slim + git/ripgrep/ca-certs，`npm run build && npm start` | 小 |
| 会话存储 | 容器内 `/root/.poweri/agent/sessions` 挂 named volume（per-sandbox 一卷） | 小 |
| 凭据 | PoC 阶段 env 注入 provider key（记录为债务）；目标形态走 gateway 注入（OpenShell inference routing 模式） | 中→大 |
| 控制面 | 新增编排 API：create/start/stop/recycle sandbox + HTTP 反代 `/sandbox/:id/*` → container:port | 中 |
| 前端 | 会话绑定 sandboxId，API base URL 指向代理路径 | 小 |
| rpc-manager | **零改动**（它继续活在容器内，只是实例的宿主变了） | 无 |

### 待验证风险（PoC 必测）

1. 冷启动时长（容器 start → SSE 可用）——决定是否需要预热池
2. file watcher（chokidar/inotify）在 overlayfs 上的行为与 limits
3. SSE 经反代的长连接稳定性（buffering/proxy_read_timeout 配置）
4. 文件上传下载跨容器边界的路径语义
5. 生产构建注意：仓库约定 dev 期间禁止 `next build`（污染 .next/），容器内构建不受此限，但需独立 CI 构建

## 3. 拓扑 A 评估：工具路由式

机制可行已证实（§1.A，rpc-manager 已用 extensionFactories 注入工具）。但覆盖面有硬伤：

- ✅ SDK 内置 7 工具可 override 路由进沙箱
- ❌ §1.B 的 11 组 API 路由不在工具协议内——它们服务的是 Web UI 的文件树/git 面板/会话管理，绕过工具层直接触宿主 FS。要隔离就得给每个路由加远程分支，维护面 ≈ 整个 app/api
- ❌ 大脑仍多租户共驻单进程：扩展代码、内存态、SSE 连接全在宿主，租户间只有软隔离
- 结论：**A 只隔离了模型驱动的写操作，不隔离 UI 自身的 FS 访问。对 SaaS 不合格；仅适合单用户本地 microVM 加固场景（Gondolin 定位）。**

## 4. 结论

| 维度 | 拓扑 A（工具路由） | 拓扑 B（整进程入沙箱） |
| --- | --- | --- |
| 租户硬隔离 | ❌ 软隔离 | ✅ OS 边界 per 会话 |
| FS 访问覆盖面 | ❌ 漏 11 组 API 路由 | ✅ 天然全覆盖 |
| 改造量 | 中（持续维护成本高） | 中（一次性，rpc-manager 零改动） |
| 冷启动/池化复杂度 | 低 | 中（需 PoC 数据） |
| 上游对齐 | Gondolin 同构 | OpenShell/Plain Docker 同构 |

**维持 ADR-0004 倾向：拓扑 B 为目标形态；A 不作为 SaaS 候选。**
PoC 按 `poc-topology-b-checklist.md` 执行，数据回来后 ADR 转"已接受"。

## 参考

- ADR-0004（本仓库 desktop 分支）
- 上游 docs/security.md、containerization.md、rpc.md
- 实测命令与出处见各节标注的文件行号
