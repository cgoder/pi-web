# 02-r2-reference-impl-details

Type: research
Status: claimed

## Question

参照项目实现细节盘点（source：/tmp/pideck-research 浅克隆、GitHub 源码、docs/desktop/ 既有研究）：

1. **PiDeck**：托盘常驻行为与菜单项、状态栏数据来源与刷新方式、工作区三栏布局结构与折叠交互、活动轨迹聚合的 UI 形态与事件来源
2. **ct-jyjntc/pi-web**：GitPanel 功能清单与交互细节（status/stage/commit/push/分支切换/AI 提交信息/冲突助手/commit split/Git Review 会话）、使用统计面板数据来源与展示、Composer 语法实现（@文件/!shell/斜杠命令）、权限系统 UI（modes + allow/ask/deny 交互）

产出：`docs/desktop/reference-impl-details-research.md`，逐条给来源（文件路径或链接）。此工单解锁 03/07/08/16。

## Findings

完整调研文档：`docs/desktop/reference-impl-details-research.md`（引用基于 /tmp/pideck-research 与 /tmp/ct-piweb-research 绝对路径+行号）。

1. **A1 托盘（→03）**：PiDeck 默认关窗隐藏到托盘（closeToTray=true），菜单固定三项「显示窗口/重启/退出」，退出前必须置 isQuitting 标志防关窗语义吞掉退出；本地完整克隆已是 Tauri 重写版（托盘仅 Windows 两项，作对照）。
2. **A2 状态栏（→09）**：会话头部 chip（ctx%/缓存率/费用）+ hover 明细（token/cache/TTFT/tps/双币费用），主进程事件驱动推送 `agents:runtime-state`（工具边沿即时 + 50ms 流式补丁），完整状态 = get_state+get_session_stats 双 RPC 与 session 文件解析并行，无独立轮询。
3. **A3 三栏布局（→07）**：react-resizable-panels 三栏（list/chat/drawer），App 持 px 单一事实源、拖拽释放才提交、折叠=拖到 minSize 以下或标题栏按钮，宽度记 localStorage（只记展开宽度），抽屉开合/钉住按项目记忆。
4. **A4 活动轨迹（→08）**：右抽屉「轨迹」面板 = turn 账本 + 4-lane 时间线 + inspector，数据来自已加载 ChatMessage 聚合（不另开 IPC）；live 由 pi RPC 事件（message_update/end、tool_execution_*、agent_* 等）经 50ms flush 的 agents:message + 独立增量通道 agents:thinking / agents:text-stream 送达。
5. **B5 GitPanel（→16）**：status/stage/unstage/discard/commit(+push)/AI+启发式提交信息/分支切换新建/冲突 ours|theirs|base|ai/commit split(plan+execute)/历史懒加载/Git Review 开真 session 全清单齐备，全部 /api/git/* + execFile 系统 git，AI 走 utility model。
6. **B6 使用统计（→11）**：服务端流式解析 session JSONL 按天聚合 token/消息/模型占比（size:mtime 缓存 + 45s/15min TTL），设置页 Usage 面板展示（趋势/热力图/streak），agent_end 后失效刷新；**不含 cost**（session 文件无价格，费用需另建管线）。
7. **B7 Composer（→10）**：@文件 = 前端自动补全（服务端只供文件索引）；!shell = 前端拦截走 RPC type:bash（! 进上下文 / !! 本地执行不进，模型不参与）；斜杠命令内置项前端直接调 RPC、自定义命令读 markdown 文件插入文本由 pi 本体执行。
8. **B8 权限（→15）**：AgentMode ask/auto/plan/yolo 菜单切换（乐观更新全局偏好 + set_mode RPC）+ 三态 allow/ask/deny 策略文档（设置页表格/JSON 编辑），base 存 pi-permissions.jsonc、effective 合成写扩展 config.json，运行时 ask 走 ask_user_question 内联问卷。
