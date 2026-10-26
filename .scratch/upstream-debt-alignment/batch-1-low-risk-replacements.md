# 第一批：低风险替换件过账（25 条）

Type: spec/batch
Status: backlog
Triage: ready-for-agent
Parent: [上游欠账对齐](../upstream-debt-alignment/README.md)
ADR: [ADR-0002 分层架构](../../docs/adr/0002-layered-architecture.md) · [ADR-0004 enabled-models 开关](../../docs/adr/0004-enabled-models-toggles.md)
登记表: [`docs/desktop/replacements.json`](../../docs/desktop/replacements.json)
Tickets: [tickets.md](./tickets.md)（20 张）+ [tickets/](./tickets/)

---

## Problem Statement

PowerI 的 12 个替换件不随上游合并更新。当前登记表里有 147 条上游改动未过账，用户已经直接感受到症状——「界面还是一样啊，上游的修改都没有融合进来？」。

但 147 条不是一个可以整体推进的量。其中 `SessionSidebar` 与上游相似度只有 19.3%，推平重做属于产品决策；`ChatWindow`/`ChatInput`/`MessageView`/`AppShell` 共 88 条，量大且需要逐条判断与 PowerI 自有改动的冲突。

剩下的四个替换件情况完全不同：相似度高（73–96%）、改动局限在单文件、依赖的上游能力**已经在基础层里躺着**，只是没人接线。这批欠账不做的代价是持续可见的：用户点开 CSV 看到一堆逗号、打开大文件卡住、设置里找不到 MCP 配置、文件标签溢出被裁切。

## Solution

把这四个替换件的 25 条欠账一次做完，作为验证「过账工作流」的第一批样本：

- **FileViewer 10 条** —— CSV/TSV 表格、大文件分页、Prism 按需加载、行号 gutter 固定、PDF `#page=`、锚点跳转、主题切换背景、文件版本去重
- **SettingsPanel 7 条** —— MCP 配置与信任（4 条）、发送键切换、Code mode 设置、enabledModels 开关接线
- **TabBar 4 条** —— 标签溢出裁剪与滚轮滚动、36px 高度、PDF 页片段、无障碍
- **MermaidBlock 4 条** —— 浅色主题代码块边框、主题切换背景、按需高亮、Prism 懒加载

做完这批，用户能实际看到变化（CSV 变表格、超长文件分页、设置里出现 MCP），同时把「一条欠账怎么关」的固定流程跑通、验证透，给第二批 97 条留下可复制的模板。

## User Stories

### FileViewer

1. 作为用户，我希望点开 `.csv` 或 `.tsv` 时看到对齐的表格而不是逗号分隔的原文，这样我不用切到表格软件才能读懂。
2. 作为用户，我希望 CSV 表格能处理引号内的逗号与换行，这样真实导出的数据不会错列。
3. 作为用户，我希望 CSV 表格的列宽按内容自适应并有上下限，这样长文本列不会把表格撑爆。
4. 作为用户，我希望超宽 CSV 表格能横向滚动，这样列多时我仍能看全。
5. 作为用户，我希望 CSV 文件仍能切回源码视图，这样我需要看原始字符时不被表格挡住。
6. 作为用户，我希望打开几万行的日志时先看到开头一屏并有「加载更多」，这样我不会因为一次渲染整文件而卡住界面。
7. 作为用户，我希望「加载更多」旁边显示已加载字节数 / 文件总大小，这样我知道还剩多少。
8. 作为用户，我希望加载更多是追加而不是替换，这样我滚回去看前面的行还在。
9. 作为用户，我希望超过 256 KB 的 HTML 文件也能预览，这样我不会只看到「文件太大」。
10. 作为用户，我希望只有真正需要的语法高亮语言被加载，这样打开文件不会因为打包了全部 Prism 语言而变慢。
11. 作为用户，我希望源码视图的行号栏在横向滚动时固定住，这样我左右移动代码时行号仍在眼前。
12. 作为用户，我希望代码字体更易读，这样长时间看代码不累。
13. 作为用户，我希望浅色主题下代码块里没有多余的双重边框，这样观感与上游一致。
14. 作为用户，我希望切换主题时代码块背景正确跟着变，不出错位或闪烁。
15. 作为用户，我希望点击 Markdown 里的 PDF 链接能跳到指定页，这样我不必自己翻。
16. 作为用户，我希望点击 Markdown 里的站内锚点能跳到正确标题，而不是跳错或不动。
17. 作为用户，我希望指向桌面应用（Obsidian、VS Code 等）的链接被保留，这样我的笔记链接仍然可用。
18. 作为用户，我希望同一份文件在我没修改时不会被反复重新渲染，这样切换窗口回来不闪。
19. 作为用户，我希望文件在被别处修改后能自动更新，这样我不用关掉重开。
20. 作为用户，我希望文件查看器在页面隐藏时释放事件流，这样开很多标签页不会把后端连接占满。

### SettingsPanel

21. 作为用户，我希望在设置里看到 MCP 服务器列表，这样我知道哪些外部工具能接入。
22. 作为用户，我希望在设置里信任某个项目的 MCP 服务器，这样我不用去别处确认。
23. 作为用户，我希望粘贴一段 MCP 服务器配置就能添加，这样我不必手写 JSON 文件。
24. 作为用户，我希望添加 MCP 服务器的同时完成该新目录的信任，这样不用分两步。
25. 作为用户，我希望用 `/mcp` 直接跳到设置的 MCP 页，这样我不用一层层点菜单。
26. 作为用户，我希望配置按 Enter 还是 Ctrl+Enter 发送，这样能按自己的肌肉记忆打字。
27. 作为用户，我希望在设置里配置 Code mode 的工具选择，这样我不用记它的 API。
28. 作为用户，我希望在设置里逐项开关哪些模型出现在选择器中，这样候选范围由我控制。
29. 作为用户，我希望未启用的模型在设置里有明显提示，这样我知道为什么列表里看不到它。
30. 作为用户，我希望设置页的分区顺序稳定、图标清晰，这样我每次都能快速找到目标页。

### TabBar

31. 作为用户，我希望文件标签多到溢出时可以滚动查看，而不是被裁掉，这样每个打开的文件都够得着。
32. 作为用户，我希望标签条高度固定 36px，不被出现的滚动条挤走，这样标签不会上下跳动。
33. 作为用户，我希望用滚轮就能横向滚动标签条，这样触控板用户不用找滚动条。
34. 作为用户，我希望点击 PDF 的标签时回到之前看的那一页，而不是回到第一页。
35. 作为用户，我希望标签支持键盘导航（方向键切换、`aria-selected` 正确），这样我不必只用鼠标。
36. 作为用户，我希望关闭标签时焦点落到相邻标签，这样我连续关多个文件不会失去焦点位置。

### MermaidBlock

37. 作为用户，我希望浅色主题下代码块只有一层边框，这样不会看起来像双重描边。
38. 作为用户，我希望切换主题时代码块背景正确更新，这样浅色/深色都对得上。
39. 作为用户，我希望代码高亮语言按需加载，这样首次打开聊天不会因为加载全部语言而延迟。
40. 作为用户，我希望流式输出的代码块在高亮语言就绪后自动补上高亮，这样我不必等整段结束。
41. 作为用户，我希望超长代码块不被高亮拖慢，这样长回复仍然流畅。

### 维护者 / Agent

42. 作为维护者，我希望每条欠账关闭时在登记表留下具体落地位置，这样下一个人能复核。
43. 作为维护者，我希望批次做完后这四个替换件的 `pending` 归零，这样进度可量化。
44. 作为实现代理，我希望复用上游已有的叶子组件与库而不是复制，这样不产生第二份欠账。
45. 作为实现代理，我希望遇到必须改上游文件时立即停下，这样不破坏层边界。
46. 作为实现代理，我希望接线类缺口有断言保护，这样上游改名时测试会红。

## Implementation Decisions

### 关键事实：能力在基础层，缺的是接线

本轮勘察确认，这四个替换件缺的 25 条里，绝大多数依赖的上游实现**已经随合并进了基础层**，且与上游逐字节一致：

| 上游能力 | 基础层文件 | 状态 |
|---|---|---|
| 分页读文本块 | `lib/text-preview.ts` + files 路由的 `offset` 参数 | 已有，路由与上游一致 |
| CSV/TSV 解析 | `lib/delimited-table.ts` | 已有 |
| CSV 表格渲染 | `components/DelimitedTable.tsx` | 已有，上游叶子组件 |
| Prism 按需加载 | `lib/prism-languages.ts` + `hooks/usePrismLanguages.ts` | 已有 |
| 高亮预算 | `lib/highlight-queue.ts` | 已有 |
| 文件版本判重 | `lib/file-version.ts` | 已有 |
| 页面隐藏释放 | `hooks/usePageHidden.ts` | 已有 |
| 锚点跳转 | `lib/markdown.ts` 的 `jumpToMarkdownFragment` | 已有 |
| MCP 设置 UI | `components/McpConfig.tsx` + `mcp-config-helpers` | 已有 |
| MCP 添加 | `components/mcp-add-helpers.ts` + `lib/mcp-add.ts` | 已有 |
| 发送键 | `hooks/useEnterSendMode.ts` | 已有 |
| Code mode 设置 | `lib/codemode-settings.ts` | 已有 |
| enabledModels | `lib/enabled-models.ts` + `components/ModelsConfig.tsx` | 已有 |

**因此本批工作的性质是「接线与适配」，不是「重新实现」。** 这决定了成本模型与之对应的风险等级。

### 决策 1：FileViewer 分三步落地，不是一次重放

10 条欠账里有 4 条是**新能力**（CSV 表格、分页、HTML 大文件、Prism 按需），4 条是**外观修复**（边框、背景、gutter、字体），2 条是**接线**（锚点、版本判重）。三类改动互不耦合，应分成三个可独立验证的提交：

1. 新能力接线（CSV 表格 + 分页 + HTML 预览 + Prism）
2. 外观与滚动修复（gutter 固定、代码字体、主题背景、边框）
3. 事件与状态修复（文件版本判重、页面隐藏、PDF 页片段、锚点跳转）

理由：新能力改变渲染分支（增加表格视图与分页 UI），外观修复只是样式；混在一个提交里 diff 会大到无法审查。

### 决策 2：PDF `#page=` 是跨四个替换件的改动，单独成票

上游这条改动同时触及 FileViewer、TabBar、并依赖 `components/file-tab-state.ts`（基础层，与上游一致）。PowerI 侧需要同步修改 FileViewer、TabBar、以及 AppShell 传递 `initialPage` 的链路。

这不是 FileViewer 单文件工作，必须有独立的验收口径：从 Markdown 点链接 → 打开文件标签 → 跳到指定页 → 标签切换后仍在那一页。

### 决策 3：SettingsPanel 只接已存在的上游配置组件

SettingsPanel 的 7 条里：

- **MCP 4 条**合并为一个「MCP 分区」工作项。上游 `McpConfig` 已支持 `embedded` 模式，PowerI 只需加一个分区并供给 `cwd` / `trust` / `onTrustProject` 三个 props。不要复制 McpConfig。
- **发送键 1 条**：接 `useEnterSendMode`，并在 PowerI 自有的常规设置页加一个二选一控件。注意 PowerI 的设置页样式是自研的，**吸收逻辑开关、不移植上游样式**（沿用既有豁免口径）。
- **Code mode 1 条**：接 `lib/codemode-settings.ts`，走已有的 `/api/tools/settings`。
- **enabledModels 1 条**：注意 PowerI 已经复用上游 `ModelsConfig`，而该组件内部已包含 enabledModels 开关。本条待办的真实缺口需要先核实——可能是「开关已在，但未供给 controller」，而不是「需要新建面板」。

**这是本批里唯一需要先做勘察再动手的条目**，实现在开工前必须确认缺口到底是什么。

### 决策 4：TabBar 的终端标签部分不做

上游那条提交把「终端标签」与「无障碍（`role=tablist`/`aria-selected`/方向键导航）」打包在一起。PowerI 的 Tab 接口没有 `kind` 字段，结构上无法承载终端标签。

决定：**拆开处理**——无障碍部分移植（独立价值，且不依赖终端），终端标签部分保持 `pending` 并注明等待终端集成 spec。不得为了让命中率好看而强行塞入 `kind` 字段。

### 决策 5：MermaidBlock 与 FileViewer 共享 Prism 加载

两条 Prism 相关欠账（FileViewer 的按需加载、MermaidBlock 的懒加载）改动的是**同一个机制**（`usePrismLanguages` + `prism-languages`）。必须一起做，否则会出现「FileViewer 已按需、聊天里仍全量加载」的半吊子状态。

实现顺序：先做 MermaidBlock（它是聊天主路径，影响面大、验证快），再让 FileViewer 复用同一 hook。

### 决策 6：不新增任何基础层能力

本批**不允许**新增 `lib/` 或 `hooks/` 文件。如果移植过程中发现某个能力基础层没有，停下来汇报——那意味着该条欠账不属于第一批，应退回 `pending` 并重新评估。

理由：一旦开始往基础层加东西，这些文件就变成了「PowerI 修改的上游文件」，需要走例外登记，层边界开始腐化。

### 决策 7：每条关闭必须同时更新三处

一条欠账算关闭，需要三处一致：登记表（`ack --port`）、代码（替换件改动）、测试（接线断言或单测）。只改代码不改登记表，下一轮同步会重复提示；只改登记表不改代码，是最恶劣的情形。

## Testing Decisions

### 什么是好测试

只测外部可观察行为。对本批而言：

- ✅ CSV：给定带引号逗号与内嵌换行的输入，解析出的行列数与内容正确。
- ✅ 分页：给定文件大小与偏移，返回的块边界与 `truncated` 标志正确。
- ✅ 接线：替换件源码里确实 import 并渲染了上游叶子组件，且上游对照文件仍导出该符号（双向校验）。
- ✅ 版本判重：相同 `size`+`mtime` 判为未变化，任一不同判为变化。
- ❌ 不测：某个 state 变量叫什么、JSX 在第几行、样式数值、文案字符串。

### 三个测试缝，零新增

**缝 1 —— 纯函数单元测试（本批主力）**

本批的核心逻辑几乎都有现成落点，且上游已在这些文件里写了测试，必须复用同一批文件与风格：

| 逻辑 | 测试落点 | 状态 |
|---|---|---|
| CSV/TSV 解析、列宽、可见区 | `lib/delimited-table.test.mjs` | 上游已有，直接复用 |
| 分页块读取 | `lib/text-preview.test.mjs` | 上游已有 |
| Prism 加载 | `lib/prism-languages.test.mjs` | 上游已有 |
| 高亮预算 | `lib/highlight-queue.test.mjs` | 上游已有 |
| 文件版本判重 | `lib/file-version.test.mjs` | 上游已有 |
| 锚点跳转 | `lib/markdown-anchors` 相关 | 上游已有（`lib/markdown.ts` 内） |

这些测试**不需要新增**：它们测的是基础层函数，而基础层已经与上游一致。本批的职责是让替换件**真正调用**这些函数。这也是本批风险低的根本原因。

**缝 2 —— 接线断言**

`poweri/lib/replacement-wiring.test.mjs` 已存在，专治「能力在基础层、替换件没接线」。本批新增断言的范式（沿用文件内既有写法）：

```js
// 断言替换件确实使用了上游能力，并用上游对照文件做反向校验
assert.match(fileViewer, /isDelimitedTablePath/);
assert.match(fileViewer, /<DelimitedTable/);
assert.ok(upstreamViewer.includes("DelimitedTable"), "上游已移除该能力则本断言需同步修正");
```

每条"接线类"欠账关闭时往这个文件加一条，**不新建测试文件**。

**缝 3 —— 审计脚本**

`scripts/upstream-replacement-audit.mjs check` 是账目层。本批完成后，四个替换件的 `pending` 必须归零，`check` 通过。CI 已每周一 + 每次 push 触发。

### 不测什么

- 不新增 `/poweri` 路由的 e2e（用户已否决）。
- 不为替换件新建 props 契约测试文件（用户已否决）。
- 不对样式、文案、DOM 结构做断言。
- 不测 CSV 表格的像素级布局。

### 批次验收

本批算完成，需同时满足：

1. 四个替换件（FileViewer / SettingsPanel / TabBar / MermaidBlock）的 `pending` 归零。
2. 每条 `pending → ported` 的理由指向具体落地位置，且落地检测命中率 ≥60%。
3. 缝 2 有对应接线断言；相关纯函数复用上游测试且全绿。
4. `check` + typecheck + lint + test + `shell:test` 全绿。
5. 在真实页面上人工确认至少：CSV 变表格、大文件出现「加载更多」、设置里出现 MCP 分区、标签溢出可滚动。

## Out of Scope

- **`SessionSidebar`（19 条）与 `FileExplorer`（6 条）。** 侧栏相似度 19.3%，需产品决策后单独 spec。
- **`ChatWindow`（35）/ `AppShell`（22）/ `MessageView`（16）/ `ChatInput`（15）/ `MarkdownBody`（9）。** 共 97 条，属第二批，分批推进。
- **终端集成与终端标签。** 涉及新面板挂载与三处入口，单独 spec。TabBar 的 `kind` 字段明确不做。
- **78 条 `waived` 的复核。** 本批不翻案。
- **修改任何上游文件**（`components/`、`lib/`、`hooks/`、`app/api/`）。
- **新增基础层文件。**
- **`next build`、发布流程、版本号推进。**
- **Windows CI 的 79 项兼容债务。**

## Further Notes

### 与本批相关的既有豁免

登记表里这四个替换件已有 13 条 `waived`，移植时必须尊重，不得顺手"修好"：

- FileViewer 3 条：用户拍板抛弃的 1 条、PowerI 自研主题体系 1 条、无移动端布局 1 条。
- SettingsPanel 9 条：其中「吸收逻辑开关、不移植上游样式」是本批接发送键开关时的直接依据。
- MermaidBlock 1 条：PowerI 自研主题/字体体系。

### 一个必须显式指出的风险

`SettingsPanel` 的 enabledModels 那条欠账，登记表写的理由是"模型设置为自研面板，未采用上游 enabledModels 开关"，但实测 PowerI 已复用上游 `ModelsConfig`，而该组件内部含 enabledModels 开关。**登记表的这条理由可能已经过时。**

实现在开工该条前必须先确认：开关是真的没接线，还是早已可用只是没人更新账目。如果是后者，正确处置是 `ack --port` 并写明"上游组件已含，无需改动"，**不是**凭空造一个新面板。

### 票已拆好

20 张票见 [tickets.md](./tickets.md)，覆盖全部 23 个上游提交（25 条 pending）与 1 张收尾票。实测核对：审计脚本报告的 23 个 pending 提交与票清单**完全对齐，无遗漏无多余**。

拆分原则是「一条上游提交 = 一张票」，而**不是**按替换件切——因为 2 个提交跨替换件（`5e9b997d` PDF 跳页、`046bc67e` Prism 按需），按替换件切会把它们劈成两半，任一半单独合并都是半吊子状态。

例外只有两处有意合并：
- 4 条 MCP 提交（`8716e708`/`92489b77`/`eeda8624`/`ce615e7c`）合成 S01——它们是同一条能力链（列表→信任→添加→快捷入口），分开做只能验收半成品。
- 2 条 markdown href 提交（`5af2e04e`/`2cefb72f`）合成 F09——改的是同一个判定函数，只做其中一半行为不一致。

### 建议的提交粒度

按决策 1 与决策 2，本批至少拆成这些可独立验证的提交：

1. MermaidBlock：Prism 懒加载 + 主题背景 + 边框
2. FileViewer：Prism 按需（复用 MermaidBlock 的机制）
3. FileViewer：CSV/TSV 表格
4. FileViewer：大文件分页 + HTML 大文件预览
5. FileViewer：gutter 固定 + 代码字体 + 主题背景
6. FileViewer + TabBar + AppShell：PDF `#page=` 页片段
7. FileViewer + MarkdownBody：锚点跳转与桌面协议链接
8. TabBar：溢出滚动 + 36px + 无障碍
9. SettingsPanel：MCP 分区（4 条合并）
10. SettingsPanel：发送键 + Code mode + enabledModels 核实
11. 账目收尾：四个替换件 `ack --watermark` 推进

### 依赖顺序

Prism（提交 1、2）必须在 CSV 与分页之前完成，因为后两者的渲染分支会与高亮加载状态交互。其余提交相互独立，可并行。
