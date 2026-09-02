---
title: 09 评审小项清理批（Standards judgement calls）
status: backlog
type: task
labels: [ready-for-agent]
---

## 背景

Standards 轴 judgement call 中可直接小步清掉的项。**不做**：登记表 `ref` 字段（地图 2026-09-01 决策明确预留，规范覆盖 smell 基线）；本地技能 basename 合并（单独立票10）；God components 拆解（票11）。

## 清单

1. **Duplicated Code**：`poweri/lib/attachment-helper.ts:97,108` `PATH_ENVELOPE_RE` 与 `INLINE_ENVELOPE_RE` 逐字符相同 → 合并为一个具名常量（如 `ATTACHMENT_ENVELOPE_RE`），两处引用；确认测试仍绿。
2. **Duplicated Code**：`poweri/lib/skill-subscriptions.ts` `getMarketSkills()` 内联的小写 includes 过滤级联与 `poweri/lib/skills-catalog.ts:45` `matchesSkillQuery()` 形状相同 → 改为复用后者。
3. **Speculative Generality**：`poweri/lib/skill-update-service.ts` 尾部 `export type { SkillInstallRecord }`（注释自认仅为压制 unused-import）→ 确认无外部引用后删除。
4. **lint**：`poweri/features/plugins/PowerIPluginsConfig.tsx` 2 个未用参数删除；`runPackageAction` 的 exhaustive-deps 警告按 useCallback 依赖修正（闭包陈旧风险）。
5. **主题变量约定**：`poweri/components/MessageView.tsx` 附件胶囊硬编码 `rgba(59,130,246,…)` → 改用 `app/globals.css` 既有 CSS 变量（`--accent` 系）。
6. **注释溯源**：`poweri/lib/skill-subscriptions.ts` 判定逻辑注释引用 `.scratch/skill-repo-updates/README.md` 路径 → 把关键判定规则内联进注释（scratch 可能被清理），保留工单号作出处。

## 验收

`node --test poweri/lib/attachment-helper.test.mjs poweri/lib/skills-catalog.test.mjs poweri/lib/skill-subscriptions.test.mjs && node_modules/.bin/tsc --noEmit && npm run lint`（源码范围 0 errors）
