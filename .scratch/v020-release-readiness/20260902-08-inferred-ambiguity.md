---
title: 08 inferred 反查跨源歧义取 unknown
status: done
type: task
labels: [ready-for-agent]
---

## 背景（Spec C2，中低）

原 README 决策（2026-09-01）："老安装反查用内容比对：内容与当前远端一致才补记 inferred，否则 unknown-origin（**歧义取 unknown，安全优先**）"。

实现（`poweri/lib/skill-subscriptions.ts:342-377`）仅与**当前正在同步的源**做内容比对并补记，无跨源同名歧义检测：同名技能存在于多个 git 源时，先同步者凭内容一致即得 `inferred`——正是原地图 Fog 明示的未验证场景（`sub-cas918` 与 litta 源交集）。

## 要做什么

1. 反查时收集**所有** git 订阅源缓存中存在同名 `skills/<name>` 的源集合：候选 >1 → 记 `unknown`（歧义取 unknown）；候选 ==1 → 内容一致才 `inferred`，否则 `unknown`。
2. 保持既有函数签名与返回形状不变，仅改判定内部。
3. 补测试：两个源缓存各有一份同名且内容一致的技能 → 反查结果 `unknown`（而非先到先得）。

## 验收

1. `node --test poweri/lib/skill-subscriptions.provenance.test.mjs poweri/lib/skill-subscriptions.test.mjs`
2. `node_modules/.bin/tsc --noEmit`

## 验证记录（2026-09-02）

- 实现：`resolveUpdateState` 反查分支加跨源歧义扫描（其他 git 源缓存中同名且内容与本地一致 → unknown-origin 不补记；实现取保守口径——内容一致才算歧义候选）
- 测试：两源同名同内容 → `unknown-origin` 且登记表不补记（修复前会先到先得 inferred）
