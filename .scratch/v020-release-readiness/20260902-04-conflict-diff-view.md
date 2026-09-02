---
title: 04 conflict 态查看差异（文件级三列）
status: backlog
type: task
labels: [ready-for-agent]
---

Blocked by: 无（数据层已就绪）

## 背景（Spec A1，中高）

工单地图判定表：`conflict → 警示 badge；展开给 覆盖 / 保留本地 / 查看差异`；原票05："展开区内文件级 added/removed/modified 三列并排横放"。

数据层已算 conflict 的变更清单，但 UI 只在 `update-available` 分支渲染差异：`poweri/features/skills/SkillsMarketView.tsx:1337` 三元里 conflict 分支仅 force + keep 两按钮，无差异视图。

## 要做什么

1. 核实数据通路：check 路径（`poweri/lib/skill-update-service.ts` check 函数，约 :121）疑似已对 conflict 计算 `changedFiles`；apply 409 体目前只有 `localHash/baselineHash/remoteHash`（`app/poweri/api/skills/update/route.ts:46-48`）。若 check 的 conflict 项已带 `changedFiles` 直接接 UI；否则在 check 响应的 conflict 项补上（`diffDirChanges()` 零成本）。
2. UI：conflict 展开区加"查看差异"入口 → 文件级三列并排横放（added/removed/modified，产品理念：小可视化并排减竖向压力）；容器窄时堆叠（container queries，不用 `@media`）。条目 = `path`，按 kind 分列。
3. 文案 i18n 走 `poweri/lib/i18n.ts` 既有机制（本周期已落地全量 i18n）。

## 验收

1. 构造 conflict fixture：手改本地技能 → check → 展开可见三列文件清单，与 `changedFiles` 一致。
2. `node --test poweri/lib/skill-update-service.test.mjs && node_modules/.bin/tsc --noEmit`
