---
title: 02 keep 后 sourceTreeHash 推进，badge 清空
status: backlog
type: task
labels: [ready-for-agent]
---

## 背景（Spec C1，高危）

票04（skill-repo-updates）验收3："**`mode:'keep'` 后 updateState 变 `up-to-date`**"；要做什么："keep → 放弃远程改动：把基线推进到当前本地状态，badge 清空"。

现实现 `poweri/lib/skill-update-service.ts` keep 分支（约 :188-190）只 `upsertInstall({ ...record, baselineLocalHash: currentLocal })`，**不更新 `sourceTreeHash`**；该分支必在 `latest !== record.sourceTreeHash` 之后（否则 :180 已 `unchanged` 返回）。于是 `resolveUpdateState()`（`poweri/lib/skill-subscriptions.ts:407-410`）恒判 `update-available`——"保留本地"后徽章与更新入口永远存在。现有测试 `skill-update-service.test.mjs:139-167` 只断言基线推进与内容不动，恰好漏验验收3。

## 要做什么

keep 分支改为：

```ts
upsertInstall({ ...record, baselineLocalHash: currentLocal, sourceTreeHash: latest, updatedAt: Date.now() });
return { folder, success: true, mode: "keep", before: record.sourceTreeHash, after: latest };
```

语义（已记入本地图 Decisions-so-far）：keep = "确认当前远端版本、放弃本次更新"；此后远端再推进才重新报 `update-available`。其余分支一字不动。

## 验收

1. `skill-update-service.test.mjs` keep 用例追加断言：keep 后 `resolveUpdateState`（或等价判定入口）返回 `up-to-date`，本地内容未被回退（即票04 验收3 原文）。
2. 原有 8 条用例全绿：`node --test poweri/lib/skill-update-service.test.mjs poweri/lib/skill-subscriptions.test.mjs`
3. `node_modules/.bin/tsc --noEmit`
