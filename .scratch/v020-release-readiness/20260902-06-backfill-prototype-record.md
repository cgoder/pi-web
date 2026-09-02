---
title: 06 票05 原型决策回填与流程偏差记录
status: done
type: task
labels: [ready-for-agent]
---

## 背景（Spec A3，中）

原票05（`.scratch/skill-repo-updates/20260901-05-update-badge-prototype.md`）要求："胜出方案的关键决策写回本票 Answer 段，status: done，并在 README Decisions-so-far 追加一行；随后才开正式实现"；地图决策："UI 部分按产品理念 2 需先出 `?variant=` 变体再落正式实现"。

现状：票05 已标 done 但**无 Answer 段**；README 无 UI 决策行；分支无对应 prototype 分支与 `?variant=` 代码；`poweri/features/skills/SkillUpdateBar.tsx:1` 注释声称"工单 05 拍板：变体 A 最小侵入"，拍板凭据在 tracker 零记录。理念2"不经用户确认不得落正式实现"无法证实已履行。

## 要做什么（回填事实，不返工）

1. 原票05 补 Answer 段：如实记录实际落地设计（`SkillUpdateBar.tsx` 变体 A：行内 badge + 展开操作条；commit `eb8b895`），并**显式标注**"未走 `?variant=` 变体流程、无用户拍板记录"的流程偏差。
2. 原 README（skill-repo-updates）Decisions-so-far 追加一行：记录偏差与追认方式。
3. 本地图 Decisions-so-far 已有对应条目（2026-09-02），无需重复。

## 验收

两处文档可查、口径一致、不虚构未发生的拍板。
