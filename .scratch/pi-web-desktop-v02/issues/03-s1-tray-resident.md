# 03-s1-tray-resident

Type: grilling
Status: resolved
Blocked by: 02

## Question

托盘常驻的行为决策（解决"关窗断 agent"痛点，PiDeck 默认关窗最小化到托盘）：

- 关窗动作：最小化到托盘 vs 直接退出？是否设开关？
- 托盘菜单项：显示/隐藏窗口、重启服务、升级、退出？
- 托盘图标态：agent 运行中是否有状态点？（数据源：/api/agent/running）
- 与现有"退出时杀进程组"逻辑的关系：常驻后关窗不杀，托盘退出才杀？

决策输出：v0.2 托盘行为的完整规格（Tauri tray + 关窗语义 + 菜单清单）。

## Answer（2026-08-16 用户逐问拍板）

**v0.2 托盘行为规格**：

1. **关窗语义**：`CloseRequested` → `prevent_default()` + `hide()`（**固定最小化到托盘，无设置开关**，退出只走托盘菜单）——解决「关窗杀 agent」痛点
2. **托盘菜单（三项）**：① 显示窗口（show + set_focus，最小化时先 unminimize）② 重启服务（调现有 `restart_server` 命令）③ 退出（置 is_quitting → exit）——**升级不入口**，保留现有 UI 内升级按钮（避免双入口状态不同步）
3. **图标态**：**静态图标**（恒定不变，无运行状态点、无轮询）；tooltip 随现有 server:ready/exited/stopped 事件更新（壳侧已有事件流，零新增轮询）
4. **退出链路**：全局 `is_quitting` 标志（PiDeck 模式防关窗/退出竞态）——托盘「退出」置标志 → `exit(0)` → `RunEvent::Exit` → 现有 `kill_process_group` 杀服务进程组（现有逻辑不动）；关窗（隐藏）不触发 Exit，服务继续跑

**实现要点**：Cargo.toml 加 `tauri` feature `tray-icon`；托盘构建用现有 icons 资源（16x16 png）；`on_window_event` 改 `CloseRequested` 分支（现有 `window.app_handle().exit(0)` 改为 hide）；`.run` 闭包里 Exit 处理不变。与 04 单实例的联动（第二实例唤起托盘窗口）随 04 决策。
