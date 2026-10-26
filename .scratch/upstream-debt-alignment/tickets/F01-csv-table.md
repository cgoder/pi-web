---
title: F01 CSV/TSV 渲染为表格
status: done
triage: ready-for-agent
upstream-commit: f87afbbe
blocked-by: F05（Prism 按需）——表格视图与高亮加载状态共用同一渲染分支
---

# F01 CSV/TSV 渲染为表格

上游提交：f87afbbe · feat(files): show CSV/TSV files as a table in the file viewer (#1150)
涉及文件：poweri/components/FileViewer.tsx
阻塞：F05（Prism 按需）——表格视图与高亮加载状态共用同一渲染分支

## 问题

用户点开 \`.csv\` / \`.tsv\` 看到的是逗号分隔的原始文本，要读懂必须切到表格软件。

## 目标

CSV/TSV 默认以表格呈现，并可切回源码视图。

## 现状勘察

能力已在基础层且与上游一致：

- \`lib/delimited-table.ts\` —— \`isDelimitedTablePath\`、\`parseDelimitedTable\`、\`measureColumnWidths\`、\`visibleRowRange\`、\`MIN_COLUMN_WIDTH\` / \`MAX_COLUMN_WIDTH\`
- \`components/DelimitedTable.tsx\` —— 已存在，导出 \`DelimitedTable\`，**属上游叶子组件，直接 import，禁止复制**

PowerI 替换件里这些符号出现次数为 **0**。

## 要做的事

1. 按文件扩展名判定是否为分隔符表格。
2. 表格视图复用上游 \`DelimitedTable\`，传入解析结果与列宽。
3. 表格与源码视图之间可切换（沿用现有 display mode 机制，不自造第二套）。
4. 表格视图下不要触发语法高亮加载。

## 验收

- [ ] \`.csv\` / \`.tsv\` 默认显示表格
- [ ] 带引号的逗号与内嵌换行不会错列
- [ ] 超宽表格可横向滚动，列宽在上下限之间自适应
- [ ] 可切回源码视图
- [ ] 缝 2 断言：替换件 import 了 DelimitedTable 与 isDelimitedTablePath，且上游对照文件仍在用它们
- [ ] 缝 1：复用 \`lib/delimited-table.test.mjs\`（上游已有），不新建测试文件

## 备注

这是本批**性价比最高**的一条：上游叶子组件现成，主要成本在渲染分支接线。
