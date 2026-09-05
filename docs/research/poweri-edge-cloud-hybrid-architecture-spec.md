# PowerI 端云混合 Agent 平台架构规格说明书 (Architecture Spec)

> **文档性质**: 核心架构研究、规格定义与技术白皮书  
> **基线依赖**: `@earendil-works/pi-*` 三件套、旧版 PowerI K8s 资产 (`leoao/poweri`)、当前 Power Web 产品层 (`@poweri/poweri-web`)  
> **参考前置文档**:
> - `docs/research/2026-industry-web-agent-sandboxes.md` (业界沙箱与防逃逸实践)
> - `docs/research/thinkrail-vs-poweri-codebase-deepdive.md` (ThinkRail 与旧版 PowerI 源码深挖)
> - `docs/research/mobile-local-runtimes-and-edge-agents.md` (移动端本地运行时与端云协同调研)

---

## 1. 问题陈述 (Problem Statement)

当前团队在探索与落地 AI Coding / Dev Agent 时，面临三个核心维度的割裂与矛盾：

1. **执行能力与多租户安全的矛盾**：
   本地 Agent（如 Claude Code、Cursor、pi CLI）具备完整的系统级执行力（调用 Node、Python、Shell），但仅限于单人本地环境；而现有的 Web 后台系统若直接开放代码执行能力，几十人共享服务器宿主将面临严重的环境污染、资源争抢、数据混淆以及致命的系统逃逸安全风险。
2. **多端形态与算力承载的矛盾**：
   团队成员的工作场景横跨 **桌面工作站 (Desktop)**、**企业 Web 后台管理系统 (Web)** 以及 **随身移动端 (Mobile iOS/Android)**。移动端因受制于操作系统的后台保活限制、发热能耗与 App Store JIT 禁令，无法直接承载重型代码编译；而纯云端方案又无法满足开发者在本地离线或私密代码开发的需求。
3. **架构认知的模糊与反复**：
   在基于 `pi` 框架构建 Agent 平台时，关于模型调用、Agent 循环、工具执行、会话持久化在前端与后端的分布边界不够清晰，缺乏一套能够自洽解释全场景的统一分层模型。

---

## 2. 解决方案总纲：端云协同三方案关系定理 (Solution)

我们提出 **“UI 表现层 - Runtime 控制面 - Sandbox 数据面”** 的解耦架构，并将业界与系统演进的所有形态统一归纳为 **三方案关系定理**：

```
                           ┌─────────────────────────────────────────────────────────┐
                           │               核心抽象: ExecutionEnvironment             │
                           │   - readFile / writeFile / edit / exec (bash / python)  │
                           └────────────────────────────┬────────────────────────────┘
                                                        │
                   ┌────────────────────────────────────┴────────────────────────────────────┐
                   ▼                                                                         ▼
   ┌───────────────────────────────┐                                         ┌───────────────────────────────┐
   │    LocalEnvironment (本地)     │                                         │   RemoteSandboxEnvironment (云)│
   │  - 调宿主 Node fs / child_proc │                                         │  - 调云端 Docker / 容器 RPC 桥  │
   └───────────────┬───────────────┘                                         └───────────────┬───────────────┘
                   │                                                                         │
                   │ 特化派生                                                                 │ 标准落地
                   ▼                                                                         ▼
   ┌───────────────────────────────┐         最理想终局形态 (以人为本 + 弹性算力)             ┌───────────────────────────────┐
   │ 【方案 C：纯单机完全闭环】     │ ◄──────────────────────────────────────────────────── │ 【方案 B：端侧大脑 + 云端手脚】 │
   │ - UI: 本地桌面客户端 (Tauri)   │   方案 C 是方案 B 在端侧的特化形式:                     │ - UI: 本地/端侧客户端 (Desktop)│
   │ - Runtime: 本地 Node 服务     │   当云端 Sandbox 降维替换为本地 Local Sandbox 时，      │ - Runtime: 端侧本地推理调度   │
   │ - Sandbox: 本机操作系统环境    │   方案 B 自动退化为方案 C。                             │ - Sandbox: 云端受控弹性容器    │
   └───────────────────────────────┘                                                         └───────────────┬───────────────┘
                                                                                             │
                                                                                             │ 降级路径 (移动端/轻量Web)
                                                                                             ▼
                                                                             ┌───────────────────────────────┐
                                                                             │ 【方案 A：端侧极轻全托管模式】 │
                                                                             │ - UI: 纯 Web 前端 / 移动端控制器│
                                                                             │ - Runtime: 云端 Gateway 托管   │
                                                                             │ - Sandbox: 云端受控多租户容器  │
                                                                             └───────────────────────────────┘
```

### 核心方案定义与关系定调：
1. **方案 B（最理想状态 · 终局形态）—— 端侧大脑 + 云端手脚 (Local Brain + Cloud Sandbox)**：
   * **端侧 (Desktop/高配端)**：运行 UI 与 `pi-agent-core` 运行时。用户在本地管理个性化 Prompt、模型配置与密钥，承担思考与 ReAct 决策循环；
   * **云端 (Cloud)**：仅作为纯粹的 **Sandbox 弹性算力层**（多租户 Docker 容器）。当 Agent 决策需要执行不可信的 Shell、Python 数据分析或重型构建时，通过轻量 RPC 代理到云端沙箱执行。
   * **核心收益**：云端零长连接状态维护，端侧零环境污染与死循环风险，兼顾极客体验与计算弹性。
2. **方案 A（降级保障态）—— 端侧极轻全托管模式 (Thin UI + Cloud Runtime/Sandbox)**：
   * **端侧 (Web 浏览器 / 移动端 iOS/Android)**：纯 UI 呈现与指令输入。遵循“**零权威原则 (Zero Authority)**”，手机切后台或息屏关机不影响任务；
   * **云端 (Cloud)**：托管完整的 `pi-coding-agent` Runtime 与数据持久化，并驱动后端 Sandbox。
   * **适用场景**：团队几十人统一的 Web 管理后台入口、移动端异步任务发起与监控。
3. **方案 C（端侧特化态）—— 纯单机完全闭环 (Local-Only Standalone)**：
   * 当前 PowerI 桌面端（Tauri 壳 + 本地 Next.js）即为此形态。
   * **架构本质**：**方案 C 并不是独立的异构架构，它本质上就是方案 B 的特化（Specialization）**。只需将方案 B 底层的 `RemoteSandboxEnvironment` 替换为本地的 `LocalEnvironment`，整套系统就无缝退化为方案 C，实现离线可用的单机闭环。

---

## 3. 架构核心基石：彻底厘清“Pi 三件套”

后续所有架构设计与模块划分，必须严格建立在对 `@earendil-works/pi-*` 三件套底层实现的准确认知之上：

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. @earendil-works/pi-ai (纯通信模型适配层)                                                      │
│    - 角色: 多模型协议归一化适配器 (Claude, OpenAI, Gemini, Bedrock)                              │
│    - 属性: 纯网络通信、完全无本地系统依赖                                                        │
│    - 部署认知: 严禁直接打包进浏览器裸连公网 (防 API Key 泄露与浏览器 CORS 拦截)，必须经由网关转发 │
└────────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                 │ 依赖
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. @earendil-works/pi-agent-core (通用 Agent 核心调度状态机)                                     │
│    - 角色: ReAct 思考循环引擎 (runAgentLoop)、Prompt 上下文管理、ToolCall 决策分发               │
│    - 属性: 纯内存态状态机 (In-Memory Stateful)、纯 TypeScript/JS 实现、零 Node.js 原生模块绑定    │
│    - 部署认知: 它是“可随处携带的大脑”。既可以在 Node 服务端运行，也可以打包进前端或客户端运行   │
└────────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                 │ 依赖
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. @earendil-works/pi-coding-agent (研发领域完整工程执行宿主)                                    │
│    - 角色: CWD 项目目录绑定、SessionManager 磁盘 JSONL 持久化与分支树、SettingsManager、         │
│           内置物理 Tools (read, write, edit, bash)、Extensions/Skills 动态加载                  │
│    - 属性: 强绑定操作系统与 Node.js 运行时 (依赖 fs, child_process, proper-lockfile, path)      │
│    - 部署认知: 它是“与物理系统强绑定的执行宿主”。必须运行在 Node 环境下 (本地电脑或云端容器)    │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 用户故事 (User Stories)

### 4.1 团队工程师 (Developer / Analyst) 视角
1. 作为一个团队开发者，我希望在公司的 Web 管理后台上直接打开 PowerI 界面，以便无需在本地配置任何环境就能快速使用 Agent 分析业务数据或生成报告。
2. 作为一个团队开发者，我希望在 Web 上让 Agent 运行 Python 数据分析脚本并输出图表，以便不用担心我的代码会把公司的业务服务器搞死。
3. 作为一个团队开发者，我希望我在 Web 上的每一个会话都有严格独立的工作区目录，以便我和同事同时使用时，文件和 Git 状态不会相互覆盖。
4. 作为一个个人开发者，我希望在工位的 Mac/PC 上使用 PowerI 桌面应用，以便对我的本地私有代码库进行完全离线的重构与开发（方案 C 闭环）。
5. 作为一个开发者，我希望在桌面客户端上开启“云端沙箱执行”模式，以便当 Agent 执行长达数十分钟的重型编译任务时，不会把我的笔记本电脑 CPU 占满或引发风扇狂转（方案 B 闭环）。
6. 作为一个开发者，我希望当我在本地电脑断开网络时，桌面应用能优雅提示并降级，在网络恢复后能自动重试。

### 4.2 移动与协同办公用户视角
7. 作为一个出差中的技术主管，我希望在 iPhone 或 Android 手机上打开移动客户端，向 Agent 派发一个长周期的代码审计任务，以便我随时随地推进工作。
8. 作为一个移动端用户，我希望在发出长任务指令后立即将手机锁屏或切到微信，以便任务在云端继续执行，而不会因为手机系统杀后台而中断（方案 A / Cindy 协同）。
9. 作为一个移动端用户，我希望当云端任务执行完毕或需要人工审批（Approval）时，手机能收到 Push 推送通知，以便我及时介入。
10. 作为一个跨端工作的工程师，我希望回到工位打开电脑上的 PowerI 桌面端时，手机上刚才聊天的内容和生成的文件已经自动同步就绪，以便我无缝接续开发。
11. 作为一个处于弱网环境下的移动端用户，我希望当我的 4G 信号闪断并重连后，聊天界面的流式日志不会产生乱序或丢失，以便获得连续顺畅的体验。

### 4.3 平台管理员与运维 (Admin / SRE) 视角
12. 作为一个平台管理员，我希望系统支持接入公司统一的 SSO / JWT 认证体系，以便统一管理几十位团队成员的访问权限。
13. 作为一个平台管理员，我希望能够监控并限制每个用户沙箱容器的 CPU 核心数和内存上限（如 1 核 1GB），以便防止某人写的恶意死循环或内存泄露耗尽整台物理机资源。
14. 作为一个平台安全负责人，我希望沙箱容器默认拦截对云平台元数据地址（`169.254.169.254`）和公司核心生产内网的访问（Egress Filtering），以便防范 Prompt Injection 诱发的内网渗透。
15. 作为一个平台财务负责人，我希望网关能精确拦截并记录每一次会话的 Token 消耗与大模型费用（计量与对账），以便在月底对各个部门进行成本核算与账单导出。
16. 作为一个运维工程师，我希望空闲超过 15 分钟的沙箱容器能够自动暂停或销毁，以便节约云端服务器的算力和内存成本。

---

## 5. 核心架构与模块实现决策 (Implementation Decisions)

### 5.1 整体分层拓扑与通信架构

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                             1. UI 表现层 (Presentation Layer)                            │
│  - Desktop App (Tauri / 原生窗口)                                                       │
│  - Web Portal (Next.js 独立服务 / 嵌入现有后台微前端)                                      │
│  - Mobile App (React Native / Native 壳，遵循 Cindy 零权威 RemoteSessionStore 协议)       │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ HTTP SSE / WebSocket (Device Link Protocol)
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        2. Runtime 控制面 (Gateway / Orchestrator)                       │
│  - 身份认证与多租户隔离: JWT 解析与用户上下文绑定                                          │
│  - 序列化排队机制: 沿用旧版 `gateway/queue.mjs` (单 Session 串行，跨 Session 并行)       │
│  - 计量与对账拦截: 沿用旧版 `gateway/metering.mjs` (实时解析 message_end 并统计 usage)   │
│  - 模型路由器: 统一经由公司 New-API / One-API 网关分发 (注入 Token 与 Rate Limit)        │
│  - 抽象沙箱调度接口 (SandboxManager): 支持单机 Docker / 云端 E2B / K8s Worker Pod 动态切换│
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ WebSocket RPC (stdio-ws 桥接协议)
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         3. Sandbox 数据面 (Execution Sandbox)                           │
│  - 轻量容器载体: Docker 容器 / Firecracker MicroVM                                      │
│  - 进程隧道 Shim: 沿用旧版 `worker/bridge/server.mjs` (以 RPC 模式驱动 pi 子进程)        │
│  - 多任务并发隔离: 借鉴 ThinkRail 思想，以 `git worktree` 开辟独立任务分支                │
│  - 出站网络过滤: 拦截内网私网段与云厂商 Metadata 凭据接口                                │
│  - 用户数据独立挂载: `/data/workspaces/{userId}/`                                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 统一执行适配器接口决策 (Seam Decision)
为了让方案 A、方案 B、方案 C 共用同一套上层业务逻辑，必须在工具层抽象出唯一的物理缝隙（Seam）：

```typescript
// 核心抽象：定义物理手脚的执行行为
export interface ExecutionEnvironment {
  readonly workspaceRoot: string;
  readFile(relativePath: string): Promise<string>;
  writeFile(relativePath: string, content: string): Promise<void>;
  editFile(relativePath: string, edits: Array<{ oldText: string; newText: string }>): Promise<void>;
  exec(command: string, options?: { timeout?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

// 方案 C 实现：本地直接读写 Node 物理系统
export class LocalExecutionEnvironment implements ExecutionEnvironment {
  // 基于 Node.js fs.promises 与 child_process.spawn
}

// 方案 B / 方案 A 实现：远程 RPC 代理到沙箱
export class RemoteSandboxEnvironment implements ExecutionEnvironment {
  constructor(private readonly sandboxRpcClient: SandboxRpcClient) {}
  // 将所有读写与执行打包为 JSON-RPC 消息，通过 WebSocket 派发给沙箱容器
}
```

### 5.3 关键技术与源码资产继承决策
1. **继承当前新版 Power Web (`@poweri/poweri-web`) 的全部产品层资产**：
   * 保留以人为本的时间线视图、Thinking 思考过程折叠、Token 实时对账以及会话分支导航器（Branch Navigator）。
2. **继承旧版 PowerI (`leoao/poweri`) 的成熟后端与沙箱底座**：
   * **`worker/bridge/server.mjs`**：直接复用其 stdio↔WebSocket 桥接器，使容器内的 `pi --mode rpc` 转化为高可靠网络端点。
   * **`gateway/queue.mjs`**：复用单会话锁机制，杜绝并发请求损坏 JSONL。
   * **`gateway/metering.mjs`**：复用细粒度计费拦截器。
3. **融合 ThinkRail 与 Cindy 的先进协议机制**：
   * **Request-Replay 幂等协议（来自 ThinkRail）**：在弱网重连时，UI 端携带 `requestId` 发起 `resume`，网关实现 Exactly-Once 消息补齐。
   * **Device Link 零权威漫游（来自 Cindy）**：移动端只作为内存投影，权威状态归属云端，支持跨设备随时交接。
   * **Git Worktree 隔离（来自 ThinkRail）**：单沙箱内多任务使用 worktree，避免多会话改代码产生文件冲突。

---

## 6. 测试设计决策 (Testing Decisions)

坚持“**只测试外部行为与公共契约，绝不测试内部实现细节**”的原则。

### 6.1 测试缝隙 (Seams) 规划
系统仅设立两个核心测试缝隙：
1. **顶层通信协议缝隙 (Wire / Gateway API Seam)**：
   测试客户端向 Gateway 发起的 HTTP / SSE / WebSocket 消息，验证认证拦截、事件流格式、重连恢复以及计量上报。
2. **执行环境缝隙 (Execution Environment Seam)**：
   在测试中注入 `MockExecutionEnvironment`（内存文件系统与命令捕获器），无需真实拉起 Docker 容器即可全量验证 Agent 的工具调用逻辑与多轮 ReAct 循环。

### 6.2 关键测试矩阵
- **单会话并发冲突测试**：模拟同一用户对同一会话并发发送两个 Prompt，验证 `queue.mjs` 是否正确排队，会话 JSONL 是否完整无损坏。
- **沙箱异常退出与容错测试**：模拟容器在执行 `bash` 过程中突然被杀死（OOM），验证 Gateway 能否优雅捕获断开事件向前端推流报错，而不会导致主进程崩溃。
- **断线重连与一致性测试**：在 SSE/WebSocket 推流中途切断网络连接，验证客户端发送 `resume` 后能否无缝补全丢失的数据帧。

---

## 7. 实施路线图 (Phased Implementation Roadmap)

### 阶段一：轻量安全业务 Agent（1~2 周内交付）
* 部署当前 `@poweri/poweri-web` 作为独立应用服务。
* 在现有 Web 后台开辟一级菜单，以 SSO/JWT 鉴权集成该界面。
* 启用 `excludeTools: ['bash']` 屏蔽底层命令行，编写 2~3 个团队急需的受控业务 API Tools（查库、内部接口调用）。
* **交付目标**：团队快速用上带分支树、对账透明的专业业务 Agent，零运维风险。

### 阶段二：单机 Docker 隔离演进（3~4 周内交付）
* 整合旧版 `gateway/` 与 `worker/bridge/`。
* 引入轻量化 `DockerSandboxManager`，实现用户隔离沙箱（每个用户动态挂载独立的 `/data/workspaces/{userId}` 目录）。
* 开放 `read/write/edit/bash` 工具，实现安全的 Python/Node 代码执行与数据分析。
* **交付目标**：实现完整的方案 A，单台高配服务器支撑全团队 50 人自由编写和运行代码。

### 阶段三：端云一体与移动端协同（长期规划）
* 抽离统一的 `ExecutionEnvironment`，在桌面端（Tauri）正式落地方案 B（端侧大脑 + 云端手脚）。
* 依据 Cindy 的 Device Link 协议构建轻量移动端壳（iOS / Android），实现手机锁屏派发、云端托管长跑、电脑工位接管的三位一体体验。

---

## 8. 超出范围 (Out of Scope)

1. **公有云商业支付网关**：本系统面向企业内部团队，计量模块只负责计费数据统计与对账导出，不包含微信/支付宝等商业支付接口对接。
2. **移动端本地大模型训练与微调**：移动端只负责轻量推理交互与沙箱执行，不涉及端侧本地模型训练。
3. **第三方公有云多租户计费结算系统**：多租户边界限定于企业内部部门与用户，不涉及 SaaS 计费账单清算。

---

## 9. 附录：核心术语表 (Glossary)

* **UI 层 (Presentation Layer)**：前端交互界面，负责流式渲染、分支导航与可视化呈现。
* **Runtime 层 (Control Plane)**：基于 `pi-coding-agent` 或 `pi-agent-core` 的控制大脑，负责会话管理、Prompt 拼装与工具分发决策。
* **Sandbox 层 (Data Plane)**：受限的隔离计算空间，承载真实系统工具（`read`, `write`, `edit`, `bash`）的物理执行。
* **方案 B (Local Brain + Cloud Sandbox)**：端侧承担思维推理，云端承担物理沙箱执行的终极理想架构。
* **Device Link 协议**：借鉴 Cindy 的跨设备状态调和与指令联动协议。
