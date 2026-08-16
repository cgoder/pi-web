# 09-f3-status-bar

Type: grilling
Status: open
Blocked by: 01

## Question

常驻状态栏的决策：

- 展示哪些信息：模型/思考等级/上下文/缓存…（哪些数据源可用，见 01 的 SDK 盘点；官方 /api/agent/[id] state 有哪些字段，先读 lib/rpc-manager.ts）
- 放哪：壳 topbar vs fork 内 UI 底部？（架构是单 fork 深改，两者都可行——壳 topbar 只能轮询 /api，fork 内可直接订阅状态）
- 更新频率、点击交互（弹出详情面板？）

决策输出：v0.2 状态栏规格。
