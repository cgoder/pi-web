# 12-f7-models-management-delta

Type: grilling
Status: open

## Question

模型管理增量的决策：

- 官方 ModelsConfig 已有：catalog 定价预设、上游模型发现、连接测试、scope 解析（lib/model-scope.ts）——先读 components/ModelsConfig.tsx + app/api/models-config/* 确认现状
- ct-jyjntc 的"角色 default/smol/plan"值不值得抄？增量清单是什么（UI 缺口？数据缺口？）
- 与 09 状态栏、11 统计面板的共享（模型选择器是否复用一个状态源）

决策输出：v0.2 模型管理增量清单（改动点级）。
