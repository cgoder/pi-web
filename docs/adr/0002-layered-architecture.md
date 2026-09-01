# ADR-0002: 分层架构——PowerI 产品层与 pi-web 基础层分离

## 状态

已接受（2026-08-19）

## 背景

PowerI 的初始设计目标是"在 pi-web 基础上叠加桌面特有功能"。v0.2 的功能清单（活动栏、轨迹面板、Git 面板、统计面板、状态栏）需要深度修改 pi-web 的 UI 层。

研究 Minke（DeepSeek Harness 桌面应用）的架构后发现：Minke 通过 Cordis 插件系统实现了"不修改上游 DSH 源码，通过 overlay 叠加产品功能"。但 pi-web 没有 Cordis 那样的 slot 系统——它的扩展 UI 协议是 ANSI 纯文本桥接，从根本上不支持富 React 组件注入。

进一步研究发现：pi-web 的 API 层已经是一个完整的 headless 后端（37 个路由，覆盖会话/模型/文件/认证/技能/插件等），`lib/` 层是一个与 UI 无关的客户端 SDK（agent-client、SSE 连接管理、streaming reducer 等）。这意味着 PowerI 可以复用这些基础层，只重写 UI 编排层。

## 决策

采用**分层架构 + 受控 fork**，在 desktop 分支中建立显式的层边界：

### 1. 两层结构

```
┌─────────────────────────────────────────────────────────────┐
│  PowerI 产品层（poweri/）                                    │
│  ├── poweri/layout/      活动栏布局、面板编排                │
│  ├── poweri/features/    轨迹、Git 面板、统计、状态栏        │
│  ├── poweri/shell/       Tauri 壳 UI（已有 shell/）          │
│  └── poweri/contract.ts  合约验证（关键接口检查）            │
│                                                             │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ 层 边 界 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│                                                             │
│  基础层（pi-web 原有代码，跟随上游合并）                     │
│  ├── lib/          客户端 SDK（~9600 行，UI 无关）            │
│  ├── hooks/        状态 hooks（useAgentSession 等）           │
│  ├── components/   基础渲染组件（MarkdownBody 等）            │
│  └── app/api/      Next.js API 路由（37 个）                 │
└─────────────────────────────────────────────────────────────┘
```

### 2. 层边界规则

**基础层 = pi-web 上游 + 最小适配修改**
- `lib/` 全部、`hooks/` 全部、`app/api/` 全部 → 跟随上游合并，尽量不改
- `components/MarkdownBody`、`MermaidBlock`、`FileExplorer` → 低耦合组件，跟随上游
- 上游合并时：这些文件以"上游为准，重放增量"

**PowerI 产品层 = 自有代码，集中在新目录**
- `poweri/` 是新目录，放所有 PowerI 特有的布局和组件
- **不修改基础层的 `AppShell.tsx`，而是替换它**——PowerI 有自己的 AppShell
- 复用基础层的 `lib/`、`hooks/`、`MarkdownBody` 等

**合约验证 = 每次构建检查边界**
- 检查基础层的关键文件/接口是否存在
- 检查 PowerI 依赖的 `lib/` 导出是否变了
- 上游合并后如果合约失败，需要人工适配

### 3. 替换 AppShell，而非修改它

这是整个方案的核心——

```
当前做法（修改式）：
  components/AppShell.tsx（2275 行）
  ├── 直接修改布局结构
  ├── 加入活动栏代码
  ├── 加入状态栏代码
  └── 上游合并时冲突遍地

Minke 做法（替换式）：
  DSH 的 AppShell 不动
  Minke overlay 通过 slot 注入自己的布局
  上游合并时零冲突

PowerI 做法（因为没有 Cordis slot，所以是）：
  基础层保留原始 AppShell.tsx（不动，跟随上游）
  PowerI 产品层写自己的 AppShell（poweri/layout/AppShell.tsx）
  启动时根据运行环境选择用哪个 AppShell
```

PowerI 的 AppShell 复用基础层：

```typescript
// poweri/layout/AppShell.tsx
import { useAgentSession } from "@/hooks/useAgentSession";  // 复用
import { sendAgentCommand } from "@/lib/agent-client";       // 复用
import MarkdownBody from "@/components/MarkdownBody";         // 复用
import { useI18n } from "@/hooks/useI18n";                   // 复用

// 但布局是 PowerI 自己的
export default function PowerIAppShell() {
  return (
    <div className="poweri-layout">
      <ActivityBar />        {/* PowerI 新组件 */}
      <Sidebar />            {/* 可复用 SessionSidebar 或重写 */}
      <MainContent>
        <ChatWindow />       {/* 复用基础层 */}
        <StatusBar />        {/* PowerI 新组件 */}
      </MainContent>
      <PanelRouter />        {/* PowerI 新组件：Git/统计/轨迹 */}
    </div>
  );
}
```

### 4. 合约验证机制

```typescript
// poweri/contract.ts
const REQUIRED_LIB_EXPORTS = [
  "sendAgentCommand",
  "AgentEventConnection", 
  "streamReducer",
  // ...
];

const REQUIRED_COMPONENTS = [
  "MarkdownBody",
  "MermaidBlock",
  // ...
];

// 构建时检查这些接口是否存在
export function verifyContract() {
  // 检查 lib/ 导出
  // 检查组件存在
  // 失败时抛错，提示需要适配
}
```

### 5. 合并策略

- **基础层文件**（`lib/`、`hooks/`、`app/api/`）→ 上游为准，有冲突时以"不破坏 PowerI 依赖的接口"为原则
- **编排层文件**（`components/AppShell.tsx`、`ChatWindow.tsx`）→ 基础层保留原版，PowerI 用自己的版本
- **PowerI 产品层**（`poweri/`）→ 完全自有，不参与合并
- **定期同步节奏**：上游发版时 merge main → desktop，合约验证通过 = 无需适配，失败 = 按 contract.ts 的提示修复

## 与 Minke 的对比

| 维度 | Minke | PowerI（本方案） |
|------|-------|-----------------|
| 上游保持独立 | ✅ DSH submodule 只读 | ⚠️ fork 但分层，基础层尽量不动 |
| 产品代码集中 | ✅ `packages/harness-overlay/` | ✅ `poweri/` 目录 |
| UI 注入机制 | Cordis slot（声明式） | 替换 AppShell（命令式） |
| 合约验证 | ✅ `verifyHarnessContract()` | ✅ `poweri/contract.ts` |
| 上游合并策略 | 不需要（submodule 只读） | 基础层"上游为准，重放增量" |
| 复用程度 | 通过插件 API 复用 | 直接 import 复用 lib/hooks/components |

**PowerI 方案的优势**：比 Minke 更紧密地复用代码（直接 import，不需要插件 API 中转）。

**PowerI 方案的劣势**：上游合并时可能有冲突（Minke 完全没这个问题）。

## 实施路径

1. **创建 `poweri/` 目录结构**
   - `poweri/layout/` — 活动栏布局、面板编排
   - `poweri/features/` — 轨迹、Git、统计、状态栏
   - `poweri/contract.ts` — 合约验证

2. **实现 PowerI 的 AppShell**
   - 替换而非修改基础层的 AppShell
   - 复用基础层的 lib/hooks/基础组件

3. **建立合约验证**
   - 每次 CI 构建时运行
   - 检查基础层关键接口是否存在

4. **更新 v0.2 工单**
   - 所有 UI 层工作项（F1/F2/F3/F6/F11）改为在 `poweri/` 中实现
   - 基础层文件（lib/hooks/api）保持不动

## 后果

### 正面

- **最大程度跟随上游**：基础层（lib/hooks/api）跟随 pi-web 迭代，自动获得 bug 修复和新功能
- **产品代码集中**：PowerI 特有功能集中在 `poweri/`，边界清晰
- **上游合并可控**：合约验证确保上游更新不会悄悄破坏 PowerI 的依赖
- **复用程度高**：直接 import 基础层的 lib/hooks/组件，不需要重新实现

### 负面

- **上游合并时可能有冲突**：基础层文件如果 PowerI 有修改，合并时需要手动解决
- **需要维护合约验证**：每次上游更新后需要检查合约是否通过
- **AppShell 双版本**：基础层保留原版 AppShell，PowerI 用自己的版本，需要确保两者都能工作

### 风险缓解

- **合约验证自动化**：CI 每次构建都运行，失败时立即提示
- **合并策略明确**：基础层以上游为准，PowerI 层完全自有
- **定期同步**：上游发版时及时 merge，避免积累大量冲突

## 参考

- [架构全景与范畴边界规范](../desktop/architecture-and-scope-boundary.md)
- [文件地图与架构验证](../desktop/file-map.md)
- [文件归属名册](../desktop/ownership.md)
