---
title: 01 附件上传接入文件访问白名单
status: active
type: task
labels: [ready-for-agent]
---

## 背景（Standards H1，硬违规）

`app/poweri/api/attachments/upload/route.ts` 接受客户端任意 `cwd`，经 `poweri/lib/attachment-storage.ts` 的 `getAttachmentsDirectory()` 直接 `path.join(cwd, ".pi", "attachments")` 写盘，**无任何 allow-list 校验**（`fs.existsSync(cwd)` 即接受）。本地服务无鉴权，本机任意进程/页面可借该路由向进程有权限的任意目录写文件。

违反 `docs/desktop/traps.md`「File access allow-list」："`isPathWithinRoots()`（`lib/path-security.ts`）is the security boundary"，新位置可访问必须 `allowFileRoot()`。同层正确先例：`app/poweri/api/resolve-file/route.ts:29` 调用 `isFilePathAllowed(cwd, allowedRoots)`。

文件名向量已天然中和（`name.replace(/[/\\]/g,"_")` 后还拼时间戳后缀），主向量是 `cwd` 本身。

## 要做什么

1. `poweri/lib/attachment-storage.ts` 新增**纯函数** `decideAttachmentCwd(cwd, isAllowed)`：无 `cwd` → `{ ok: true, cwd: null }`（走既有 `~/.pi/agent/attachments/` 回退）；有 `cwd` 且 `isAllowed(cwd)` 为假 → `{ ok: false, reason: "cwd-not-allowed" }`；否则 `{ ok: true, cwd }`。以注入谓词方式解耦，避免该模块 import `@/lib/file-access`（会破坏 `node --test` 直跑）。
2. 路由内：`const allowedRoots = await getAllowedFileRoots();` → `decideAttachmentCwd(body.cwd, (p) => isFilePathAllowed(p, allowedRoots))`；`!ok` 返回 403，形状照抄 `resolve-file/route.ts` 的错误响应风格。导入来自 `@/lib/file-access`（复用上游能力，直接 import）。
3. `saveTextAttachment` 不改签名，继续用 `fs.existsSync(cwd)` 作兜底回退（校验后 cwd 消失 → 安全方向回退）。

## 验收

1. `attachment-storage.test.mjs` 补用例：无 cwd → ok/null；cwd 被谓词拒绝 → 不 ok；谓词通过 → ok 原样；另补 name 清理边界（`".."`、含 `/`、含 `\`）断言产物是单文件名。
2. 手动：`curl -X POST :30141/poweri/api/attachments/upload -d '{"name":"x.txt","content":"hi","cwd":"/etc"}'` → 403；不传 cwd → 200 且落 `~/.pi/agent/attachments/`。
3. `node --test poweri/lib/attachment-storage.test.mjs && node_modules/.bin/tsc --noEmit`
