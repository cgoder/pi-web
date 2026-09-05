---
title: PowerI 端云混合 Agent 平台架构规格说明
status: backlog
triage: ready-for-agent
type: architecture-spec
created: 2026-09-04
source_spec: docs/research/poweri-edge-cloud-hybrid-architecture-spec.md
---

# PowerI 端云混合 Agent 平台架构规格说明

## Problem Statement

当前团队在构建面向几十人使用的内部 AI Coding/Dev Agent 平台，并探索打通 Desktop、Web、Mobile 多端形态时，面临核心瓶颈：
1. **多租户安全与执行能力的冲突**：在线系统若直接开放系统级 Shell/代码执行能力，缺乏隔离会导致服务器环境污染、数据交叉与安全逃逸；
2. **多端算力与物理特性的冲突**：移动端受制于后台保活机制与能耗，无法长周期执行重型编译，而纯云端方案无法满足本地极客离线私有开发需求；
3. **框架认知分层的不清晰**：在基于 `pi` 体系构建平台时，对 `pi-ai`、`pi-agent-core` 与 `pi-coding-agent` 的职责划分模糊，导致端云边界反复摆动。

## Solution

建立“**UI 表现层 - Runtime 控制面 - Sandbox 数据面**”的标准三层解耦模型，并确立**端云协同三方案关系定理**：
- **方案 B（最理想状态 · 终局形态）**：端侧大脑（UI + `pi-agent-core` 本地推理调度）+ 云端手脚（多租户 Docker 弹性沙箱）。端侧保留个性化配置与隐私，算力统一卸载到受控云端；
- **方案 A（降级保障态）**：端侧极轻（Web 浏览器 / 移动端控制器，遵循 Cindy 零权威原则）+ 云端全套托管（Gateway 驱动 `pi-coding-agent` + Docker 沙箱）；
- **方案 C（端侧特化态）**：当前 PowerI 桌面端形态，本质是方案 B 在端侧的特化形式（将云端 Sandbox 替换为本地 Local Sandbox 即自动退化为方案 C）。

核心架构基石在于厘清 **Pi 三件套**：
- `pi-ai`：纯无状态多模型协议转换，必须经由企业网关注入密钥，严禁裸跑前端；
- `pi-agent-core`：通用 ReAct 循环调度器，纯内存态，零 Node 原生依赖，可随处打包部署；
- `pi-coding-agent`：强绑定 Node.js 物理系统的研发宿主（CWD 管理、Session JSONL 持久化、物理 Tools），是真正的环境分水岭。

## User Stories

1. 作为一个团队开发者，我希望在公司现有 Web 后台直接打开 PowerI 界面，以便无需任何本地配置即可进行业务数据分析。
2. 作为一个团队开发者，我希望在 Web 上让 Agent 运行 Python 脚本，以便安全高效地清洗数据并导出报表，不用担心服务器被弄死。
3. 作为一个团队开发者，我希望多人在 Web 上同时使用时，文件和会话严格物理隔离，以便数据绝对不发生混淆和覆盖。
4. 作为一个工位工程师，我希望在桌面端使用 PowerI 进行本地私有代码重构，以便享受零云端依赖的离线开发体验（方案 C 特化）。
5. 作为一个工程师，我希望在桌面客户端开启“云端沙箱执行”，以便重型构建与分析任务在云端跑，不耗尽笔记本电量和 CPU（方案 B 终局）。
6. 作为一个移动端用户，我希望在手机上派发分析长任务后立即锁屏或切后台，以便云端继续托管执行，手机不受挂起限制（方案 A 漫游）。
7. 作为一个移动端用户，我希望云端任务完成或需要人工审批时，手机能收到系统 Push 通知，以便及时干预。
8. 作为一个平台管理员，我希望系统打通公司内部统一 SSO/JWT 鉴权，以便纳管全团队成员账号与操作权限。
9. 作为一个平台安全负责人，我希望沙箱容器具备 Egress Firewall，默认拦截云元数据接口（169.254.169.254）与核心生产内网，防止 Prompt 注入攻击。
10. 作为一个平台财务负责人，我希望网关实时拦截并统计每次会话的 Token 消耗和模型费用，以便月末精确对账核算。
11. 作为一个运维工程师，我希望空闲沙箱在 15 分钟无活动后自动回收或挂起，以便节约团队云资源成本。

## Implementation Decisions

1. **统一执行抽象（Seam 决策）**：
   在工具执行层建立统一的 `ExecutionEnvironment` 接口（`readFile`, `writeFile`, `editFile`, `exec`）。方案 C 绑定本地 Node.js 原生模块；方案 B 与方案 A 绑定 `RemoteSandboxEnvironment`，通过 WebSocket 将指令转发至沙箱容器。
2. **复用旧版成熟资产**：
   - 复用 `worker/bridge/server.mjs`：容器内以 RPC 模式运行 `pi` 并暴露 stdio↔WebSocket 桥接；
   - 复用 `gateway/queue.mjs`：单会话严格串行锁，杜绝并发请求损坏 JSONL；
   - 复用 `gateway/metering.mjs`：流式拦截 `message_end` 统计 Token 与费用账单。
3. **融合先进多端协议**：
   - 借鉴 ThinkRail：在 WebSocket 通信中引入基于 `(clientKey, requestId)` 的 Request-Replay 幂等协议，实现弱网下 Exactly-Once 消息补全；单沙箱多任务采用 `git worktree` 避免文件冲突；
   - 借鉴 Cindy：移动端采用 `RemoteSessionStore` 纯内存投影与 Anti-Entropy 增量对齐机制，实现跨设备无缝漫游。
4. **分阶段务实演进路线**：
   - 阶段 1：现有 Web 后台单点嵌入当前 Power Web，屏蔽危险 bash，接入 2~3 个受控业务 API Tools（1~2 周）；
   - 阶段 2：以旧版 Gateway 配合单机 Docker 沙箱，支持安全的 Python/Shell 执行与多租户隔离（3~4 周）；
   - 阶段 3：抽象 `ExecutionEnvironment`，统一打通桌面端（方案 B/C）与移动端（方案 A 漫游）。

## Testing Decisions

1. **协议层外部契约测试 (Wire Seam)**：
   测试客户端与 Gateway 之间的 HTTP/SSE/WebSocket 通信，覆盖 Token 鉴权、并发请求排队、流式推流、网络断线重连补全及计量数据入库。
2. **执行层虚拟环境测试 (Execution Seam)**：
   通过 Mock 虚拟执行环境捕获工具调用指令，完全无需在测试环境中拉起真实 Docker 即可验证复杂 ReAct 多轮循环与异常处理逻辑。
3. **关键边界场景测试**：
   - 单会话瞬时并发发送 10 条 Prompt，验证 `queue.mjs` 的锁正确性与 JSONL 零损坏；
   - 沙箱进程被意外 kill（模拟 OOM），验证 Gateway 能够捕获并在前端优雅呈现错误，主服务不崩溃。

## Out of Scope

1. 面向公网用户的第三方支付充值与商业结算；
2. 移动端本地的大模型训练与参数微调；
3. 跨公网多云集群的复杂分布式调度（初期聚焦单机 Docker / 轻量化沙箱容器）。

## Further Notes

完整权威的技术论证、架构图与代码溯源详见核心白皮书：
`docs/research/poweri-edge-cloud-hybrid-architecture-spec.md`。
