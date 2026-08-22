# ADR-0004: Agent 部署形态与执行平面分层（Control Plane / Data Plane）

## 状态

提议（2026-08-22）——待专用 worktree 中的沙箱执行环境评估（`eval/sandbox-execution`）验证后转"已接受"。

## 背景

### 问题

PowerI 当前形态是否已经是一个"完整的 Agent"？Web 版能否直接部署到云端、Web 端和端侧？如果不行，距离真正完整可执行的 Agent 是不是只差一个沙箱执行环境？

### 已核实的事实

1. **Agent 内核完整**。pi-web 通过 `lib/rpc-manager.ts` → `createAgentSessionFromServices()` 在 Next.js Node 进程内实例化与 CLI/TUI 同一颗内核（`@earendil-works/pi-coding-agent`）：LLM 循环、工具协议、会话持久化（JSONL）、compaction、扩展/skill 加载、模型管理全部齐备。"Web 版只是另一种前端"在能力层面成立。

2. **工具执行 = 宿主机直跑**。SDK 的 `core/tools/bash.js` 直接 `spawn(shell, ...)`，read/write/edit/grep/find 直访文件系统，权限等于 pi-web 服务器进程用户。上游 `docs/security.md` 明确：*"Pi does not include a built-in sandbox… Real isolation needs to come from the operating system or a virtualization/container boundary."*

3. **无多租户控制面**。40 个 API 路由中，`app/api/auth/` 是 LLM provider 凭据管理（API key / OAuth），不是租户身份认证；会话存本地 FS（`~/.poweri/agent/sessions/`）；rpc-manager 是进程内内存 registry。整体设计假设"本机单人"，信任边界 = 本机用户。

4. **内核已预留沙箱接缝**（上游 `docs/containerization.md`）：
   - bash 工具有 `spawnHook` 扩展点；扩展可 override 内置工具（Gondolin 示范了把 `bash/read/write/edit/grep/find/ls` 路由进 micro-VM）。
   - pi 有 headless RPC mode（stdin/stdout JSONL），支持整进程被外部 UI 驱动。
   - OpenShell 模式示范了 inference routing——provider key 可留在 gateway，不进沙箱。

### 三种部署形态的评估结论

| 形态 | 可行性 | 缺口 |
| --- | --- | --- |
| 本机桌面（现状） | ✅ 已是完整 Agent | 无 |
| 自托管单用户云（VPS） | 🟡 接近可用 | 一层 auth + HTTPS；信任边界仍是"一个人" |
| 云端 SaaS 多租户 | ❌ | 不止沙箱：认证授权、租户隔离、沙箱池调度、key 托管代理、共享会话存储、配额计费观测 |
| 移动端侧 | ❌ | 需 Node 运行时（Android/Termux 有上游文档支持；iOS 只能做连云端沙箱的瘦客户端）；API key 放端侧有风险 |

**结论："只差沙箱"对单用户自托管场景基本成立；对多租户 SaaS 场景，沙箱只是必要条件之一，缺的是一整套控制面。**

## 决策

### 1. 产品定位：当前形态成立，不为"像 SaaS"而重构

PowerI 的定位是**本地可信环境的完整 Agent**。这本身是成立的最终形态，云端化是演进方向而非当前缺陷。

### 2. 目标架构：控制面与执行平面分离

云端化时架构从"单进程 monolith"演进为两层：

```
┌──────────────────────────────────────────────────────┐
│  Control Plane（控制面）                              │
│  Next.js 前端 + API 路由 + 编排器                     │
│  ├── 租户认证 / 授权                                  │
│  ├── 沙箱池调度与会话生命周期管理                      │
│  ├── provider key 托管代理（key 不进沙箱）            │
│  ├── 会话元数据 / 共享存储                            │
│  └── 配额 / 计费 / 观测                              │
└──────────────┬───────────────────────────────────────┘
               │ RPC / SSE 代理
┌──────────────▼───────────────────────────────────────┐
│  Data Plane（执行平面）                               │
│  每会话一个隔离执行环境（容器/microVM/远程沙箱）       │
│  └── AgentSession 或 pi 进程 + 工具执行              │
└──────────────────────────────────────────────────────┘
```

对应 PowerI 的唯一结构性改造点：`lib/rpc-manager.ts` 从"进程内 registry"变为"沙箱编排器 + 流量代理"。API 层（SSE 协议、agent-event-wire）设计上前后端分离，前端无需感知执行位置。

### 3. 两条候选拓扑（待评估拍板）

**拓扑 A：大脑在外、手在沙箱（工具路由式）**

AgentSession 留在宿主（控制面进程内），通过扩展 override 内置工具，把 `bash/read/write/edit/grep/find/ls` 经 spawnHook/自定义工具路由进隔离环境。

- ✅ 会话状态、compaction、扩展都在宿主，控制面逻辑简单
- ✅ 与 Gondolin 上游示例同构，有参照实现
- ❌ 大脑仍多租户共驻一个进程——LLM 流量隔离好办，但扩展代码、内存态仍在宿主，租户间软隔离
- ❌ 非 bash 工具（文件 API 路由 `app/api/files/*`、git 路由等）不在 SDK 工具协议内，需要另行路由，覆盖面易漏

**拓扑 B：整进程入沙箱 + RPC 代理**

每个会话 = 一个沙箱，沙箱内跑完整 pi（RPC mode）或独立 Node 进程跑 AgentSession；控制面只做编排，前端经 WebSocket/SSE 代理直连沙箱。

- ✅ 隔离边界最干净：每租户每会话一个 OS 级边界，宿主零信任沙箱内容
- ✅ 文件类 API 路由随进程一起入沙箱，无覆盖遗漏问题
- ✅ key 由 gateway 注入（OpenShell inference routing 模式），凭据不落沙箱
- ❌ 会话生命周期管理复杂（冷启动延迟、池化回收、镜像分发）
- ❌ rpc-manager 改造量最大：从进程内对象操作变为跨进程协议编排

**倾向：拓扑 B 为目标形态，拓扑 A 作为过渡或本地 microVM 场景的补充。** 理由：SaaS 的根本要求是租户间硬隔离，A 的软隔离天花板低；且 A 的文件 API 路由覆盖问题会持续产生维护成本。

### 4. 不自研沙箱，按光谱选型

技术选型从弱到强：Seatbelt/AppContainer/seccomp（进程级）< Docker/Podman < gVisor/Firecracker microVM < E2B/OpenShell 等托管沙箱服务。

实施路径：

1. **PoC（本评估）**：Docker 单机 + 拓扑 B，验证"前端 ↔ 控制面 ↔ 容器内 pi(RPC)"闭环
2. **单用户自托管发布**：Docker Compose 形态，加薄 auth
3. **多租户 SaaS**：microVM/托管沙箱池替换 Docker 单机，补齐控制面其余部分（认证、配额、计费）

## 后果

### 正面

- 定位清晰：桌面产品不受云端架构焦虑绑架；云端演进有明确分层路径
- 复用最大化：AgentSession/RPC/SSE 全部复用，改造收敛在 rpc-manager 一层
- 隔离策略跟随部署形态伸缩：本地=直跑（现状），自托管=Docker，SaaS=microVM

### 负面 / 待验证

- 拓扑 B 的会话冷启动与池化策略需要实测数据（评估项）
- `app/api/files|git|worktrees` 等宿主 FS 路由入沙箱后的端口/协议面需逐一盘点（评估项）
- Tauri 壳假设"本地 sidecar 进程"，云模式下壳退化为纯浏览器容器（影响小但需确认）
- 上游若未来提供官方 sandbox 接口，可能与本方案冲突；保持接缝在自有层（poweri/rpc 编排）可随时切换

## 参考

- 上游 `node_modules/@earendil-works/pi-coding-agent/docs/security.md`（No Built-in Sandbox）
- 上游 `docs/containerization.md`（Gondolin / Plain Docker / OpenShell 三模式）
- 上游 `docs/rpc.md`（headless RPC mode，JSONL over stdio）
- `docs/adr/0002-layered-architecture.md`（基础层/产品层分层，本 ADR 是其在部署维度的延伸）
- 评估报告：`.scratch/sandbox-eval/`（分支 `eval/sandbox-execution`）
