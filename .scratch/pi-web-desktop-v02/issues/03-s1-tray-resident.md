# 03-s1-tray-resident

Type: grilling
Status: open
Blocked by: 02

## Question

托盘常驻的行为决策（解决"关窗断 agent"痛点，PiDeck 默认关窗最小化到托盘）：

- 关窗动作：最小化到托盘 vs 直接退出？是否设开关？
- 托盘菜单项：显示/隐藏窗口、重启服务、升级、退出？
- 托盘图标态：agent 运行中是否有状态点？（数据源：/api/agent/running）
- 与现有"退出时杀进程组"逻辑的关系：常驻后关窗不杀，托盘退出才杀？

决策输出：v0.2 托盘行为的完整规格（Tauri tray + 关窗语义 + 菜单清单）。
