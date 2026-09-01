---
title: 03 同步 TTL 与 updateState 检测
status: backlog
type: task
labels: [ready-for-agent]
---

Blocked by: 20260901-01-install-registry.md

## 背景

`getMarketSkills()` 每次调用都对**所有** git 订阅源执行 `fetch --depth=1`（`poweri/lib/skill-subscriptions.ts` 的 `syncGitSubscription()`），打开面板即全量拉网络。网络抖动已经在测试上留过疤（提交 `3966083 test(skills): enhance network timeout tolerance`）。加更新检测之前，必须先把"什么时候真的同步"变成显式策略，否则 badge 会把面板拖成秒级卡顿。

## 要做什么

### 1. TTL 同步策略

- 常量 `SYNC_TTL_MS = 10 * 60 * 1000`
- `syncGitSubscription(sub, { force })`：`Date.now() - sub.lastSyncedAt < SYNC_TTL_MS && !force` → **跳过网络，只重新解析缓存目录**（解析本地文件是毫秒级，列表照常准确）
- 同步失败 → 保留旧缓存继续解析（fail-soft），错误写进 `sub.error`（现有行为），并让本次 updateState 判定退回"上次已知结果"，**不得**因为拉取失败就报 `unknown-origin`
- `getMarketSkills(cwd, category, query, { forceSync })` 新增可选参数，经 `app/poweri/api/skills/market/route.ts` 的 `?force=1` 暴露给 UI 的"检查更新"按钮

### 2. 检测

`MarketSkillItem` 增加字段（PowerI 自有类型，可自由扩）：

```ts
updateState?: "up-to-date" | "update-available" | "conflict" | "unknown-origin";
installedVersion?: string;   // 登记时的 sourceTreeHash
latestVersion?: string;      // 远程当前 sourceTreeHash
```

判定按地图 README 的[判定表](./README.md#判定表)执行，实现在 `poweri/lib/skill-subscriptions.ts` 的 git 解析循环里（`installed` 分支处），要点：

- 当前本地摘要 ≠ `baselineLocalHash` → `conflict`（优先级最高，先于版本比较）
- `remoteTreeHash()` 在缓存目录上直接算，零额外网络
- 登记表无记录的老数据：按 `path.basename(skillDir)` 在缓存仓库 `skills/<name>` 反查，命中则补记 `origin: "inferred"`；查不到 → `unknown-origin`，不给更新入口。**同名命中多个源时记 unknown 还是取最近同步源，见 README Fog，实现前须拍板**
- manifest / url 型源本票可先返回 `unknown-origin`（若决定一并处理，用清单 `version` 字段，缺失则内容 sha256）

### 3. 源级聚合

`getMarketSkills` 返回值加 `sources: Array<{ subscriptionId, name, total, outdated, conflict, error?, lastSyncedAt }>`，供源胶囊行显示 `N 技能 · M 可更新`（产品设计理念 7：组头聚合）。

## 验收

1. 单测：fixture 仓库两次 commit → TTL 内第二次调用 `getMarketSkills` **不产生 fetch 子进程**（用注入的 `runGit` 替身计数），`forceSync` 时产生
2. 单测：安装→远端改文件→force 同步 → `updateState === "update-available"` 且 `installedVersion !== latestVersion`
3. 单测：远端不动、本地手改 `SKILL.md` 正文 → `conflict`
4. 单测：本地仅把开关置休眠、正文未改 → **仍为** `up-to-date`（这条最容易做错，是剔除 `disable-model-invocation` 的回归护栏）
5. 手工：`npm run dev` → `/poweri` 技能面板，断网/错 token 时列表仍秒开且错误落在源胶囊上
6. 面板首屏耗时不明显变差（`?force=1` 才慢）

```bash
node --test poweri/lib/*.test.mjs && node_modules/.bin/tsc --noEmit && npm run lint
```
