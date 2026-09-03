---
title: 工作区外文件（系统文档）点击打开能力评估——是否扩大文件访问安全边界
status: backlog
triage: needs-triage
tags: [type: research]
---

# 工作区外文件点击打开能力评估

## 背景

产品需求："消息内涉及的文档是本项目的文档**或者系统的文档**时，都可以直接点击打开"。
2026-09-03 已落地工作区内的部分（见 `5514313` fix(poweri): 消息内文件链接点击真正走
resolve-file 兜底解析）：

- 裸 basename 工作区唯一命中 → 打开
- 已删除/不存在 → 「文件不存在」反馈
- 多命中 → 列出候选，不猜
- **工作区外（如 `~/Library/Logs/PowerI/poweri.log`、`~/.pi/agent/**`）→ 403 →
  「文件在工作区外，无法打开」反馈**

本工单处理最后一条：工作区外文件的打开能力。

## 问题

- `/poweri/api/resolve-file` 与 `/api/files/*` 均受上游 `lib/file-access.ts`
  的 `isFilePathAllowed`（allowlist = cwd + 会话已知根）约束，home 下路径默认拒绝。
- 放开 = 扩大上游安全边界，两条路线：
  1. **扩 allowlist**：改上游 `lib/file-access.ts`（§4 例外登记，每次上游同步冲突）
     或在产品层包一层代理 route（`app/poweri/api/`，不动上游）。
  2. **只读白名单**：仅放行明确的"系统文档"前缀（`~/.pi/agent/sessions/**`、
     `~/Library/Logs/PowerI/**`、`%USERPROFILE%\.poweri\**`），且仅 `type=read`。
- 安全考量：FileViewer 渲染 html/svg 的 XSS 面、`..` 逃逸、symlink、Windows 路径。

## 待决策

- D1：产品层代理 route（不动上游）vs 改上游 allowlist？
- D2：白名单前缀集定多大？
- D3：是否只读（不可 save/diff/download）？

## 关联

- `poweri/lib/file-open-resolver.ts`（点击链路，denied 态已就绪，放开后无需改）
- `app/poweri/api/resolve-file/route.ts`（服务端解析 + 授权）
