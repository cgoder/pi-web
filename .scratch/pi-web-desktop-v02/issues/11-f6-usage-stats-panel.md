# 11-f6-usage-stats-panel

Type: grilling
Status: resolved
Blocked by: 01

## Question

使用统计面板的决策：

- 展示哪些指标：token / cost / 上下文（数据源可用性见 01；官方 stats 数据在哪，读 lib/ 确认）
- 统计范围：会话级 / 项目级 / 全局？时间维度（本次/今日/累计）？
- UI 形态与入口：右分屏 tab？状态栏详情？独立页面？
- 数据存储：本地计算（~/.pi/agent 文件）vs 服务端聚合，隐私

决策输出：v0.2 统计面板规格。

## Answer（2026-08-16 用户逐问拍板）

**v0.2 统计面板规格**：

1. **cost 策略**：**全局/项目级不做 cost**——会话级 cost 现成（get_session_stats，官方 topbar 已在显示）；全局聚合算不出（session 文件无价格信息，02 确认）；不做自建快照存储
2. **范围与维度**：**ct-jyjntc 全套全局统计**——总量（tokens/会话数/消息数/活跃天数）+ 连续天数 streak + 模型占比 + 趋势柱状图（7-365 天可调，按模型分段着色）+ 26 周热力图；不做项目级维度（v0.2）
3. **数据来源**：**JSONL 流式解析 + 缓存**——服务端 `GET /api/usage`：逐行 substring 提取 timestamp/role/usage.totalTokens/model（不整行 JSON.parse）+ 按 size:mtime 签名只重解析变更文件 + soft 45s / hard 15min TTL + agent_end 后前端 debounce 失效刷新（ct-jyjntc 全套实现：app/api/usage/route.ts、components/UsagePanel.tsx，实测可用）
4. **入口与形态**：**活动栏「统计」面板**（07 已定图标集含统计）——面板内顶部聚合卡 + 趋势图 + 热力图 + 模型占比；会话级统计不走此面板（官方 topbar 按钮已覆盖）

**实现要点**：照 ct-jyjntc 移植 `app/api/usage/route.ts`（适配本仓库 session 目录路径 ~/.pi/agent/sessions 与 API 风格）+ `components/UsagePanel.tsx`（活动栏面板容器内）；图表用轻量自绘或引入现有依赖；与 09 状态栏数据互补（09 会话级、11 全局）。
