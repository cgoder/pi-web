---
title: 06 订阅凭据零泄露加固
status: backlog
type: task
labels: [needs-triage]
---

Blocked by: （无，与更新链路正交，故本次实施不动它）

## 问题

全局约定 §3 要求"凭据零泄露"，当前私有源 token 有三条外泄面：

1. **明文落盘**：`poweri-subscriptions.json`（实测 `-rw-r--r--`，0644）里 `token` 字段原样存储
2. **回传前端**：`getMarketSkills()` 直接 `return { skills, subscriptions }`，`subscriptions` 含 `token` → 经 `app/poweri/api/skills/market/route.ts` 进 JSON 响应，`SkillsMarketView.tsx:1224` 还把它回填进输入框（`initialToken={modalState.sub?.token ?? ""}`）
3. **写进 git 配置**：`syncGitSubscription()` 把 token 拼进 URL（`u.username="oauth2"; u.password=sub.token`）后 `git clone`，git 会原样把带凭据的 URL 记进缓存仓库 `.git/config` 的 `remote.origin.url`

第 3 条目前**未被实测触发**——现存的三条缓存仓库 `remote -v` 都是干净的无凭据 URL（这些订阅都没设 token）。要复现验证：给一个私有源配 token 后首次 clone，检查 `.git/config`。别把这条当既成事实写进结论。

## 要做什么

1. 响应脱敏：`getMarketSkills()` 返回的 `subscriptions` 用白名单投影，只出 `id/url/name/category/type/addedAt/lastSyncedAt/error/isDefault/hasToken`；UI 输入框的 token 改为"留空即不修改"语义
2. token 不落 git 配置：clone/fetch 用 `git -c http.extraHeader="PRIVATE-TOKEN: <t>"`（GitLab）或 `GIT_ASKPASS` / `-c credential.helper=` 一次性凭据，保持 `origin.url` 干净
3. 存储收紧：`poweri-subscriptions.json` 写成 `0600`；更进一步（可选）交给系统凭据库，但要先确认 Tauri 壳与 web 两种运行形态都能取到
4. 全链路禁日志：任何 `console.*` / 错误消息拼接前先脱敏（`err.message` 里可能带 URL）

## 验收

- 单测：`getMarketSkills` 返回值深度遍历不含 `token` 键
- 单测/集成：设 token 的 fixture 私有仓库 clone 成功后，`git -C <cache> config --get remote.origin.url` 不含凭据
- grep 检查：新增代码路径无 `sub.token` 进入响应体或日志
