# 借鉴清单：壳 / UI / 功能 三层矩阵（最终落地方案依据）

> 目标：基于官方 pi-web 二次开发（改 UI/交互）→ 小体积桌面应用（Tauri + npx）
> 层级：🟢 直接抄 / 🟡 改造抄 / 🔵 参考不抄 / ⚪ 暂缓或不抄；✦ = 用户点名项

## 壳层（桌面壳 / 打包 / 进程管理）

| 项目 | 借鉴点 | 级别 |
|---|---|---|
| dsh-desktop | Tauri 2 + 体积优化 profile（opt-level=s + lto + strip） | 🟢 |
| dsh-desktop | 进程管理全套：spawn → 端口轮询 → 日志双管道 → 杀进程组 → 端口复用 | 🟢 |
| dsh-desktop | 平台坑：macOS fnm 探测（需扩展 ~/.fnm）、Windows cmd /C + CREATE_NO_WINDOW | 🟢 |
| dsh-desktop | npx 分发 + @latest 强制刷新缓存 | 🟡 pi-web 无 --version，改临时端口法 |
| 官方 pi-web | bin/pi-web.js 参数契约（--no-open / -p / -H）——壳对接唯一接口 | 🟢 |
| PiDeck | PATH 多目录扫描 + --version 健康检查 + 诊断回显 | 🔵 仅走系统 pi 路线 |
| PiDeck | 托盘常驻（关窗不杀服务） | 🟡 二期，解决关窗断 agent |
| PiDeck | 升级：GitHub Release 检查 → 提示 → 浏览器下载 | 🟡 壳升级用它，业务升级用 npx |
| ct-jyjntc | app:// 协议无端口架构 | ⚪ 终局备选 |
| ct-jyjntc | 内置 Node 二进制 | ⚪ 与体积诉求冲突 |
| ct-jyjntc | 双运行时 light/heavy（SDK 加载隔离） | ⚪ 深度阶段参考 |
| ct-jyjntc | SDK 单文件 bundle、jiti 仅 dev 回退、Next 裁剪 | 🔵 |

## UI 层（界面 / 交互 / 设计语言）

| 项目 | 借鉴点 | 级别 |
|---|---|---|
| dsh-desktop | 壳 UI 极薄原则（工具栏 + 状态点 + loading 遮罩） | 🟡 |
| 官方 pi-web | 组件底座：AppShell/SessionSidebar/ChatWindow/TabBar/FileExplorer/MessageView | 🟢 改造落点 |
| 官方 pi-web | 中英 i18n、响应式、主题 | 🟢 |
| PiDeck | ✦ 工作区布局（类 Codex）：项目+会话 | 对话 | 右分屏 | 🟡 |
| PiDeck | ✦ 活动轨迹聚合（思考/工具调用/回答分段） | 🟡 |
| PiDeck | 常驻状态栏（模型/思考等级/上下文/缓存） | 🟡 |
| PiDeck | 会话历史抽屉 + 右键菜单 | 🟡 |
| PiDeck | 计划模式（Plan Mode） | 🔵 先查 pi-web 有无 plan 钩子 |
| PiDeck | Composer 输入框（@文件/!shell//命令） | 🟡 |
| PiDeck | 拖拽排序、行宽滑块、语义 token | 🟢 |
| ct-jyjntc | 同一 UI 双跑（Next/Vite + shim + api-transport） | 🔵 保留浏览器模式才需要 |
| ct-jyjntc | 桌面定制：标题栏、单实例、快捷键、通知直达、splash | 🟡 |
| ct-jyjntc | Monaco 编辑器、DiffView、ComposerPalette | 🟡 |

## 功能层（产品能力）

| 项目 | 借鉴点 | 级别 |
|---|---|---|
| dsh-desktop | 零业务逻辑原则（不重实现上游） | 🟢 开发纪律 |
| 官方 pi-web | 底座：app/api 40+ 路由 + SSE + AgentSession + request-security | 🟢 不动 |
| PiDeck | 会话导入（Codex/Claude） | 🔵 |
| PiDeck | Git 分支选择器 + 切换 | 🟡 |
| PiDeck | 内置浏览器预览 | ⚪ 与 iframe 限制冲突 |
| PiDeck | 中文提示词库 + Prompt/Skills 商店 | ⚪ |
| PiDeck | 信任确认、代理设置分离 | 🟡 |
| ct-jyjntc | ✦ 使用统计（token/cost/上下文面板） | 🟡 官方有 stats 数据 |
| ct-jyjntc | ✦ 模型管理增强（角色 default/smol/plan、catalog、连接测试） | 🟡 官方 ModelsConfig 之上增强 |
| ct-jyjntc | ✦ 技能管理（list/search/install） | 🟡 官方 SkillsConfig 对照补全 |
| ct-jyjntc | ✦ MCP servers（stdio/HTTP） | 🟡 官方无，新能力 |
| ct-jyjntc | ✦ 权限系统（Agent modes + allow/ask/deny + YOLO） | 🟡 官方仅信任确认，需新做 |
| ct-jyjntc | ✦ GitPanel（status/stage/commit/push/分支/AI 提交信息/冲突助手/commit split/Git Review 会话） | 🟡 最大增量 |
| ct-jyjntc | 文件增强（Monaco/fuzzy index/diff vs HEAD） | 🟡 |
| ct-jyjntc | 终端多 tab、Debug tab、项目记忆、LSP 健康 | ⚪ 排期后置 |

## 组合结论

```
壳    = dsh-desktop 骨架（Tauri + npx + 进程管理）          ← 唯一主干
UI    = 官方 pi-web 底座 + PiDeck 设计语言 + ct-jyjntc 桌面细节
功能  = 官方 app/api 底座 + ct-jyjntc 增强（✦优先）+ PiDeck 特色按需
```

关键判断：模型/技能/权限中官方已有基础版（ModelsConfig/SkillsConfig/ProjectTrustDialog），
是「底座上补增强」而非从零做；GitPanel、使用统计、MCP 是官方净增量，工程量集中在这三块。
