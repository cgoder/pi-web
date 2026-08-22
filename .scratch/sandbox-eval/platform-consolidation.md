---
status: active
triage: ready-for-human
feature: sandbox-eval
created: 2026-08-22
depends: README.md, poc-topology-b-checklist.md
related-repo: /Users/tianzhao/code/leoao/poweri（monorepo：gateway/ + worker/ + web/）
---

# 汇总分析：拓扑 B PoC × poweri-gateway/worker 平台合流评估

> 输入：本仓库拓扑 B Phase 1 实测（b505c7c）+ leoao/poweri 平台全量调研（gateway README、
> worker/docker/README、docs/web-customizations.md、ADR-0001~0010、bridge/pods/server.mjs 源码）。

## 1. 两个实现是同一命题的两条分支

| 维度 | leoao 平台（现役） | 本 PoC（拓扑 B 整容器化 pi-web） |
| --- | --- | --- |
| 数据平面 | worker = `pi --mode rpc` + 自研 stdio↔WS 桥（1 连接=1 子进程） | worker = 整个 pi-web server（40 路由+SSE 原生） |
| 控制平面 | gateway 无状态：Bearer 认证、事件级计量计费、会话续接、(user,session) 串行 | 无（PoC 未建） |
| Web UI | v0.8.8 subtree + **~16 处上游侵入分支**逐路适配 | 零适配，全部原生可用 |
| 文件树/搜索 | ✅ 经 /v1/files+/file-index 代理 | ✅ 原生 |
| 文件 download/preview/watch | ❌ 明确拒绝 | ✅ 原生 |
| **Git 面板 / diff / worktrees** | ❌ **无网关分支，恒为空态（且无 ticket 登记）** | ✅ 原生 |
| 插件管理 | ❌ GET 空 / POST 拒绝 | ✅ 原生 |
| 模型切换 | 单一平台模型 GW_MODEL | ✅ 原生多模型 |
| 镜像 | **512MB**（锁版 pi@0.83.0，非 root uid1000） | 3.53GB（未优化；多阶段+standalone 预期 <1.5GB） |
| 冷启动 | 194–639ms（docker provider 实测） | ≈1s 到 HTTP 200 |
| 单会话内存 | ~210MB（桥 58M + pi 152M） | 待测（Next server 开销未知，Phase 2 项） |

## 2. 分歧的本质：复杂度落在哪

两条路线都满足 ADR-0004 的 control/data plane 分层，分歧在数据平面的协议形态：

- **leoao 选窄协议桥接**（其 ADR-0002 明确否决"SDK 内嵌 HTTP 服务"，理由是失进程隔离）：换来沙箱极简 + 网关协议级控制（计量精度、无状态扩展）。**代价 = 适配面成为永久税**：16 处侵入分支随每次上游升级产生冲突风险（其 ADR-0010 为此建了整套校验流程），功能永久滞后（git 面板在桥上无法透传，等于放弃）。
- **拓扑 B 选全栈入沙箱**：换来零适配 + 功能全集原生。**代价 = 镜像重量与控制面重构**：gateway 从 WS 桥协议改为 HTTP 反代，认证/路由语义要重接。

关键事实：leoao 的适配层**已经在做 HTTP 反代**（/v1/files、/v1/sessions 等经 gateway→bridge 转发）——拓扑 B 只是把这件事做完整，而不是引入新范式。

## 3. 合流建议（方案 α）：控制面用 leoao 的，数据平面换成 pi-web 容器

```
web 壳(pi-web 前端) ──HTTP──> gateway(保留：认证/计量tap/路由/K8s编排)
                                   │ HTTP 反代(替代 WS 桥)
                              worker Pod = pi-web 全栈容器(本 PoC 镜像)
                                   └── per-user PVC 不变
```

**收益**：
1. web 壳 16 处网关分支大部分退役 → 上游升级冲突面骤降（其最痛的维护点）
2. ticket 24/25 债务直接消解：系统提示词展示、模型切换、auto-name、分支树均为 pi-web 原生能力
3. Git 面板/diff/worktrees 从"架构性缺失"变为开箱即用
4. 冷启动 1s 实测 ⇒ scale-to-0 + 按需拉起策略可行，温池可简化
5. 版本收敛：worker 镜像改由本仓库（github/pi-web desktop 分支，含 PowerI 产品层）构建，结束 v0.8.8 与新版两个上游漂移

**待验证项（Phase 2 承接）**：
1. 计量改造：gateway 反代 SSE 时 tee 解析事件帧聚合 usage（其已解析 assistantMessageEvent 形状，机制相通）；兜底方案为按 JSONL 对账
2. 单会话内存实测（Next server + AgentSession 同进程）
3. 多阶段构建瘦身目标 <1.5GB + 非 root（照抄 piuser 方案）
4. 攻击面评估：沙箱内多了 Next server（文件上传等路由），但沙箱 OS 边界未削弱，NetworkPolicy 策略不变

**备选**：
- 方案 β（维持现状）：接受适配税与 git 能力缺失——仅当"沙箱内跑 HTTP server"被安全评估否决时才合理
- 方案 γ（worker 内双进程并存）：两套运行时叠加，维护成本最高，不推荐

## 4. 对 ADR-0004 的修订影响

1. "拓扑 B 为目标形态"结论**加强**：现成平台证明控制面可复用，唯一结构性改动收敛在 gateway→worker 的转发协议
2. 新增事实修正：ADR-0004 §3 中"拓扑 A 仅适合本地 microVM 加固"不变；但需补记 leoao ADR-0002 否决内嵌 HTTP 服务的理由与本 PoC 的反驳证据（隔离边界来自容器而非进程模型；其 docker provider 本身就是整容器调度）
3. 实施路径更新：Phase 2 从"新写编排器"改为"复用 gen-k8s/gateway 改造验证"

## 证据索引

- 本 PoC 数据：poc-topology-b-checklist.md Phase 1 实测表（b505c7c）
- leoao 桥协议：worker/bridge/server.mjs:11-90（1 连接=1 子进程）、:170-247（只读 HTTP 面）
- 网关 API 与计量：gateway/server.mjs:117-473、:196-215；ADR-0006/0007
- 适配税清单：docs/web-customizations.md（16 处侵入 + 4 新增文件）；git 缺口：web/app/api/git/*（grep 无 gatewayConfig）
- K8s 参数：gateway/pods.mjs:265-317、deploy/k8s/networkpolicy.yaml；温池概念：其 ADR-0004
- 镜像构成与资源实测：worker/docker/README.md（512MB/273-639ms/210MB）
