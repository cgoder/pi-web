# PowerI v0.2.0 Specification

## 1. 概述与设计理念

PowerI v0.2.0 是 PowerI 产品层的一次核心重构与能力升级：
1. **以人为本与纯粹心智**：
   - 彻底移除 `ActivityBar`，释放横向工作区空间。
   - 统计与用量对账（`Usage & Costs`）纳入统一设置中心（`SettingsPanel`），保持高频聊天与文件视口清爽。
2. **能力即开关（Skills Registry & Toggle）**：
   - 不搞人工割裂分类，统一技能聚合流。
   - 预置默认 Skills 仓库源（LITTA 官方技能库，可修改 URL/Token/别名）。
   - 用户可自由添加更多仓库源（GitLab / GitHub / Manifest URL）并指定别名。
   - 顶部仓库胶囊栏快速过滤与参数编辑。
   - 交互仅为“开启/关闭”，默认全局生效（Global），静默拉取与同步。
3. **原生无侵入 LITTA BYOK Provider**：
   - 严格遵循上游 Models 设置页的 UI 与交互逻辑。
   - 在 `Add provider` 弹窗菜单中，`CUSTOM` 分区置于首位，**LITTA** 作为 `CUSTOM` 分区的第一个首选项。
   - 图标使用应用默认图标，默认预置根地址 `https://llms.litta.cn/`。
   - 用户只需填写 Key，支持一键动态拉取模型列表，全量模型自动可选并补全上下文与 Reasoning 属性。

## 2. 架构设计与无侵入分层

- **红线约束**：绝不修改上游 `components/ModelsConfig.tsx` 或任何上游文件。
- **产品层派生**：
  - `poweri/features/skills/SkillsMarketView.tsx`：实现变体 A（顶部仓库胶囊栏 + 统一卡片流）。
  - `poweri/features/models/PowerIModelsConfig.tsx`：在 `AddProviderPicker` 的 `CUSTOM` 分区首位注入 LITTA 预置项，点击快速创建并选定。
  - `poweri/lib/skill-subscriptions.ts`：管理多仓库源配置与技能聚合元数据。
  - `poweri/lib/litta-provider.ts`：处理 LITTA 的默认配置、模型拉取与元数据丰富。

## 3. Tracer-Bullet Tickets 规划

- **Issue 01**: 技能仓库源多源管理与顶部胶囊栏 (Variant A)
- **Issue 02**: LITTA Provider 作为 Add Provider 菜单 CUSTOM 首选项
- **Issue 03**: 全量模型发现与元数据智能补齐
- **Issue 04**: 整体集成测试与质量验证
