// 主界面（FileExplorer / SessionSidebar）替换件接线回归测试。
//
// 与 replacement-wiring.test.mjs 同源动机：基础层能力随上游合并就位，但
// poweri/ 替换件是冻结副本，不会自动接上。这些断言钉住「哪条上游提交、接在哪一行」。
// 每条测试名带上游 commit 短哈希，便于对着 replacements.json 对账。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const explorer = await readFile(new URL("../components/FileExplorer.tsx", import.meta.url), "utf8");
const sidebar = await readFile(new URL("../components/SessionSidebar.tsx", import.meta.url), "utf8");
const chatInput = await readFile(new URL("../components/ChatInput.tsx", import.meta.url), "utf8");
const chatWindow = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
const fileExplorer = await readFile(new URL("../components/FileExplorer.tsx", import.meta.url), "utf8");
const appShell = await readFile(new URL("../layout/AppShell.tsx", import.meta.url), "utf8");
const messageView = await readFile(new URL("../components/MessageView.tsx", import.meta.url), "utf8");
const fileViewer = await readFile(new URL("../components/FileViewer.tsx", import.meta.url), "utf8");

test("FileExplorer 能列出 Git 忽略的文件（上游 2f6a0a93）", () => {
  // 基础层 app/api/files/[...path]/route.ts 已支持 `hidden=1`，返回项带 hidden 原因；
  // 替换件要做的只是把开关传下去，并把它们画灰。
  assert.match(explorer, /hidden=1/, "必须把 hidden=1 传给 files 路由");
  assert.match(explorer, /showHidden/, "缺少开关状态");
  assert.match(explorer, /FileTreeHiddenReason/, "应从基础层 lib/file-tree-visibility 取原因类型");
  // 必须真的降透明度，否则「灰显」只存在于注释里。
  assert.match(explorer, /HIDDEN_ENTRY_OPACITY\s*=\s*0?\.\d+/, "缺少灰显透明度常量");
});

test("能把工作区在系统文件管理器中打开（上游 a0c00f37）", () => {
  // 路由 app/api/open-in-explorer 已在基础层就位。"在文件管理器中打开"按钮
  // 住在侧栏工具条（与上游一致），不在文件树里。
  assert.match(sidebar, /open-in-explorer/, "必须调用 /api/open-in-explorer");
  // 服务端才能开窗口，且只能在本机：必须探一次可用性再决定按钮状态。
  assert.match(sidebar, /FileManagerAvailability/, "缺少可用性探测");
  assert.match(sidebar, /openInFileManager/, "缺少打开文件管理器的动作");
});

test("SessionSidebar 具有会话搜索入口（上游 1cbd96fd）", () => {
  // 上游把这个能力拆成 components/SessionSearch.tsx（可 import、不可改）+ 路由
  // app/api/sessions/search；两者都已在基础层。替换件要做的只是接入。
  assert.match(sidebar, /from "@\/components\/SessionSearch"/, "必须复用上游 SessionSearch，不自建一份");
  assert.match(sidebar, /<SessionSearch\b/, "组件必须实际渲染");
  assert.match(sidebar, /sessionSearchQuery/, "搜索关键字要能输进来");
  assert.match(sidebar, /open=\{sessionSearchActive\}/, "搜索面板需由关键字驱动，否则空查询也会盖住列表");
});

test("SessionSidebar 会话行不再直接罗列消息条数（改用可视化）", () => {
  // AGENTS.md 设计理念第 1 条：可视化优先于数字罗列，数字是下钻层。
  // 因此 sidebar.messagesCount 不应再作为可见文本渲染。
  assert.doesNotMatch(
    sidebar,
    /<span>\{t\("sidebar\.messagesCount"/,
    "消息数应改为分段条，精确值只留在 title 悬浮提示里",
  );
  assert.match(sidebar, /MessageVolumeBar|messagesCountBuckets/, "缺少消息量分段条组件");
});

// ── 主题适配：accent 背景上的文字必须用 --accent-contrast ──────────────────────
// 上游 448e146c（add readable themes and toolbar theme selector）在引入 13 套主题的
// 同时，把这些位置的写死 #fff 换成 var(--accent-contrast)：浅色 accent（如 Zenburn
// 的 #f0dfaf、mist、sand）上白字不可读。实测 Zenburn 下发送按钮白字配 rgb(240,223,175)。
test("accent 背景上的文字用 --accent-contrast，不用写死的 #fff", () => {
  for (const [name, src] of [["ChatInput.tsx", chatInput], ["ChatWindow.tsx", chatWindow], ["SessionSidebar.tsx", sidebar]]) {
    assert.match(src, /var\(--accent-contrast\)/, `${name} 缺少 --accent-contrast`);
  }
});

// ── 文件树：外部链接放行、窗口回前台刷新、变更行 @ 入口 ──────────────────────
test("可放行指向项目外的目录链接（上游 687af277）", () => {
  // API 侧（app/api/files/[...path]/route.ts 的 ?type=allow-link 与
  // lib/linked-directory.ts 的 withOutsideLinkTargets）随基础层就位，
  // 缺的只是 UI：不认 outsideLinkTarget，用户点开链接目录只会空展开。
  assert.match(fileExplorer, /outsideLinkTarget/, "FileEntry/FileNode 需透出 outsideLinkTarget");
  assert.match(fileExplorer, /type=allow-link/, "需调用 allow-link 接口放行目标");
  assert.match(fileExplorer, /allowEnclosingLinkConfirm/, "指向项目父级/主目录的链接需二次确认");
});

test("窗口回到前台时刷新文件树（上游 4ad8aa31）", () => {
  assert.match(fileExplorer, /window\.addEventListener\("focus"/, "需监听 window focus 触发刷新");
});

test("变更文件行支持 @ 插入路径且目录可省略（上游 be38e5d8）", () => {
  // 侧栏窄：先牺牲目录，文件名保持完整。
  assert.match(fileExplorer, /const dirPart = /, "需拆分目录段与文件名");
  assert.match(fileExplorer, /const baseName = /, "文件名单独渲染以便不被截断");
});

test("切换主题后 accent 背景文字仍可读（--accent-contrast）", () => {
  for (const [name, src] of [["ChatInput", chatInput], ["ChatWindow", chatWindow], ["SessionSidebar", sidebar]]) {
    assert.match(src, /var\(--accent-contrast\)/, `${name} 缺少 --accent-contrast`);
  }
});

// ── 侧栏：未读标记跨标签同步 ─────────────────────────────────────────────────
test("未读标记在多个标签页之间同步（上游 3e4c1757）", () => {
  // 两个标签页各自持有整份未读集合、每次变化都整体写回 localStorage：
  // A 标签读了某会话，B 标签没听到，仍显示圆点，且 B 的下一次写回会把
  // 旧集合持久化，刷新后圆点在各处复活。storage 事件是唯一通知渠道。
  assert.match(sidebar, /addEventListener\("storage"/, "需监听 storage 事件采纳他页写入的集合");
  assert.match(sidebar, /parseUnreadSessionIds/, "需统一解析，容忍畸形值");
});

// ── 文件面板全宽切换 ─────────────────────────────────────────────────────────
test("文件面板可临时铺满而不改保存的分栏宽度（上游 ffb2dafc）", () => {
  assert.match(appShell, /rightPanelFullWidth/, "需有全宽派生状态");
  assert.match(appShell, /right-panel-full-width/, "需给面板容器加全宽类");
  assert.match(appShell, /file-panel-expand-button/, "需渲染展开/还原按钮");
  // 全宽时聊天列应当 inert，否则已打开的顶栏菜单画在查看器之上且关不掉。
  assert.match(appShell, /inert=\{rightPanelFullWidth\}/, "全宽时聊天列需 inert");
});

// ── 输入框：Markdown 列表续行 ────────────────────────────────────────────────
test("换行续上 Markdown 列表（上游 fd037e47）", () => {
  // 纯函数 getMarkdownListContinuation 与其 93 行测试都在基础层就位，缺的只是接线。
  assert.match(chatInput, /getMarkdownListContinuation/, "需接上列表续行纯函数");
  assert.match(chatInput, /beforeinput/, "需在 beforeinput 拦截 insertLineBreak");
  assert.match(chatInput, /isComposing/, "输入法组字期间不得拦截，否则中文候选确认会误触发");
});

// ── 等待态：卡在扩展对话框的会话显示琥珀呼吸点（上游 89d7141b）───────────────
test("扩展对话框等待态透传 + 行级琥珀点（上游 89d7141b）", () => {
  // 基础层 /api/sessions 与 /api/agent/running 都已返回 awaitingInputSessionIds；
  // app/sidebar.css 的 .session-tree-awaiting 也随基础层就位。缺的只是透传与渲染。
  assert.match(sidebar, /awaitingInputSessionIds/, "需接收 API 的 awaitingInputSessionIds");
  assert.match(sidebar, /setAwaitingInputSessionIds/, "需写入 state");
  // 行级分支：琥珀点占 spinner 的槽位，且优先于 spinner（等待中不是运行中）
  assert.match(sidebar, /isAwaitingInput/, "行级需有 awaiting 分支");
  assert.match(sidebar, /session-tree-awaiting/, "琥珀点用基础层 CSS 类");
  // i18n 标签
  assert.match(sidebar, /agentAwaitingInput/, "需用 sidebar.agentAwaitingInput 标签");
});

// ── 置顶 / 归档 / 文件树展开记忆（上游 2e87ddb1 + 49c9ca84 + 3fe257f2）────────
test("置顶/归档走 useSessionUiState，右键菜单承载（上游 2e87ddb1）", () => {
  assert.match(sidebar, /useSessionUiState/, "需用基础层 ui-state hook");
  assert.match(sidebar, /action: "set"/, "需发 set 请求（pinned/archived）");
  assert.match(sidebar, /SESSION_ROW_CONTEXT_MENU_EVENT|dispatchSessionRowContextMenu/, "右键菜单是唯一行内入口（平面时间线不加行内按钮）");
  assert.match(sidebar, /sidebar\.pinned|已置顶|pinnedSection/, "置顶区呈现");
  assert.match(sidebar, /sidebar\.archivedCount|archiveView/, "归档入口呈现");
});

test("文件树展开状态按 cwd 记忆（上游 3fe257f2）", () => {
  assert.match(fileExplorer, /file-tree-expansion|createExpandedPathsMemory/, "需用基础层展开记忆");
  assert.match(fileExplorer, /expandedPathsMemory|createExpandedPathsMemory/, "需建记忆实例");
});

// ── ported 桶抽审失真修复（49fa89c9 / 12b157df / 246c1f20 / 80cd55ec）─────────
test("回合耗时接线：turn-duration 接进 ChatWindow/MessageView（上游 49fa89c9）", () => {
  assert.match(chatWindow, /getTurnDurationMs|turn-duration/, "ChatWindow 需调 turn-duration");
  assert.match(chatWindow, /turnDurationMs/, "ChatWindow 需算 turnDurationMs 并传给 ProcessDetailsGroup/finalAnswer");
  assert.match(chatWindow, /durationMs/, "ProcessDetailsGroup 需接收 durationMs");
  assert.match(messageView, /turnDurationMs/, "MessageView 需消费 turnDurationMs");
  assert.match(messageView, /formatTurnDuration|chat\.turnDuration/, "MessageView 需渲染 chat.turnDuration");
});

test("新建会话后输入框聚焦（上游 12b157df）", () => {
  assert.match(appShell, /chatInputRef\.current\?\.\s*focus\(\)/, "AppShell 新会话后需 rAF 聚焦输入框");
  assert.match(chatInput, /focus\(\): void|focus\(\)\s*{/, "ChatInputHandle 需暴露 focus()");
});

test("diff gap 行渲染（上游 246c1f20）", () => {
  assert.match(messageView, /DiffGapRow|lines hidden|gap.*row\.type|row\.type === "gap"/, "MessageView 需渲染 gap 行而非静默丢弃");
  assert.match(fileViewer, /row\.type === "gap"|DiffGapRow|gapCount/, "FileViewer 需把 gap 计入折叠段");
});

test("SMIL spinner 换 CSS 动画（上游 80cd55ec）", () => {
  assert.doesNotMatch(sidebar, /<animate /, "RunningSessionIndicator 不应再有 SMIL");
  assert.doesNotMatch(sidebar, /<animateTransform/, "不应有 SMIL animateTransform");
  assert.match(sidebar, /animate-spin|session-spinner|unread-ping/, "应使用 CSS 动画类");
});

// ── 抽审改判回 pending 的接线（基础层就位，仅补替换件）────────────────────────
test("aborted 运行不响完成音（上游 86dea26a）", () => {
  assert.match(chatWindow, /type AgentEndInfo/, "ChatWindow 需 import AgentEndInfo");
  assert.match(chatWindow, /wrappedOnAgentEnd = useCallback\(\(end: AgentEndInfo\)/, "wrappedOnAgentEnd 需接收 end");
  assert.match(chatWindow, /!end\.aborted/, "被停止的运行不响完成音");
  assert.match(chatWindow, /onAgentEnd\?\.\(end\)/, "需把 end 透传给上层");
});

test("thinking 时长优先用 pi 记录的 durationMs（上游 86dea26a）", () => {
  assert.match(messageView, /recordedDurationMs|message\.durationMs/, "MessageView 需读 message.durationMs");
  assert.match(messageView, /messageDurationMs \?\?/, "durationMs 优先，退回时间戳差值");
});

test("聊天区显示 cache/cost 提示（上游 653cd7c0）", () => {
  assert.match(chatWindow, /getTranscriptNotices/, "ChatWindow 需调 getTranscriptNotices");
  assert.match(chatWindow, /TranscriptNoticeLines/, "需渲染 TranscriptNoticeLines");
  assert.match(chatWindow, /summarizeCacheMisses/, "折叠时需 summarizeCacheMisses 汇总");
  assert.match(chatWindow, /processMessageCount/, "折叠头消息数只计有内容的步骤，提示行不充数");
});

test("压缩中状态行显示 Compacting（上游 2e66e400）", () => {
  assert.match(chatWindow, /phaseLabel/, "ChatWindow 保留 phaseLabel");
  assert.match(chatWindow, /isCompacting\)?\s*(?:\?|&&)/, "phaseLabel/状态行需考虑 isCompacting");
});

test("压缩中发送按钮仍可用（上游 2e66e400）", () => {
  assert.match(chatInput, /\(!isStreaming \|\| isCompacting\)/, "显示条件需含 isCompacting 例外");
});

test("扩展状态栏能下发行命令按钮（上游 1333c808）", () => {
  assert.match(chatWindow, /<ExtensionStatusBar[^>]*onCommand=/, "需传 onCommand");
  assert.match(chatWindow, /commandsDisabled=/, "需传 commandsDisabled");
});

test("ChatInput 包 memo 防止流式期间重渲染（上游 e8d91efd）", () => {
  assert.match(chatInput, /import React, \{[^}]*\bmemo\b/, "需 import memo");
  assert.match(chatInput, /memo\(forwardRef<[^>]*>\(/, "导出需 memo(forwardRef<...>(...))");
});

test("压缩卡片显示本次压缩费用（上游 653cd7c0）", () => {
  assert.match(messageView, /getTranscriptNotices/, "MessageView 需读 transcript notices");
  assert.match(messageView, /costNotice/, "CompactionMessageView 需渲染 summary_cost 提示");
});

// ── 剩余 pending 接线（基础层 + i18n 已就位，仅补替换件）─────────────────────
test("内置命令重复提交防护（上游 d10988df）", () => {
  assert.match(chatInput, /builtinCommandPendingRef/, "需 pending 闸门 ref");
  assert.match(chatInput, /if \(builtinCommandPendingRef\.current\) return true/, "pending 时直接当已处理");
});

test("/auto-compact 斜杠命令（上游 f2d600ba）", () => {
  assert.match(chatInput, /name: "auto-compact", description: "chat\.commandAutoCompact"/, "命令表需含 auto-compact");
});

test("压缩错误可关闭（上游 0e87681f）", () => {
  assert.match(chatInput, /onDismissCompactError/, "ChatInput 需接收 onDismissCompactError");
  assert.match(chatWindow, /onDismissCompactError=\{dismissCompactError\}/, "ChatWindow 需透传 dismissCompactError");
});

test("Stop 按钮避开压缩提示落位（上游 0a38de9f）", () => {
  assert.match(chatInput, /RUN_END_CLICK_GUARD_MS/, "需 RUN_END_CLICK_GUARD_MS 守卫");
});

test("消息块键不随 entryId 就位而重挂载（上游 cfb4876b）", () => {
  assert.doesNotMatch(messageView, /key=\{`\$\{entryId \?\? "stream"\}-\$\{originalIndex\}`\}/, "块键不能再用 entryId ?? stream");
  assert.match(messageView, /<BlockView key=\{originalIndex\}/, "块键改用块索引（跨 entryId 就位保持状态）");
});

// ── 三批：需实测复现类接线 ─────────────────────────────────────────────────
test("移动端缩放后恢复桌面侧栏偏好（上游 fdeea873）", () => {
  assert.match(appShell, /desktopSidebarOpenRef/, "需 ref 记住桌面偏好");
  assert.match(appShell, /setSidebarOpen\(isMobile \? false : desktopSidebarOpenRef\.current\)/, "断点切换时恢复桌面偏好");
  assert.match(appShell, /if \(!isMobile\) desktopSidebarOpenRef\.current = next/, "移动端操作不改桌面偏好");
});

test("删除会话后不强制跳空聊天（上游 a096af3d）", () => {
  assert.match(appShell, /selectedSessionRef/, "需 ref 读最新选中态");
  assert.match(appShell, /const active = selectedSessionRef\.current/, "删除回调用最新选中态");
});

test("运行结束后不强制重建会话列表（上游 b73fdebc）", () => {
  assert.doesNotMatch(appShell, /if \(selectedSession\) hydrateSelectedSession\(selectedSession\.id\);\s*\n\s*\/\/ 上游 86dea26a/, "handleAgentEnd 不再 hydrateSelectedSession");
  assert.match(sidebar, /void loadSessions\(\);/, "loadSessions 不带 force 参数");
});

test("仓库根会话进入子目录后保持打开（上游 5a2f991b）", () => {
  assert.match(sidebar, /projectForCwd\(/, "SessionSidebar 用基础层 projectForCwd");
  assert.doesNotMatch(sidebar, /const projectSelection = useCallback\(\(root: string, key: string\)/, "不再内联 projectFor 逻辑");
});

test("已删除会话链接不显示别的会话（上游 e83280ed）", () => {
  assert.match(appShell, /linkedSessionId/, "AppShell 读 linkedSessionId");
  assert.match(appShell, /skipWorkspaceRestoreRef/, "跳过工作区恢复");
});

// ── 四批：推理等级/模型默认值/模型名/文件树刷新 ────────────────────────────
test("模型选择器同 id 重选应用已保存定义（上游 0347c5d4）", () => {
  assert.match(chatInput, /onReselect=\{onModelChange\}/, "同 id 重选也要走 onModelChange（刷新 models.json 同 id 编辑）");
});

test("运行中回合展示推理等级且可中途切换（上游 3f07a5ff + d0bf6bee）", () => {
  assert.match(chatInput, /\{onThinkingLevelChange && \(/, "推理控制运行中仍渲染（只读展示级别）");
  assert.doesNotMatch(chatInput, /\{!isStreaming && onThinkingLevelChange && \(/, "不能再用 !isStreaming 整块隐藏");
  assert.match(chatInput, /resolvedThinkingLevel = thinkingLevel && thinkingLevel !== "auto"/, "auto 是未提交默认，展示解析后级别");
  assert.match(chatInput, /isAutoThinkingSelection/, "新会话未提交推理级别时 auto 不高亮显式项");
  assert.match(chatInput, /t\("chat\.currentReasoning", \{ level: thinkingDisplayLabel \}\)/, "运行中 tooltip 用 currentReasoning");
  // d0bf6bee：控制运行中可点——按钮不得 disabled。切到工具预设块前为止，
  // 免得工具预设的 disabled={isStreaming} 串味。
  const thinkingControl = chatInput.slice(
    chatInput.indexOf("{onThinkingLevelChange && ("),
    chatInput.indexOf("{!isStreaming && onToolPresetChange"),
  );
  assert.doesNotMatch(thinkingControl, /disabled=\{isStreaming\}/, "推理按钮运行中不 disabled");
});

test("推理级别/模型可星标存为新会话默认（上游 6a1246e9）", () => {
  assert.match(chatInput, /savedDefaultThinkingLevel/, "需读已保存默认推理级别");
  assert.match(chatInput, /onSetDefaultThinkingLevel/, "需提供存默认动作");
  assert.match(chatInput, /star=\{onSetDefaultThinkingLevel && lvl !== "auto"/, "推理菜单行带存默认星标");
  assert.match(chatInput, /defaultValue=\{defaultModel\}/, "模型选择器传入新会话默认模型");
  assert.match(chatInput, /onSetDefault=\{onSetDefaultModel\}/, "模型选择器带存默认星标动作");
  assert.match(chatWindow, /onSetDefaultModel=\{handleSetDefaultModel\}/, "ChatWindow 接线 handleSetDefaultModel");
  assert.match(chatWindow, /onSetDefaultThinkingLevel=\{session \|\| isNew \? handleSetDefaultThinkingLevel : undefined\}/, "ChatWindow 接线 handleSetDefaultThinkingLevel");
});

test("会话模型名按 provider:id 精确显示（上游 ed840edf）", () => {
  assert.match(messageView, /export function getModelDisplayName\(/, "需导出 getModelDisplayName");
  assert.match(messageView, /getModelDisplayName\(message\.provider, message\.model, modelNames\)/, "模型标签走 getModelDisplayName");
  assert.doesNotMatch(messageView, /modelNames\?\.\[`?\$\{message\.provider\}/, "不再内联 provider:model 查表");
});

test("运行中工具写入即时刷新文件树（上游 4ad8aa31）", () => {
  assert.match(appShell, /READ_ONLY_TOOL_NAMES/, "需只读工具名集合");
  assert.match(appShell, /const handleToolEnd = useCallback\(\(toolName: string\)/, "需 handleToolEnd 节流刷新");
  assert.match(appShell, /onToolEnd=\{handleToolEnd\}/, "AppShell 把 onToolEnd 传给 ChatWindow");
  assert.match(appShell, /TOOL_END_REFRESH_MS/, "节流间隔常量（每秒至多一次）");
});

// ── 五批：MessageView lane（历史编辑 / fork / 截断压缩）────────────────────────
test("末条未作答截断提示压缩而非重试（上游 342fc9a2）", () => {
  assert.match(chatWindow, /recoverTruncation: endIdx === messages\.length && !isStreaming && !hasFinalAssistantAnswer\(finalAnswerMessage\)/, "仅末条、非流式、无答案时开放压缩");
  assert.match(chatWindow, /onCompact=\{options\.recoverTruncation \? handleCompact : undefined\}/);
  assert.match(chatWindow, /isCompacting=\{options\.recoverTruncation \? isCompacting : undefined\}/);
  assert.match(chatWindow, /compactError=\{options\.recoverTruncation \? compactError : undefined\}/);
  assert.match(messageView, /unansweredTruncation && onCompact &&/, "MessageView 渲染压缩按钮");
});
