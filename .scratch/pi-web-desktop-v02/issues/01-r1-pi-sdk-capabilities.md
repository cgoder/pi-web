# 01-r1-pi-sdk-capabilities

Type: research
Status: claimed

## Question

pi SDK（`@earendil-works/pi-coding-agent`，本机 npm 缓存内附 docs/）能力盘点，回答四个事实：

1. **统计**：token / cost / 上下文数据是否可获取？（stats API？SessionContext 字段？ModelRuntime？）
2. **MCP**：MCP servers（stdio/HTTP）是否原生支持？配置入口在哪？
3. **权限**：信任/权限模型现状（allow/ask/deny、工具 allow-list、--approve 等价物、有无 YOLO/模式概念；官方 pi-web 的 ProjectTrustDialog 背后接的什么）
4. **plan 模式**：pi 是否有 plan / research 模式钩子可挂 UI（feature-borrowing-matrix 里"先查 pi-web 有无 plan 钩子"）

产出：`docs/desktop/pi-sdk-capabilities-research.md`，逐条给来源（文档路径/源码行）。此工单解锁 09/11/14/15 的决策。
