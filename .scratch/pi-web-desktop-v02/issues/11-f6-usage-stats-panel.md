# 11-f6-usage-stats-panel

Type: grilling
Status: open
Blocked by: 01

## Question

使用统计面板的决策：

- 展示哪些指标：token / cost / 上下文（数据源可用性见 01；官方 stats 数据在哪，读 lib/ 确认）
- 统计范围：会话级 / 项目级 / 全局？时间维度（本次/今日/累计）？
- UI 形态与入口：右分屏 tab？状态栏详情？独立页面？
- 数据存储：本地计算（~/.pi/agent 文件）vs 服务端聚合，隐私

决策输出：v0.2 统计面板规格。
