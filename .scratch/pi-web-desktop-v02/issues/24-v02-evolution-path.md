---
title: v0.2 演进路径——从 v0.1.8 到分层架构
status: ready-for-agent
type: spec
---

# v0.2 演进路径——从 v0.1.8 到分层架构

> 基于 Plan agent 的代码盘点结果（2026-08-19）。
> 关联：[ADR-0002 分层架构](../docs/adr/0002-layered-architecture.md)、[v0.2 spec](../docs/desktop/v02-spec.md)

## 关键发现

**desktop 分支的 `components/` 目录与上游 main 分支完全一致**——`git diff main..desktop -- components/` 返回空。PowerI v0.1.8 没有修改任何 pi-web UI 代码。

这意味着：**迁移是纯增量的，不是重构**。不需要"提取"或"分离"任何代码，只需在 `poweri/` 目录中构建新的产品层。

## 演进路径（跳过 Phase 2 壳层增强）

### Phase 1：基础设施（Week 1）

| 任务 | 产出 | 验收标准 |
|------|------|----------|
| 创建 `poweri/` 目录结构 | `poweri/layout/`、`poweri/features/`、`poweri/contract.ts` | 目录存在，contract.ts 可运行 |
| 合约验证机制 | `poweri/contract.ts` 检查基础层关键接口 | CI 构建时自动运行，失败时阻断 |
| **第一个小功能验证** | 文件路径点击预览（见下文） | 在 chat 消息中点击 `path/to/file.md` 可打开预览 |

### Phase 3：PowerI AppShell（Week 3-4）

| 任务 | 产出 | 验收标准 |
|------|------|----------|
| PowerI AppShell（包装式） | `poweri/layout/AppShell.tsx` re-export 上游 AppShell | 功能与原版一致 |
| 活动栏容器 | 上游 AppShell 作为中心内容，外层包裹活动栏 | 活动栏可显示/隐藏 |
| 环境检测切换 | Tauri 环境下使用 PowerI AppShell | 桌面版走新路径，浏览器版走原版 |

### Phase 4：功能增量（Week 4-8）

| 任务 | 产出 | 难度 | 依赖 |
|------|------|------|------|
| F3 状态栏 | `poweri/features/StatusBar.tsx` | 低 | Phase 3 |
| F1 活动栏 | `poweri/layout/ActivityBar.tsx`（替换包装为真实布局） | 中 | Phase 3 |
| F6 统计面板 | `poweri/features/StatsPanel.tsx` + `/api/usage` | 中 | Phase 3 |
| F2 轨迹面板 | `poweri/features/TrajectoryPanel.tsx`（vendor ~4600 行） | 高 | Phase 3 |
| F11 Git 面板 | `poweri/features/GitPanel.tsx` + `/api/git/*` | 中 | Phase 3 |

## 第一个小功能：文件路径点击预览

**目标**：在 chat 消息中看到 `docs/desktop/v02-spec.md` 这样的文件路径时，点击可直接打开预览。

**实现方案**：
- `poweri/lib/file-path-detection.ts`：`looksLikeFilePath()` 检测函数（要求扩展名以字母开头，拒绝版本号/IP/CLI 参数/URL）
- `poweri/components/MarkdownBody.tsx`：包装基础层 MarkdownBody，预处理时将 inline code 中的文件路径转换为 markdown 链接
- `poweri/styles/file-link.css`：链接样式（↗ 指示 + hover accent 高亮）
- 复用基础层的 `resolveLocalFileHref` → `onOpenFile` → `AppShell.handleOpenLinkedFile` 调用链

**验证结果（2026-08-19，临时冒烟验证）**：
- 临时将 `components/MessageView.tsx` 的 MarkdownBody import 指向 poweri 版，本地跑通
- ✅ 点击 `components/MarkdownBody.tsx` 打开右侧文件预览（103 lines，实时同步）
- ✅ 非路径 inline code（`v0.2`、`--version`）不会被误链接
- 验证完成后已 revert 临时修改，基础层零改动

**关键发现——接入 gap**：纯包装组件无调用点（渲染链 AppShell→ChatWindow→MessageView 硬编码 import），
正式接入必须走 Phase 3 受控 fork 路径（复制渲染链到 poweri/ 并在副本中替换 import）。

## 风险与缓解

| 风险 | 严重度 | 缓解措施 |
|------|--------|----------|
| 上游 AppShell 在 v0.2 开发期间变化 | 中 | 合约验证 + 定期 merge |
| React 19 与 ui-trajectory vendor 不兼容 | 中 | 早期冒烟测试 |
| 文件路径检测误判（把普通文本识别为路径） | 低 | 要求文件扩展名 + `looksLikeRelativeFileHref` 门控 |

## 参考

- [Plan agent 分析报告](../../temp/research/migration-analysis.md)（待补充）
- [ADR-0002 分层架构](../docs/adr/0002-layered-architecture.md)
- [v0.2 spec](../docs/desktop/v02-spec.md)
