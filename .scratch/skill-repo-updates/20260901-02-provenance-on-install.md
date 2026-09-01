---
title: 02 安装时登记来源凭证
status: backlog
type: task
labels: [ready-for-agent]
---

Blocked by: 20260901-01-install-registry.md

## 背景

没有登记，后面所有更新判定都无从谈起——这是整条链路的**前置依赖**，改动量最小（约 10 行）但收益最大。现状：`poweri/lib/skill-subscriptions.ts` `toggleSkillState()` 的 enabled 分支只做 `fs.cpSync(srcDir, destDir)`，拷完即断链。

## 要做什么

在 `toggleSkillState()` 安装成功之后、返回之前登记一条记录：

1. **git 源**：从 `target.localPath` 反推 `skillPath = path.posix.relative(cacheDir, srcDir)`（缓存目录由 `subscriptionId` 得到）；`sourceTreeHash = remoteTreeHash(cacheDir, skillPath)`；`repoUrl` / `subscriptionId` 取自 `MarketSkillItem` 已有字段（`subscriptionId`、`subscriptionUrl` 已在结构里，见 `skill-subscriptions.ts` 的 `MarketSkillItem`）
2. **manifest / url 源**：无 tree hash，`sourceTreeHash` 留空，改用 `baselineLocalHash` 与清单内容摘要比对（细化见 [03](./20260901-03-check-ttl-update-state.md) 的 Fog 项）
3. 安装完成后立即 `localDirHash(destDir)` 写入 `baselineLocalHash`；`disabled` 记录当前开关
4. `origin: "verified"`
5. **卸载路径**：`toggleSkillState()` 目前根本没有卸载（只有休眠）。本票**不做卸载**，只保证"关 = 休眠"语义不变；卸载与登记表清理留给后续独立票（避免扩围）

## 边界与坑

- 同名目录冲突：`~/.pi/agent/skills/<folder>` 已被别的源占用时，现在的 `cpSync` 会静默覆盖。登记时必须检测 `getInstall(folder)` 已有不同 `repoUrl` 的记录并**拒绝安装、返回明确错误**，否则账本会自相矛盾
- `path` 比较一律用 `samePath()`（`lib/paths.ts:62`），不得 `===`（Windows 大小写/分隔符，见 `docs/desktop/traps.md`）
- 不改 `MarketSkillItem` 之外的上游文件；`app/poweri/api/skills/toggle/route.ts` 是 PowerI 持有，可透传新错误信息

## 验收

在 `poweri/lib/skill-install-registry.test.mjs` 或新建 `poweri/lib/skill-subscriptions.provenance.test.mjs` 里，用临时 fixture git 仓库（`git init` → 写 `skills/demo/SKILL.md` → `git add/commit`，全程零网络）跑通：

1. 安装 → 登记表出现 `origin: verified`、`skillPath: "skills/demo"`、`sourceTreeHash` 为 40 hex、`baselineLocalHash` 与 `localDirHash(destDir)` 一致
2. 休眠开关切换后重新读表，`disabled` 字段跟随更新
3. 第二个源含同名 `skills/demo` 时安装 → 返回错误，登记表未被破坏

```bash
node --test poweri/lib/*.test.mjs && node_modules/.bin/tsc --noEmit && npm run lint
```
