---
title: 05 订阅删除改走 removeSubscription 清缓存
status: done
type: task
labels: [ready-for-agent]
---

## 背景（Spec A2，中）

原票07"要做什么"："顺手补 `removeSubscription()` 的缓存目录清理……消除孤儿目录"。`poweri/lib/skill-subscriptions.ts:223` 确已补清理逻辑，但**无任何调用方**（全库 grep 仅定义处）：实际删除路径 `app/poweri/api/skills/market/route.ts:105-112` 内联 `subs.filter(...)` + `writeSubscriptions`，直接绕过，缓存目录照旧残留成孤儿。

## 要做什么

1. `app/poweri/api/skills/market/route.ts` 删除分支改调 `removeSubscription(subId)`（保持既有响应形状与错误处理不变）。
2. 若 `removeSubscription` 尚无直测，补一条：fixture 临时目录伪造订阅缓存 + `poweri-subscriptions.json` → 删除 → 断言 json 移除该条且缓存目录消失。

## 验收

1. `grep -n "subs.filter" app/poweri/api/skills/market/route.ts` 删除路径无残留（其他合法用途除外）。
2. `node --test poweri/lib/skill-subscription-edit.test.mjs poweri/lib/skill-subscriptions.test.mjs`
3. `node_modules/.bin/tsc --noEmit`
