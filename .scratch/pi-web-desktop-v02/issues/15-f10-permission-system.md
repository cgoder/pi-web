# 15-f10-permission-system

Type: grilling
Status: open
Blocked by: 01

## Question

权限系统的决策（官方仅有信任确认 ProjectTrustDialog + 工具预设）：

- Agent modes + allow/ask/deny/YOLO 如何映射到 pi 现有能力（见 01：--approve 等价物、工具 allow-list、预设 PRESET_*，读 lib/tool-presets.ts）
- UI 形态：每工具 / 每项目 / 全局？设置入口？会话中拒绝/允许的交互流？
- 默认策略（不配置时行为）

决策输出：v0.2 权限系统规格（模式集 + UI + 默认策略）。
