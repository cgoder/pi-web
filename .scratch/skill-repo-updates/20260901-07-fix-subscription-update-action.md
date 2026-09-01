---
title: 07 编辑订阅源返回 unknown action
status: active
type: task
labels: [ready-for-agent]
---

Blocked by: （无）

## 缺陷

前端与路由的 `action` 枚举不一致，**编辑已有订阅源必然失败**：

- `poweri/features/skills/SkillsMarketView.tsx:609-621` 保存已存在源时发 `action: "update"`（注释即写着"统一处理新增与更新"）
- `app/poweri/api/skills/market/route.ts` 只实现 `"add"`（第 47 行）与 `"remove"`（第 80 行），其余落到第 92 行 `{ error: "unknown action" }` → 400
- 前端 `handleSaveSub` 见 `!res.ok || data.error` 即 `throw`，最终 `alert("unknown action")`

后果：源 URL 写错、token 需要轮换、名称要改——都改不了，只能删源重装。删源重装还会换 `sub.id`（含时间戳后缀），留下孤儿缓存目录（实测 `git-subscriptions/` 有 3 个目录对 2 条订阅）。

与技能更新链路的关系：**token 过期时无法更新凭据 = 无法更新技能**，所以本票是 04 的隐性前置，虽不阻塞开工。

## 要做什么

在 `app/poweri/api/skills/market/route.ts` 补 `action: "update"` 分支，按 `id` 定位并**只覆盖显式传入的字段**：

```ts
if (body.action === "update") {
  const sub = subs.find((s) => s.id === body.id);
  if (!sub) return NextResponse.json({ error: "subscription not found" }, { status: 404 });
  if (body.url) sub.url = body.url.trim();
  if (body.name !== undefined) sub.name = body.name || undefined;
  if (body.category) sub.category = body.category;
  if (body.token) sub.token = body.token;          // 空字符串 = 不修改（前端脱敏后语义，见 06）
  writeSubscriptions(subs);
  return NextResponse.json({ success: true, subscription: sub });
}
```

- `sub.id` 保持不变（缓存目录按 id 命名，换 id 会白白重克隆）
- url 变更时提醒：`git-subscriptions/<id>/.git` 的 `origin` 仍指旧仓库，需要 `set-url` 或删缓存重克隆——本票取"url 变化即删除该 id 缓存目录，下次同步重克隆"，实现最简且不残留
- 顺手补 `removeSubscription()` 的缓存目录清理（同文件 `poweri/lib/skill-subscriptions.ts:removeSubscription` 目前只改 JSON），消除孤儿目录

## 验收

1. 单测：`update` 分支只改传入字段，未传字段保持；未知 id → 404
2. 单测：改 url 后对应缓存目录被清除，下次 `getMarketSkills` 重克隆
3. 手工：`npm run dev` → `/poweri` 技能面板 → 编辑源名称 → 保存成功且列表刷新无 alert
4. 回归：新增/删除源两条既有路径不变坏

```bash
node --test poweri/lib/*.test.mjs && node_modules/.bin/tsc --noEmit && npm run lint
```
