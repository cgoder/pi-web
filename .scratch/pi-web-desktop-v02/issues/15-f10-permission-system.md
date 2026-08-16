# 15-f10-permission-system

Type: grilling
Status: resolved
Blocked by: 01

## Question

权限系统的决策（官方仅有信任确认 ProjectTrustDialog + 工具预设）：

- Agent modes + allow/ask/deny/YOLO 如何映射到 pi 现有能力（见 01：--approve 等价物、工具 allow-list、预设 PRESET_*，读 lib/tool-presets.ts）
- UI 形态：每工具 / 每项目 / 全局？设置入口？会话中拒绝/允许的交互流？
- 默认策略（不配置时行为）

决策输出：v0.2 权限系统规格（模式集 + UI + 默认策略）。

## Answer（2026-08-16 用户拍板：核心与 UI 层都走 pi 生态）

**v0.2 权限系统：不内置、不自研——核心扩展 + UI 层全部走 pi 生态。**

1. **核心方案**：安装 **`pi-permission-system`**（gotgenes/pi-packages，已核实生态成熟）——集中权限系统：allow/deny/ask 三态规则（工具/bash/MCP/特殊操作）、**YOLO mode 内置**（ask→allow 重写且**保留硬 deny**、origin:yolo 审计记录）、权限审查日志、`/permission-system` 命令打开配置模态；另有 pi-permission-gate / pi-guard（AST bash 解析）/ @pi-lab/permissions 等备选
2. **UI 层**：同样走 pi 生态——扩展自带配置模态（config-modal），经 pi-web 官方扩展 UI 通道（ExtensionWidgets / extension_ui_request，官方已支持）呈现；**不自做策略面板、不做 composer 模式菜单**（YOLO 切换用扩展自带 `/permission-system` 命令）
3. **运行时 ask 交互**：扩展经 ask_user_question 工具触发——官方 pi-web 无 AskUserCard（已核实 grep 无命中），v0.2 先按官方 toolCall 卡片展示（工具名+input）；若交互流不通，补最小 AskUserCard（照 ct components/message/AskUserCard.tsx，实现期验证后决定）
4. **默认策略**：不配置时遵循扩展默认（deny-by-default / ask 语义，以 pi-permission-system 文档为准）；官方项目信任（ProjectTrustDialog + trust.json）与工具预设 PRESET_* 保留不动，与扩展并存（信任管项目资源加载，扩展管逐工具调用）
5. **v0.2 工作项**：安装/文档指引 + 实现期验证 ask 问卷交互流（可能的最小 AskUserCard）

**对照**：ct 的三层模型（ask/auto/plan/yolo 模式 + base/effective 双层策略文件 + 扩展执行）已被生态包覆盖（YOLO/策略/审计齐全），自研出局。
