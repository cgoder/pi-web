# 28-topbar-reorg-and-stats-entry

Type: feat
Status: backlog
Blocked by: 0.8.10 正式版合并（见 docs/desktop/upstream-0.8.10-beta-impact.md 第五节）
ADR: docs/adr/0003-topbar-information-architecture.md
原型蓝本: prototype/topbar-nav 分支（c6937ef，?variant= 结构对比，拍板 v1）

## Scope

合并 0.8.10 后的顶栏重组（与 SettingsPanel 接入同轮 AppShell 重放，避免二次 fork 重同步）：

1. **统计入口 v1 落地**：右上角文件 toggle 左侧新增统计图标按钮；点击开右面板 stats 视图、再点收起；与 ☰/files 跨面板互斥；激活态 = bg-selected + 顶部 accent 条。移动端入口进既有 more 工具条。
2. **撤除活动栏**：删除 `poweri/features/ActivityBar.tsx` 渲染与 `rightPanelMode` 相关的 variant 遗留；sessions 入口收敛到左上 ☰。
3. **theme/language 撤离顶栏**：删除 `renderThemeButton`/`renderLanguageButton` 的顶栏渲染（含 mobile toolbar），功能由上游 SettingsPanel.general 承接。注意 fork 重放时这两处不再从上游搬运。
4. **system → 项目上下文文件入口**：聚合 AGENTS.md（pi 原生）+ SYSTEM-PROMPT.md / SOUL.md / ROLE.md（PowerI 约定，经 onSystemPromptChange 管道生效）；文件不存在时引导创建。
5. **agents 面板**：上游 beta 新增的顶栏 AgentSessionPanel，随重放保留。

## 验收

- [ ] 顶栏入口收敛为：☰ / history*(待 F2) / auto-name / branch / system(上下文文件) / agents / 会话信息 / files / stats，无 theme/language
- [ ] 统计互斥行为与 ADR-0003 §1 一致（点已激活=收起）
- [ ] 移动端 more 工具条含统计入口，活动栏不渲染
- [ ] i18n key 全覆盖（原型阶段硬编码中文需替换）
- [ ] typecheck + lint + 现有测试绿

## Notes

- contextUsage 圆环形态（v3）暂缓：数据仅活跃会话可得；上游开放历史会话 getContextUsage 后可复活，入口位置不变。
- F2 家族轨迹落地后吸收"完整历史"导出场景，届时移除 history 按钮。
