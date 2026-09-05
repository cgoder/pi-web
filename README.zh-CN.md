# PowerI

[English](./README.md)

PowerI 是基于 [pi](https://github.com/earendil-works/pi) 框架构建的**新一代端云混合 AI Agent 平台**。它通过统一的三层分级沙箱与端云协同架构，无缝连接开发者本地工作流、企业多租户 Web 后台门户以及随身移动端漫游，全面打通 **Desktop、Web 与 Mobile** 三端形态。

---

## 核心理念与三层解耦架构

为了彻底解决“本地系统级工具执行能力（调用任意 Node、Python、Shell）”与“多租户在线环境安全及资源隔离”之间的物理矛盾，PowerI 划分为三个独立的物理平面：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. UI 表现层 (Presentation Layer)                                           │
│    - Desktop 桌面端 (Tauri 2 原生操作系统壳)                                 │
│    - Web 团队门户 (Next.js 独立部署 / 嵌入企业管理后台微前端)                 │
│    - Mobile 移动端 (iOS / Android 随身控制器，基于 Device Link 协议)         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP SSE / WebSocket
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. Runtime 控制面 (Control Plane)                                           │
│    - 无状态网关 (Stateless Gateway)、JWT 鉴权与多租户会话路由                │
│    - ReAct 思考循环与纯内存态状态机 (@earendil-works/pi-agent-core)          │
│    - 单 Session 严格串行排队锁 (杜绝并发写冲突导致 JSONL 损坏)                │
│    - 流式 Usage 计量拦截 (实时统计 Token 与模型账单)                         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ WebSocket (stdio-ws 桥接 RPC 协议)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. Sandbox 数据面 (Execution Plane)                                         │
│    - 物理级隔离执行空间 (Docker 容器 / Firecracker MicroVM / 本地宿主机)     │
│    - 物理手脚工具链 (read, write, edit, bash)，由容器内 pi --mode rpc 驱动   │
│    - 出站网络防火墙 (Egress Firewall: 拦截云厂商元数据接口与核心生产内网)    │
│    - 租户独立工作区存储挂载 (/data/workspaces/{userId})                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 端云协同三方案演进定理

系统所有部署形态，统一抽象自唯一的执行环境接口：`ExecutionEnvironment`（`LocalEnvironment` 与 `RemoteSandboxEnvironment`）：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 【方案 B：最理想终局形态 · 端侧大脑 + 云端手脚 (Local Brain + Cloud Sandbox)】│
│ - UI: 本地桌面端 (Tauri)                                                    │
│ - Runtime: 本地 Node / pi-agent-core 思考调度                               │
│ - Sandbox: 云端弹性容器沙箱 (重型算力与不可信代码外溢卸载)                   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                   │                                     │
                   │ 特化派生                            │ 降级保障路径
                   ▼                                     ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│ 【方案 C：纯单机完全闭环】            │  │ 【方案 A：云端全托管模式】         │
│ - UI: 本地桌面客户端                 │  │ - UI: 纯 Web 浏览器 / 移动端 UI   │
│ - Runtime: 本地 Node 服务            │  │ - Runtime: 云端统一网关托管       │
│ - Sandbox: 本地系统宿主环境          │  │ - Sandbox: 云端多租户 Docker 容器  │
│ (方案 B 在端侧的自然退化特化形式)    │  │ (最适合企业几十人团队与移动端漫游) │
└──────────────────────────────────────┘  └───────────────────────────────────┘
```

1. **方案 B（理想终局态 · 端侧大脑 + 云端手脚）**：推理与思考跑在开发者本地电脑，Prompt、配置与私有代码隐私不出端；当需要执行重型构建、跑 Python 分析或执行任意不可信命令时，通过轻量 RPC 代理到云端弹性沙箱容器执行。
2. **方案 A（降级保障态 · 云端全托管）**：客户端遵循“**零权威原则（Zero Authority）**”，只作为轻量投影与控制器。运行时与沙箱均驻留云端，手机息屏、切后台或弱网重连任务不中断。
3. **方案 C（端侧特化态 · 纯单机完全闭环）**：当前 PowerI 桌面端形态。**方案 C 本质就是方案 B 的特化（Specialization）**：只需将方案 B 底层的云端沙箱降维替换为本地操作系统沙箱，系统便无缝演变为离线可用的单机闭环。

---

## 核心技术基石：厘清 Pi 三件套

PowerI 严格遵循官方 `@earendil-works/pi-*` 三件套的底层分工原则，作为架构设计的基石：

| 模块包名 | 核心职责 | 状态与系统依赖 | 部署与分水岭约束 |
| :--- | :--- | :--- | :--- |
| **`@earendil-works/pi-ai`** | 统一多模型 API 协议（Claude, OpenAI, Gemini）。纯网络通信。 | **无状态**。零操作系统原生依赖。 | 严禁前端裸跑（防止 API Key 泄露与 CORS 跨域拦截），必须由网关统一注入转发。 |
| **`@earendil-works/pi-agent-core`** | ReAct 思考循环引擎、Prompt 上下文管理、ToolCall 分发状态机。 | **纯内存态**。纯 TypeScript 实现，零 Node 原生模块依赖。 | **可随处携带的大脑**：可在桌面本地、Web 或云端随时实例化。 |
| **`@earendil-works/pi-coding-agent`** | 绑定物理开发环境（CWD 目录管理）、JSONL 会话磁盘持久化（`SessionManager`）、内置物理手脚（`read/write/edit/bash`）、动态 Extensions 加载。 | **强绑定 Node.js 与操作系统**。强依赖 `fs`, `child_process`, `proper-lockfile`。 | **物理环境分水岭**：必须运行在具备 Node 环境的宿主中（本地电脑或云端容器沙箱）。 |

---

## 多端交付形态

| 形态 | 对应方案 | 核心特性 | 适用受众 |
| :--- | :--- | :--- | :--- |
| **PowerI Desktop 桌面端** | 方案 C / B | 原生 Tauri 2 窗口、系统托盘、自动升级、支持一键切换本地/云端沙箱 | 追求极客性能、完整 IDE 与终端体验的工程师 |
| **PowerI Web 团队门户** | 方案 A | 团队统一入口、SSO/JWT 鉴权、时间线交互、Token/费用对账透明、容器隔离 | 20~100 人的企业研发与数据分析团队 |
| **PowerI Mobile 随身端** | 方案 A (漫游) | 远程控制投影、Device Link 跨设备联动协议、长任务锁屏托管、完成 Push 唤醒 | 随时随地派发任务、移动审批、跨端无缝接管 |

---

## 快速上手

### 环境要求

* **Node.js**: `22.19.0+`
* **包管理器**: `npm` 或 `pnpm`
* **Rust**: 仅当编译 Tauri 桌面原生壳时需要

### 启动 Web 平台

```bash
# 克隆仓库
git clone https://github.com/cgoder/poweri.git
cd poweri

# 安装依赖
npm install

# 启动开发服务器（专用端口 9989）
npm run dev

# 浏览器访问
open http://localhost:9989/poweri
```

### 启动 Desktop 桌面客户端

```bash
# 开发模式：Next.js 后端 + Tauri 桌面壳（支持热重载）
npm run tauri dev

# 生产构建（产物位于 src-tauri/target/release/bundle/）
npm run desktop
```

---

## 架构研究与技术白皮书

详尽的架构推导演进、一手资料（Primary Sources）溯源与工程规格任务，参见 `docs/research/` 系列文档：

* 📘 [**PowerI 端云混合 Agent 平台架构规格说明书**](./docs/research/poweri-edge-cloud-hybrid-architecture-spec.md) — 终极架构设计蓝图、完整 User Stories、统一 Seam 抽象与分阶段落地路线图。
* 🔍 [**业界多租户 Web Agent 平台与沙箱调研报告**](./docs/research/2026-industry-web-agent-sandboxes.md) — Devin、OpenHands、Bolt.new、E2B、Daytona 微虚拟机架构与防逃逸实践深度解构。
* 🔍 [**ThinkRail 与旧版 PowerI 源码级对比复盘**](./docs/research/thinkrail-vs-poweri-codebase-deepdive.md) — JetBrains/thinkrail 三环契约及 Worktree 并发隔离 vs 旧版 PowerI 无状态网关与 stdio-ws 桥接技术复盘。
* 🔍 [**移动端本地运行时与端云协同架构调研**](./docs/research/mobile-local-runtimes-and-edge-agents.md) — OpenMinis（iSH/PRoot 移动沙箱与 Native Offload）与 makecindy/cindy（Device Link 协议与零权威投影）深度调研。

---

## 许可证

MIT © [cgoder](https://github.com/cgoder)
