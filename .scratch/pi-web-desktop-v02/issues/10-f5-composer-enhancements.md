# 10-f5-composer-enhancements

Type: grilling
Status: resolved

## Question

Composer 增强范围的决策：

- @文件 / !shell / 斜杠命令：各支持到什么程度（哪些是 pi 消息格式/服务端原生支持的？先读 lib/rpc-manager.ts 的 send/prompt 路径与 lib/pi-types.ts）
- 实现形态：ChatInput 改造 vs 新组件；提示/补全交互
- 与官方已有能力（如文件引用）的边界

决策输出：v0.2 Composer 增强范围清单。

## Answer（2026-08-16 用户拍板）

**v0.2 Composer 范围：官方已全覆盖三语法，只补三个内置斜杠命令。**

**核实事实**（本仓库官方 v0.8.9 代码）：
- **@文件补全**：已完整实现——`lib/file-fuzzy.ts`（extractAtQuery/buildAtInsertText/buildAtMentionText，含引号路径、目录钻取）、`/api/file-index` 索引 API、ChatInput.tsx:22-24/809-911
- **!/!! shell**：已完整实现——bashMode/bashExcluded（ChatInput.tsx:409-410）+ executeBash（type:"bash" + excludeFromContext，useAgentSession.ts:1372-1384，!/!! 语义同 ct）
- **斜杠命令**：已实现——BUILTIN_SLASH_COMMANDS 五项（compact/reload/name/session/copy）+ SLASH_SOURCES 四源（builtin/extension/prompt/skill，ChatInput.tsx:162-179）+ 命令面板 UI
- 结论：官方与 ct-jyjntc 同源（ct 本就 fork 官方），三语法无差距

**v0.2 增量（唯一）**：内置斜杠命令补 `undo`/`redo`/`init` 三项（照 ct 的 BUILTIN_SLASH_COMMANDS + 前端直接处理 RPC 的方式实现）；其余零改动。不做自定义命令管理 UI（官方读 markdown 命令文件的能力已够）

**边界声明**：Composer 三语法=官方已有即交付，不列入 v0.2 工作项（除三命令）；ChatInputModeMenu（模式菜单）属 15 权限系统，不在此工单。
