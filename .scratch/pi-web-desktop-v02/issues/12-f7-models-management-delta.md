# 12-f7-models-management-delta

Type: grilling
Status: resolved

## Question

模型管理增量的决策：

- 官方 ModelsConfig 已有：catalog 定价预设、上游模型发现、连接测试、scope 解析（lib/model-scope.ts）——先读 components/ModelsConfig.tsx + app/api/models-config/* 确认现状
- ct-jyjntc 的"角色 default/smol/plan"值不值得抄？增量清单是什么（UI 缺口？数据缺口？）
- 与 09 状态栏、11 统计面板的共享（模型选择器是否复用一个状态源）

决策输出：v0.2 模型管理增量清单（改动点级）。

## Answer（2026-08-16 用户逐问拍板）

**v0.2 模型管理增量清单（仅一项）**：

1. **补「默认模型」设置 UI**（官方缺口，已核实）：ModelsConfig 每个模型行加「设为默认」操作（写 settings.json defaultModel——rpc-manager.ts:1634 已读此字段，只需写入口）+ 默认模型在列表顶部标「默认」徽章；新建会话预选逻辑（ChatWindow getDefaultModel 预选）不变
2. **不做 default/smol/plan 角色体系**：消费方（smol→提交信息、plan→冲突解决，ct 的 utility model 服务端自调 LLM）全在 16 GitPanel 的 AI 功能里；官方 default 角色已够 v0.2 日常。角色框架等 16 定完后评估，v0.2 不建
3. **状态源共享**：模型选择器继续用官方现有状态（AppShell/ChatWindow newSessionModel + ModelsConfig 内模型列表）；09 状态栏/11 统计各自独立数据源（get_session_stats/JSONL），无共享冲突

**官方现状盘点**（已核实）：ModelsConfig 2296 行已有 catalog 定价预设、上游模型发现（/api/models-config/discover）、连接测试（/api/models-config/test）、scope 解析（lib/model-scope.ts）——这些全部保留，无缺口；唯一 UI 缺口=默认模型设置。
