/**
 * 设置面板 MCP 分区（PowerI 替换件）行为守卫。
 *
 * 为什么存在：S01 的四条上游能力（8716e708 列表 / 92489b77 信任 / eeda8624
 * 粘贴添加 / ce615e7c `/mcp` 跳转）全部在基础层就绪，缺的只是接线。
 * `poweri/lib/replacement-wiring.test.mjs` 断言接线点存在；这里断言它们
 * **串得起来**——/mcp 的意图能被 AppShell 接住、信任状态能从 AppShell 流到分区。
 *
 * 断言只读源码结构，不读 i18n 文案、不读样式数值。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const shell = read("../layout/AppShell.tsx");
const chatWindow = read("./ChatWindow.tsx");
const panel = read("./SettingsPanel.tsx");
const upstreamPanel = read("../../components/SettingsPanel.tsx");
const agentSession = read("../../hooks/useAgentSession.ts");

const count = (src, re) => (src.match(re) ?? []).length;

test("PowerI 自己的替换件接入 MCP 分区，不复制 McpConfig", () => {
  assert.match(panel, /id: "mcp"/, "分区列表缺 MCP");
  assert.match(panel, /<McpConfig embedded/, "MCP 分区未渲染上游 embedded 形态");
  assert.match(panel, /import \{ McpConfig \} from "@\/components\/McpConfig"/);
  // McpConfig 627 行，复制会产生第二份需要同步的资产
  assert.doesNotMatch(panel, /export function McpConfig/);
});

test("MCP 分区不需要项目：无 cwd 时列入全局 mcp.json 而不是禁用 tab", () => {
  // 上游把「哪些分区需要项目」收敛到 lib/settings-navigation.ts（8716e708），
  // PowerI 不再自己维护一份硬编码名单——两份名单早晚会漂移。
  assert.match(panel, /settingsSectionRequiresProject\(item\.id\)/);
  assert.match(panel, /settingsSectionRequiresProject\(section as SettingsSection\)/);
  const nav = read("../../lib/settings-navigation.ts");
  assert.doesNotMatch(
    /PROJECT_SECTIONS = new Set<SettingsSection>\[([^\]]*)\]/.exec(nav)?.[1] ?? "",
    /"mcp"/,
    "上游把 mcp 归为 requiresProject 后，无项目的用户会看不到全局 mcp.json",
  );
  // 有 cwd 时才 key 在 cwd 上重挂：换项目必须整块重读
  assert.match(panel, /key=\{cwd \?\? ""\}/);
});

test("信任链路：AppShell 持有状态，MCP 分区只借道（92489b77）", () => {
  assert.match(shell, /const openProjectTrustDialog = useCallback\(/);
  assert.match(shell, /const handleProjectTrustChanged = useCallback\(/);
  assert.match(shell, /<ProjectTrustDialog/, "信任对话框必须复用页面上已有的那个，不要另起一个");
  // 三个 props 从 AppShell 经 SettingsPanel 传到 McpConfig
  assert.match(shell, /projectTrust=\{projectTrust\}/);
  assert.match(shell, /onOpenTrustDialog=\{openProjectTrustDialog\}/);
  assert.match(shell, /onProjectTrustChanged=\{handleProjectTrustChanged\}/);
  assert.match(panel, /trust=\{projectTrust\}/);
  assert.match(panel, /onTrustProject=\{onOpenTrustDialog\}/);
  assert.match(panel, /onProjectTrustChanged=\{onProjectTrustChanged\}/);
});

test("/mcp 快捷入口：上游 raise 意图，PowerI 必须有人消费（ce615e7c）", () => {
  // 上游在基础层 hook 里 raise；这一侧只负责把回调一路递下去。
  assert.match(agentSession, /onOpenSettings\("mcp"\)/, "上游已不再 raise /mcp 意图则本断言需同步修正");
  // AppShell → ChatWindow → useAgentSession 三跳缺一跳，意图就静默丢失
  assert.match(shell, /<ChatWindow[\s\S]{0,4000}?onOpenSettings=/, "AppShell 没把 onOpenSettings 交给 ChatWindow");
  assert.match(chatWindow, /onOpenSettings\?: \(section: SettingsSection\) => void/, "ChatWindow 未声明该 prop");
  assert.match(chatWindow, /onOpenSettings,[\s\S]{0,400}?\}\)/, "ChatWindow 未把它传进 useAgentSession");
  // AppShell 的消费点：设置一个初始分区就会挂载 SettingsPanel
  assert.match(shell, /const handleOpenSettingsSection = useCallback\(/, "缺少意图→面板状态的桥");
  assert.match(shell, /setSettingsSection\(section\)/);
});

test("设置面板能从任意分区被打开：再次发起的意图要能重新落位", () => {
  // 面板已开着时再点另一个入口（例如输入框里的 /mcp）必须切过去，而不是停在旧分区。
  assert.match(shell, /key=\{settingsRequestId\}/, "缺少重挂 key，已在打开的面板会忽略新的分区意图");
  assert.match(shell, /setSettingsRequestId\(\(id\) => id \+ 1\)/);
  assert.match(shell, /initialSection=\{settingsSection\}/);
});

test("上游对照：McpConfig 仍是 leaf 组件且 embedded 形态未变", () => {
  assert.match(upstreamPanel, /<McpConfig embedded/, "上游 SettingsPanel 已不再渲染 McpConfig");
  const mcpConfig = read("../../components/McpConfig.tsx");
  assert.match(mcpConfig, /export function McpConfig\(/, "上游已移除 McpConfig 导出");
  assert.match(mcpConfig, /onTrustProject/, "上游 McpConfig 已不再接受 onTrustProject");
  assert.ok(count(upstreamPanel, /settingsSectionRequiresProject/g) >= 1);
});

test("裸 /mcp 在命令面板里按下 Enter 就提交；别的扩展 /mcp 仍需二次确认", async () => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
  const { submitsSlashCommandOnEnter, offersBuiltinSlashCommandWhileStreaming } =
    await jiti.import("./ChatInput.tsx");
  const builtin = { name: "mcp", source: "extension", sourceInfo: { path: "builtin:mcp" } };
  const foreign = { name: "mcp", source: "extension", sourceInfo: { path: "/ext/mcp.ts" } };

  assert.equal(submitsSlashCommandOnEnter("/mcp", builtin, false), true);
  assert.equal(submitsSlashCommandOnEnter("/mcp", builtin, true), true, "流式中也直接打开设置");
  assert.equal(submitsSlashCommandOnEnter("/mcp", foreign, false), false);
  assert.equal(submitsSlashCommandOnEnter("/mcp login x", builtin, false), false, "子命令作用于会话自己的连接，必须照常发送");
  // 流式中的放行判定：内置命令或裸 /mcp，其余一切照旧
  assert.equal(offersBuiltinSlashCommandWhileStreaming("/mcp"), true);
  assert.equal(offersBuiltinSlashCommandWhileStreaming("/mcp login x"), false);
  assert.equal(offersBuiltinSlashCommandWhileStreaming("hello"), false);
});
