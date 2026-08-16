# 16-f11-gitpanel-scope

Type: grilling
Status: resolved
Blocked by: 02

## Question

GitPanel 范围与形态的决策（最大增量）：

- 功能子集取舍（参考 02 的 ct-jyjntc 清单）：status/stage/commit/push/分支切换/AI 提交信息/冲突助手/commit split/Git Review 会话——哪些进 v0.2，哪些后置？
- 与官方已有 git 能力的关系：worktrees（lib/worktree.ts + app/api/worktrees）已存在，GitPanel 与它的边界
- UI 落点：右分屏 tab？（与 07 布局联动）独立抽屉？
- 权限联动：git 写操作是否走 15 的权限系统？

决策输出：v0.2 GitPanel 范围清单 + 落点。

## Answer（2026-08-16 用户逐问拍板）

**v0.2 GitPanel 范围（仅核心）+ 落点（并入文件面板）**：

1. **功能子集（仅核心）**：status 列表（冲突置顶，复用官方 getGitStatus）+ 逐文件 stage/unstage/discard（危险操作 UI 确认）+ 全量 stage/discard + commit（含未暂存开关）+ push + commit-and-push + 分支切换/新建（显示 ahead/behind）。**后置**：启发式/AI 提交信息、冲突助手（ours/theirs/base/AI）、commit split、Git Review 会话、提交历史、PR 联动——全部后续版本（AI 类依赖 12 砍掉的角色体系）
2. **UI 落点**：**并入官方文件面板**（#file-panel 加 Git tab，与文件 tab 并列）——不新增活动栏图标（07 活动栏图标集维持会话/文件/统计）；布局体系继续扩展官方 #file-panel/useResizablePanel
3. **后端**：照 ct 模式新增 `/api/git/*`（stage/unstage/discard/commit/push/branches，`execFile` git 二进制 + `assertAllowedCwd/assertAllowedPaths` 白名单——本仓库 file-access 体系）；官方已有 status/diff 保留复用
4. **权限联动**：git 写操作**不走 15 权限系统**（API 直调，tool_call 拦截覆盖不到）；UI 内 discard/force 等危险操作加确认弹窗

**边界**：与官方 worktrees（lib/worktree.ts + /api/worktrees）并存——GitPanel 面向当前 cwd 仓库操作，worktree 管理保持官方现有入口，互不重叠。
