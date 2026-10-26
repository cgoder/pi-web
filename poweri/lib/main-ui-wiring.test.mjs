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
