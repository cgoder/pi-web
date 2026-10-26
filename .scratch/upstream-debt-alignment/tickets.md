# 第一批 tickets 索引

Parent spec: [batch-1-low-risk-replacements.md](./batch-1-low-risk-replacements.md) · [上游欠账对齐 README](./README.md)

策略：**一条上游提交 = 一张票**，不按替换件切。25 条 pending 去重后是 23 个上游提交，其中 4 条 MCP 提交合成一票（同一条能力链，分开做只能验收半成品），最终 **20 张票**（19 张提交票覆盖 23 个提交 + 1 张收尾票 X01）。

## 为什么不按替换件切

25 条欠账去重后是 23 个上游提交，其中 2 个跨替换件（另 2 个上游提交被 TabBar 与 FileViewer 共享，但不跨票）：

- `5e9b997d` PDF `#page=` —— 同时要改 FileViewer 与 TabBar，还依赖 AppShell 传递链路
- `046bc67e` Prism 按需加载 —— 同时要改 FileViewer 与 MermaidBlock

按替换件切会把这两条**劈成两半**，任一半单独合并都是半吊子状态（Prism 只按需了一半、PDF 只跳了一半）。按提交切天然保证原子性。

## 执行顺序（依赖关系）

```
F05 Prism 按需 ──┬──> F01 CSV 表格
                 ├──> F02 大文件分页
                 └──> F03 HTML 大文件
F06 gutter/字体 ──> （独立）
F07 主题背景   ──> （独立）
F08 PDF #page  ──> （依赖 F01-F03 的渲染分支稳定）
F09 锚点跳转   ──> （独立）
T01 溢出滚动   ──> （独立）
T02 无障碍     ──> （独立）
S01 MCP 分区   ──> （独立）
S02 发送键     ──> （独立）
S03 Code mode  ──> （独立）
S04 enabledModels ─> 先勘察，可能无需改动
```

## 票清单

| 票 | 上游提交 | 替换件 | 一句话 |
|---|---|---|---|
| [F05](./tickets/F05-prism-on-demand.md) | `046bc67e` | MermaidBlock + FileViewer | Prism 语言按需加载 |
| [F01](./tickets/F01-csv-table.md) | `f87afbbe` | FileViewer | CSV/TSV 渲染为表格 |
| [F02](./tickets/F02-text-pagination.md) | `0e712013` | FileViewer | 大文件分页与加载更多 |
| [F03](./tickets/F03-html-large-preview.md) | `93b3aba5` | FileViewer | 超 256KB HTML 仍可预览 |
| [F06](./tickets/F06-gutter-and-font.md) | `c713fcaa` | FileViewer | 行号栏固定 + 代码字体 |
| [F07](./tickets/F07-theme-background.md) | `9da54e12` | FileViewer | 主题切换时代码背景 |
| [F08](./tickets/F08-pdf-page-fragment.md) | `5e9b997d` | FileViewer + TabBar | PDF `#page=` 跳页 |
| [F09](./tickets/F09-markdown-anchors.md) | `5af2e04e`、`2cefb72f` | FileViewer + MarkdownBody | 站内锚点 + 桌面协议链接 |
| [F10](./tickets/F10-file-version-and-hidden.md) | `70b2947c` | FileViewer | 版本判重 + 隐藏页释放 |
| [T01](./tickets/T01-tab-overflow.md) | `bf0730c1` | TabBar | 标签溢出不裁切 |
| [T02](./tickets/T02-tab-height-wheel-a11y.md) | `f4adfd04` | TabBar | 36px 高度 + 滚轮滚动 |
| [T03](./tickets/T03-tab-a11y-split.md) | `9290c272` | TabBar | 无障碍部分（终端标签不做） |
| [M01](./tickets/M01-code-block-border.md) | `cfcf2a1a` | MermaidBlock | 浅色主题去掉双重边框 |
| [M02](./tickets/M02-code-bg-theme.md) | `e2ea7da3` | MermaidBlock | 主题切换保留代码背景 |
| [M03](./tickets/M03-deferred-highlight.md) | `b2b6a45b` | MermaidBlock | 高亮预算与延迟高亮 |
| [S01](./tickets/S01-mcp-settings.md) | `8716e708` `92489b77` `eeda8624` `ce615e7c` | SettingsPanel | MCP 分区（4 条合并） |
| [S02](./tickets/S02-send-key.md) | `5df8278a` | SettingsPanel | 发送键切换 |
| [S03](./tickets/S03-codemode-settings.md) | `1c387b47` | SettingsPanel | Code mode 工具设置 |
| [S04](./tickets/S04-enabled-models.md) | `50f6cce9` | SettingsPanel | enabledModels 开关（先勘察） |
| [X01](./tickets/X01-close-batch.md) | — | 四个 | 账目收尾与水位推进 |

