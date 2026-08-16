# 16-f11-gitpanel-scope

Type: grilling
Status: open
Blocked by: 02

## Question

GitPanel 范围与形态的决策（最大增量）：

- 功能子集取舍（参考 02 的 ct-jyjntc 清单）：status/stage/commit/push/分支切换/AI 提交信息/冲突助手/commit split/Git Review 会话——哪些进 v0.2，哪些后置？
- 与官方已有 git 能力的关系：worktrees（lib/worktree.ts + app/api/worktrees）已存在，GitPanel 与它的边界
- UI 落点：右分屏 tab？（与 07 布局联动）独立抽屉？
- 权限联动：git 写操作是否走 15 的权限系统？

决策输出：v0.2 GitPanel 范围清单 + 落点。
