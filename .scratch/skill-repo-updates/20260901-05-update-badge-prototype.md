---
title: 05 可更新 badge 与变更明细原型
status: done
type: prototype
labels: [ready-for-agent]
---

Blocked by: 20260901-03-check-ttl-update-state.md

## 为什么先做原型而不是直接实现

产品理念 2（原型先行）：UI 必须先看到效果，出 2–3 个**结构性变体**（`?variant=` 切换）→ 用户拍板 → 胜出设计 capture 到 `prototype/skill-repo-updates` 分支 → 才落正式实现。数据层（01–04）无视觉争议可以先落，本票不可跳过确认。

## 要探索的三个结构问题

1. **badge 放哪**：技能行右侧固定列（理念 7：右对齐 + 固定列宽 + tabular-nums 短 hash `a1b2c3→e4f5a6`），还是行尾独立图标 + 悬停说明？
2. **源级"更新全部"的入口位置**：放进源胶囊行本身（点源 → 该源过滤 + 该源批量），还是顶部工具栏常驻？与现有 `installed / discover` 双 Tab、源胶囊筛选（`SkillsMarketView.tsx:993` 附近）的互斥语义怎么不打架（理念 3：活动栏互斥语义）
3. **冲突态与"查看差异"的呈现**：行纹丝不动、详情在行下方全宽展开（理念 1）——展开区内文件级 `added/removed/modified` 三列并排横放（理念 5 宽断点多列），还是给一个 mini-bar 聚合 + 点击下钻（可视化优先于数字罗列）？行级 diff 本票明确**不做**

## 变体建议

- **变体 A（最小侵入）**：行右侧仅一枚 `可更新` badge，批量动作只在源胶囊上；冲突走 badge 变色 + 点击展开
- **变体 B（信息优先）**：行右侧固定列显示 `当前→最新` 短 hash + 时间戳（Git log 式），源胶囊行聚合 `N 技能 · M 可更新`
- **变体 C（面板化）**：技能行保持干净，新增一个"待更新"横条/抽屉，列出全部可更新项与变更文件明细，一次性批量应用

三者都要能验证：空态（全部最新）、单条可更新、源级多条、含 conflict、源同步失败（`sub.error`）五种数据形态。造数据用 03 票的 fixture，别硬编码假 skill。

## 输出

胜出方案的关键决策（badge 文案、列宽、聚合口径、交互层级）写回本票 Answer 段，`status: done`，并在 [README](./README.md) 的 Decisions-so-far 追加一行；随后才开正式实现票。

## Answer（2026-09-02 回填，见下方偏差声明）

实际落地为**变体 A（最小侵入）**，落在 commit `eb8b895`、`944faae`（`poweri/features/skills/SkillUpdateBar.tsx` + `SkillsMarketView.tsx`）：

- badge：仅 `可更新` / `冲突` 两态，技能行右侧胶囊，点击在卡片内展开（行纹丝不动，理念 1）；展开区含短 hash `a1b2c3→…` 与文件级三列变更清单（`added/removed/modified` 并排横放，理念 5），行级 diff 不做（既定）
- 源级"更新全部"：源胶囊行承载（变体 A 口径），面板顶部另有 `SkillUpdateBar` 汇总条
- 冲突三选：覆盖 / 保留本地 / 查看差异（查看差异为 2026-09-02 评审后补齐，工单 v020-release-readiness/04）

### ⚠️ 流程偏差声明

本票未按"先出 `?variant=` 结构性变体 → 用户拍板 → capture 到 prototype 分支"执行：变体代码、用户确认记录、`prototype/skill-repo-updates` 分支均不存在，正式实现直落。`SkillUpdateBar.tsx` 头注释所称"工单 05 拍板：变体 A"在 tracker 内无凭据。此偏差已如实登记，不追溯返工；后续 UI 工单须回到理念 2 流程。
