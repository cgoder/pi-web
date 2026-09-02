---
title: v0.2.0 发布评审修复（release readiness）
status: active
map: true
labels: [ready-for-agent]
---

# v0.2.0 发布评审 · 工单地图

来源：2026-09-02 对 `3ee2c58...HEAD`（56 commits，171 文件）的双轴评审（Standards + Spec），两轴报告经人工复核，最严重项已逐一实证。本地图把这些发现转为工单并按优先级闭环。

## 目标与非目标

**目标**：发布前修掉 2 个 Standards 硬违规（H1 安全边界、H2 测试门禁）+ 1 个 Spec 高危（C1 keep 后 badge 永挂）；0.2.x 跟进项全部建票并尽量清完。

**非目标**：不动上游文件（品牌图标等已登记例外除外）；不做版本锁定/回滚（ADR-0004 既定）；不重构 God components（只建票）；不移除登记表 `ref` 字段（工单地图 2026-09-01 决策明确预留，规范覆盖 smell 基线）。

## 评审结论摘要

| 轴 | 发现 | 最严重 |
|---|---|---|
| Standards | 2 硬违规 + 5 组 judgement call | H1：附件上传路由绕过文件访问白名单 |
| Spec | 4 缺失 + 5 越界（均无 spec，0 冲突）+ 3 可疑 | C1：keep 后 sourceTreeHash 不推进，badge 永挂 |

已实测基线：`tsc --noEmit` 干净；`npm test` 849 过；`poweri/**/*.test.mjs` 111 过但不在 npm test glob 内。

## Decisions-so-far

- **2026-09-02** 修复顺序 = blocker（01→03）→ 跟进项（04→09）→ backlog 建票不实施（10、11）。
- **2026-09-02** H1 修法沿用同层先例 `app/poweri/api/resolve-file/route.ts` 的 `getAllowedFileRoots()` + `isFilePathAllowed()` 模式；纯判定逻辑抽 `decideAttachmentCwd()` 供单测，避免 `@/lib` 导入破坏 node 直跑测试。
- **2026-09-02** C1 修法：keep 语义 = "确认当前远端版本、放弃本次更新"，`sourceTreeHash` 推进到 `latest`，此后远端再变才重新报可更新。
- **2026-09-02** 票05（原 skill-repo-updates）原型流程偏差：正式 UI 已落地但 tracker 无拍板记录，处理为回填事实记录 + 显式标注偏差，不返工重做原型。

## Tickets

| 票 | 优先级 | 类型 | 来源 |
|---|---|---|---|
| [01 附件上传接入白名单](./20260902-01-attachment-upload-allowlist.md) | blocker（Standards H1） | task | 评审 |
| [02 keep 后 badge 永挂](./20260902-02-keep-advance-tree-hash.md) | blocker（Spec C1） | task | 评审 |
| [03 测试接线进 npm test 与 CI](./20260902-03-test-wiring-ci.md) | blocker（Standards H2） | task | 评审 |
| [04 conflict 态查看差异](./20260902-04-conflict-diff-view.md) | 0.2.x（Spec A1） | task | 评审 |
| [05 订阅删除走 removeSubscription](./20260902-05-delete-via-remove-subscription.md) | 0.2.x（Spec A2） | task | 评审 |
| [06 票05 原型决策回填](./20260902-06-backfill-prototype-record.md) | 0.2.x（Spec A3） | task | 评审 |
| [07 地图口径同步 + 同步失败语义](./20260902-07-map-sync-fail-semantics.md) | 0.2.x（Spec A4） | task | 评审 |
| [08 inferred 反查歧义取 unknown](./20260902-08-inferred-ambiguity.md) | 0.2.x（Spec C2） | task | 评审 |
| [09 评审小项清理批](./20260902-09-cleanup-batch.md) | 0.2.x | task | 评审 |
| [10 本地技能 basename 判同源误合并](./20260902-10-basename-merge-risk.md) | backlog | task | 评审 |
| [11 UI 层回归测试网](./20260902-11-ui-test-net.md) | backlog | task | 评审 |

## Fog

- 票04：check 响应中 conflict 项是否已带 `changedFiles` 待实现时核实（`skill-update-service.ts` 的 check 路径疑似已算，apply 409 体未带）。
- 票07：`resolveUpdateState` 两处 catch 的精确行为待读码后定修法（方向：优先用磁盘上陈旧缓存判定 = "退回上次已知结果"，缓存不可用才 fail-soft）。
