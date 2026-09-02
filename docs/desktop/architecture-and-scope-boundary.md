# PowerI 架构全景与范畴边界规范 (Architecture & Scope Boundary)

> 本文档系统性地梳理了 PowerI 项目的全局架构分层，明确定义了 **Tauri 桌面壳（Desktop Shell）** 与 **PowerI 产品层 / Web 核心（PowerI Core / npm 包）** 的职责边界与交互契约，并汇总了冗余代码清理与治理规范。

---

## 1. 项目全局冗余分析与清理审计

经过对仓库代码库的全面静态引用分析与测试套件验证，系统完成了深度清理，消除了原型阶段与历史迭代遗留的冗余资产：

### 已完成清理的历史冗余项

| 类别 | 清理目标 | 原因说明 |
| :--- | :--- | :--- |
| **模型逻辑** | `poweri/lib/litta-provider.ts` & test | 模型管理已回归 100% 官方原生 `ModelsConfig`，私有 Provider 封装已废弃 |
| **模型订阅** | `poweri/lib/model-subscriptions.ts` & test | 早期远程模型 Manifest 导入机制已废弃 |
| **模型路由** | `app/poweri/api/models/` 及其全部子路由 | 自定义模型 API 端点无调用者 |
| **配置脏数据** | `~/.pi/agent/models.json` 中的空 `litta` 条目 | 清除了导致 `Invalid models.json schema` 的空 `apiKey` 条目 |
| **侧边栏组件** | `poweri/features/ActivityBar.tsx` | v2.0 功能已统一收敛至 Settings 面板，侧边活动栏无任何引用 |
| **国际化词条** | `poweri/lib/i18n.ts` 中的 `models.*` 词条 | 对应已删除的自定义模型面板，不再使用 |
| **临时原型** | `app/prototype/` | 功能已正式落地到 `PowerIPluginsConfig.tsx`，已完成删除 |
| **历史调研草稿** | `docs/desktop/` 下 8 份早期调研 | 结论已固化至代码与规范，已深度清理 |
| **过程工单记录** | `.scratch/` (33 份历史工单/草稿) | 历史航图与工单已全量落地并交付，已全量清理 |

### 现存资产健康度
- **代码结构**：`poweri/` 下所有现存模块均有明确的引用链路与业务场景。
- **测试覆盖**：保留的 50 个 PowerI 专项单元测试及 849 个上游核心测试全部 Pass。
- **类型检查**：TypeScript (`tsc --noEmit`) 0 报错。

---

## 2. 三层体系架构全景

PowerI 采用 **“Tauri 宿主壳 ➔ PowerI 产品层 ➔ pi-web 基础引擎层”** 的严格三层分工体系：

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Tauri 原生桌面壳 (Desktop Shell Scope)                              │
│    物理路径: src-tauri/ (含 Rust 宿主 + src-tauri/shell/ 宿主前端)       │
│    核心职责: 原生窗口、系统托盘、Node/Web 进程托管、环境探针、静默安装升级 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ iframe 嵌入 (http://127.0.0.1:9989/poweri?cwd=...)
                                    │ + __TAURI__ IPC 双向通信桥
┌───────────────────────────────────▼────────────────────────────────────┐
│ 2. PowerI 产品层 / npm 包范畴 (PowerI Core Scope)                      │
│    物理路径: poweri/ + app/poweri/ (Next.js / React)                   │
│    核心职责: 替换式 AppShell 布局、双模附件处理、实时插件/技能市场、   │
│              Token/成本聚合统计、Markdown 本地文件穿透、多语言国际化    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 依赖导入 (import from "@/lib/...", "@/hooks/...")
                                    │ 共享进程内 AgentSession / RPC 调度
┌───────────────────────────────────▼────────────────────────────────────┐
│ 3. pi-web 基础引擎层 (Upstream Base Engine Scope)                      │
│    物理路径: lib/ + hooks/ + app/api/ + components/ (零修改红线区域)   │
│    核心职责: Pi SDK 驱动、RPC 进程管理、SSE 流式推流、模型与会话基础存储 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 范畴职责划分矩阵

| 维度 | ① Tauri 桌面壳范畴 (`src-tauri/`，含 `src-tauri/shell/`) | ② PowerI 产品层 / npm 包范畴 (`poweri/` + `app/poweri/`) | ③ 上游 pi-web 基础层 (`lib/` + `app/api/`) |
| :--- | :--- | :--- | :--- |
| **主要技术栈** | Rust (Tauri 2.x) + 原生 TS/Vite | TypeScript + React 19 + Next.js 16 (App Router) | TypeScript + Node.js + Next.js |
| **交付形态** | 跨平台桌面安装包 (.dmg, .msi, .deb) | npm 模块 `@poweri/poweri-web` 或 Web 独立服务 | Git upstream 分支代码 |
| **核心职责** | 操作系统级集成与运行时环境兜底 | AI 编程助手的产品化界面交互与增强业务逻辑 | 底层 Agent 运行时、会话协议与 RPC 调度 |
| **运行时依赖** | 操作系统原生 WebView + OS API | 现代浏览器 / Node.js 运行时 | Node.js (>=22.19.0) + Pi CLI |
| **网络请求模式** | 监听系统网络、本地端口可用性探测 | 客户端/服务端双向 Fetch、SSE 流式订阅 | 进程内调用、第三方 LLM API 转发 |
| **独立运行能力** | 纯壳体无法脱离 Web 独立提供 AI 功能 | **具备完全的独立 Web 运行能力** (直接浏览器访问) | 具备独立的 Web 运行能力 |
| **代表性模块** | `process_manager.rs`, `launch-machine.ts` | `PowerIPluginsConfig.tsx`, `attachment-helper.ts` | `rpc-manager.ts`, `useAgentSession.ts` |

---

## 4. Tauri 桌面壳范畴深度剖析

Tauri 壳是面向最终用户的原生宿主容器，核心解决“无需用户配置开发环境即可开箱即用”以及“系统级深度集成”的问题。

### 4.1 核心职责与模块分布

```
src-tauri/
├── src/main.rs              # 应用程序入口、Tauri 插件注册、托盘/窗口事件总线
├── src/commands.rs          # Tauri IPC 命令注册 (start_server, upgrade_web 等)
├── src/process_manager.rs   # Node/Next.js 子进程拉起、健康检查、端口探活与孤儿进程清理
├── src/env_detection.rs     # 系统 Node.js、npm、fnm、nvm 及环境变量 PATH 探测
├── src/installer.rs         # 本地离线安装、npm 远程拉取、版本校验与更新流水线
├── src/logger.rs            # 原生滚动日志记录 (~/.poweri/poweri.log)
└── shell/                   # 桌面壳宿主前端 (Vite)
    ├── index.html + styles.css  # 启动过渡界面、初始化动画与系统级设置抽屉
    ├── launch-machine.ts        # 启动状态机 (Probing ➔ Installing ➔ Starting ➔ Ready)
    └── main.ts                  # 状态机绑定、Tauri 事件监听、iframe 挂载与动态通信
```

### 4.2 桌面壳专属能力边界
1. **进程树生命周期托管**：
   - 检测本地端口（默认 `9989` / 开发 `9527`）：release 按 `GET /poweri` 身份探针判定是否已有 poweri-web 服务（独立安装的 npm 包亦在此端口），是则复用；被其他程序占用则报错不抢占。debug 直接复用 dev server。均无服务时自动通过 Rust 拉起后台 Web 服务。
   - 应用退出时，精确清理进程组（Process Group），杜绝 Node 孤儿进程驻留。
2. **环境探针与自动引导**：
   - 深度探测用户系统中是否存在 Node.js。若缺失，在启动页提供一键引导或通过嵌入式运行时接管。
3. **版本静默升级与分发**：
   - 对比本地 Web 资源版本与远端 npm 发布版本，支持后台静默下载、热重载与快速重启。
4. **原生系统集成**：
   - 系统托盘（常驻 Tray、右键菜单、退出控制）。
   - 单实例锁与窗口聚焦（避免多开导致端口冲突）。
   - 本地日志闭环（将 Webview 前端 JS 崩溃与 Rust 错误统一输出至原生日志文件）。

---

## 5. PowerI 产品层 / npm 包范畴深度剖析

PowerI 产品层是纯粹的 Web / React 产品核心，承载所有面向开发者的 AI 辅助编程交互、数据可视化与生态扩展。

### 5.1 核心职责与模块分布

```
poweri/
├── layout/
│   └── AppShell.tsx            # PowerI 专属主布局 (替换式接管，不侵入上游 AppShell)
├── features/
│   ├── plugins/                # 插件市场 (PowerIPluginsConfig: 实时对接 pi.dev/packages)
│   ├── skills/                 # 技能市场 (SkillsMarketView: 对接 skills.sh API + 私有 Git 源)
│   ├── StatsPanel.tsx          # 统计中心 (整合 Token 消耗、费用、会话列表)
│   ├── SessionListPanel.tsx    # 会话时间线分析与单会话账单下钻
│   └── UsagePanel.tsx          # 日/月/项目维度 Token 消耗及命中率图表
├── components/
│   ├── ChatInput.tsx           # 增强输入框 (双模附件胶囊、模型切换、提示词历史)
│   ├── MessageView.tsx         # 消息流渲染器 (附件还原展示、代码块高亮)
│   ├── MarkdownBody.tsx        # 增强 Markdown (智能识别工作区文件路径并转换为可点击链接)
│   ├── FileExplorer.tsx        # 工作区文件树视图
│   ├── FileViewer.tsx          # 多标签代码/文本查看器
│   ├── TabBar.tsx              # 标签栏状态控制
│   └── SettingsPanel.tsx       # 全局统一设置面板 (会话/统计/技能/插件/模型/常规)
├── lib/
│   ├── attachment-helper.ts    # Web 内联 vs Tauri 路径双模式附件协议与 XML 封装
│   ├── attachment-storage.ts   # 附件服务端持久化引擎 (.pi/attachments/)
│   ├── packages-catalog.ts     # 实时抓取 pi.dev 官方市场 HTML、解析多维分类与下载指标
│   ├── skills-catalog.ts       # 实时调用 skills.sh 搜索与浏览 API、热门排序
│   ├── skill-subscriptions.ts  # 私有 Git/业务技能仓库订阅、本地扫描与开关持久化
│   ├── usage-stats.ts          # JSONL 会话日志解析、Token 账单计算与缓存对账引擎
│   ├── workspace-file-search.ts# 工作区文件模糊定位 (支持跨路径 Markdown 文件点击跳转)
│   ├── file-path-detection.ts  # Markdown 内联文件路径识别正则引擎
│   ├── file-path-linking.ts    # 文件路径链接化 AST 处理
│   ├── html-balance.ts         # HTML 标签平衡容错清洗器
│   └── i18n.ts                 # 国际化语言包 (zh-CN, zh-TW, en)
app/poweri/
├── page.tsx                    # PowerI 产品层主入口页面 (挂载 /poweri 路由)
└── api/                        # PowerI 专属后端 API (附件上传、技能市场、用量统计等)
```

### 5.2 PowerI 产品层的核心架构特性

#### ① Web 与 Desktop 双模自适应（Graceful Degradation）
产品层通过 `isTauriEnv()` 动态侦测运行上下文，在保证桌面端极致性能的同时，确保在纯 Web 浏览器中 100% 可用：
- **附件上传**：
  - *Tauri 环境*：本地文件保存至工作区 `.pi/attachments/`，向 LLM 传递轻量相对路径，引导 Agent 使用 `read` / `bash` 工具按需调阅（节约上下文）。
  - *Web 环境*：浏览器端无法获取底层真实路径，自动转换为 `<attached_files>` XML 内联文本格式，直接注入 Prompt。
- **外部链接打开**：
  - *Tauri 环境*：调用 `@tauri-apps/api/core` 的 `open_external` 唤起系统默认浏览器。
  - *Web 环境*：自动降级为标准的 `window.open(url, "_blank", "noopener,noreferrer")`。

#### ② 零侵入替换式架构（Layered & Decoupled）
- 严格遵循 **ADR-0002**：上游原版 `components/AppShell.tsx` 保持 100% 官方代码不变，PowerI 在 `poweri/layout/AppShell.tsx` 中构建自己的产品布局。
- 启动路由分流：上游 UI 挂载于根路径 `/`，PowerI 挂载于 `/poweri` 路由。无论是单独访问 Web 还是桌面壳 iframe 加载，均互不干扰。

#### ③ 纯实时生态连接（Pure Real-time Market Access）
- 插件市场与技能市场彻底废弃任何本地写死的静态数据。
- 插件实时对接 `pi.dev/packages`（包含按下载量、更新时间、名称排序与翻页）。
- 技能实时对接 `skills.sh` 官方 API（支持实时模糊检索与全网安装量统计）。

---

## 6. 上下游交互与通信契约

```
┌──────────────────────────────────────────────────────────────────────────┐
│                               TAURI SHELL                                │
│                                                                          │
│  ┌───────────────────────┐             ┌──────────────────────────────┐  │
│  │ Rust Process Manager  │──(Spawn)───▶│ Node/Next.js Background Svc  │  │
│  └───────────────────────┘             └──────────────┬───────────────┘  │
│             ▲                                         │                  │
│             │ (IPC Commands)                          │ (HTTP/SSE)       │
│             ▼                                         ▼                  │
│  ┌───────────────────────┐             ┌──────────────────────────────┐  │
│  │ Shell UI (index.html) │──(iframe)──▶│ PowerI Web (/poweri)         │  │
│  └───────────────────────┘             └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.1 启动期通信
1. `src-tauri/shell/main.ts` 初始化 `createLaunchMachine()`，向 Rust 发起 `start_server` 指令。
2. Rust `process_manager` 确认端口连通后，向前端广播 `server:ready` 事件。
3. `src-tauri/shell/main.ts` 将 `#app-iframe` 的 `src` 设置为 `http://127.0.0.1:<PORT>/poweri?cwd=<ENCODED_CWD>`。

### 6.2 运行期通信
1. **环境标识注入**：Tauri 在全局注入 `window.__TAURI__` 与 `window.__TAURI_INTERNALS__`。
2. **状态共享与联动**：
   - 窗口缩放与拖拽：通过顶部导航栏区域的 `data-tauri-drag-region` 实现无缝拖拽。
   - 文件系统操作：PowerI 内部通过 `poweri/lib/file-actions.ts` 与 Tauri 的 OS Shell 交互（如“在 Finder/资源管理器中显示”）。

---

## 7. 分层治理与演进规则

1. **上游合并底线（Redline）**：
   - 严禁修改 `lib/`、`hooks/`、`app/api/`、`components/`（除 PowerI 专属替换项外）等上游文件。
   - 上游代码更新时，直接通过 `git merge upstream/main` 进行同步，保证产品层 `poweri/` 零冲突。
2. **代码物理隔离（Strict Placement）**：
   - 凡属于原生窗口、进程控制、系统日志、系统托盘的代码，**必须且仅能**写在 `src-tauri/`（含 `src-tauri/shell/`）中。
   - 凡属于界面呈现、业务逻辑、数据统计、图表分析的代码，**必须且仅能**写在 `poweri/` 或 `app/poweri/` 中。
3. **无假数据准则（Real-data Only）**：
   - 市场与生态类功能，必须直接对接真实在线 API 或本地真实文件系统，禁止硬编码伪造数据；网络异常时显式展示空状态或错误重试。
