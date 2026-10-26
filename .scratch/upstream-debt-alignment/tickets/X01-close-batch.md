---
title: X01 批次收尾：账目推进与验收
status: done
triage: ready-for-agent
upstream-commit: —
blocked-by: 全部 F/T/M/S 票
---

# X01 批次收尾：账目推进与验收

上游提交：— · —
涉及文件：docs/desktop/replacements.json
阻塞：全部 F/T/M/S 票

## 目标

把第一批 25 条欠账在账目上正式关闭，并留下可复核的验收记录。

## 要做的事

1. 逐个检查四个替换件的 pending 是否已清空。
2. 对每条关闭的条目确认处置理由指向具体落地位置（不是"已对齐"这种笼统措辞）。
3. 逐替换件执行 \`ack --watermark e533d9b3975f\` 推进水位（此时脚本会校验区间内无遗漏）。
4. 跑 check、typecheck、lint、npm test、shell:test。
5. 记录本批的实际工作量与遇到的问题，写进父 spec 的 Further Notes，供第二批估算。

## 验收

- [ ] FileViewer / SettingsPanel / TabBar / MermaidBlock 四个替换件 pending 归零
- [ ] 每条 ported 理由可定位到代码
- [ ] watermark 经 ack 正规推进，watermarkProvenance 已写入
- [ ] check + typecheck + lint + test + shell:test 全绿
- [ ] 人工确认：CSV 变表格、大文件有「加载更多」、设置里有 MCP 分区、标签溢出可滚动、PDF 链接跳页
- [ ] 父 spec 的 Further Notes 记录本批实际耗时与偏差

## 备注

**不要手写 watermark**——脚本会用 watermarkProvenance 校验，手写会让审计区间变成空区间而永远通过，这是 traps.md 里明确记录的陷阱。

## 实际结论

### 账目

| 替换件 | pending（前 → 后） | 备注 |
|---|---|---|
| FileViewer.tsx | 10 → **0** | 9da54e12 的缺失一半在收尾时补齐（见 F07「收尾时的修复」） |
| SettingsPanel.tsx | 7 → 0 | 50f6cce9 / 1c387b47 的理由按 handoff 更正（见 S04 / S03） |
| TabBar.tsx | 4 → 0 | 9290c272 只落无障碍一半，终端侧仍 pending 于 AppShell |
| MermaidBlock.tsx | 4 → 0 | |
| MarkdownBody.tsx | 9 → 7 | 顺带核出 5e9b997d 其实已落地，单独关闭；其余 7 条属第二批不动 |

总计 pending **147 → 120**，ported **79 → 106**，waived 78 不变。

### 与验收清单的偏差（必须记录）

- [x] FileViewer / SettingsPanel / TabBar / MermaidBlock 四个替换件 pending 全部归零。
  FileViewer 的 `9da54e1213b6` 一开始被判为"只移植一半"（另一半缺失会让深色→浅色切换后源码视图背景丢失），
  经负责人复核确认是**净回归**后授权修复：补上 `fileViewerDarkTheme`，并加了撤掉修复就变红的负向验证断言。
  **这件事的教训要记进第二批**：登记表里的 `--port` 一旦写下就没人再查，`a6763776` 当初正是不该被算作落地。
- [x] 每条 ported 理由都指向具体行号/符号，见 `docs/desktop/replacements.json`。
- [x] watermark 四个替换件均经 `ack --watermark e533d9b3975f` 正规推进，`watermarkProvenance` 已写入。
- [ ] 人工确认五件事（CSV 变表格 / 加载更多 / MCP 分区 / 标签溢出可滚动 / PDF 跳页）——本票只做了自动化验证。
  另需人工确认：**源码视图在深/浅主题之间来回切换后背景仍在**（本批修的就是这条）。
- [ ] 父 spec 的 Further Notes 尚未写（留给下一轮）。

### 接线断言

`poweri/lib/replacement-wiring.test.mjs` 从 7 条扩到 27 条：新增 20 条覆盖本批全部票，
每条断言的消息里写"为什么"（不满足会坏在哪），并对上游对照文件加镜像断言——
上游把能力删改时测试先红，而不是静默通过。
