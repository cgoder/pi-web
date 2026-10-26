// PowerI 替换件接线回归测试。
//
// 为什么存在：e2e（e2e/run.mjs、e2e/terminal.mjs）全部 goto 上游根路由 `/`，从不进 `/poweri`；
// 上游 components/SettingsPanel.test.mjs 也只校验上游文件。于是「上游能力已合并进基础层、
// 但 PowerI 替换件没接线」这类缺口零测试覆盖 —— v0.9.0 同步中就漏出子代理标签页、
// 划词开关持久化、会话滚动记忆三处（见 docs/desktop/replacements.json 的 ported 记录）。
// 本文件用源码断言钉住这些接线点，写法对齐上游 components/SettingsPanel.test.mjs。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shell = await readFile(new URL("../layout/AppShell.tsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../components/SettingsPanel.tsx", import.meta.url), "utf8");
const chatWindow = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
const chatInput = await readFile(new URL("../components/ChatInput.tsx", import.meta.url), "utf8");
const upstreamShell = await readFile(new URL("../../components/AppShell.tsx", import.meta.url), "utf8");
const registry = JSON.parse(
  await readFile(new URL("../../docs/desktop/replacements.json", import.meta.url), "utf8"),
);

// —— 上游同步批次 1（.scratch/upstream-debt-alignment）新增的替换件 ——
// 上游对照文件一并读取：上游把能力改掉/删掉时，本文件的断言必须跟着修正，
// 否则会变成「替换件没接、上游也没有」的静默通过。
const fileViewer = await readFile(new URL("../components/FileViewer.tsx", import.meta.url), "utf8");
const mermaidBlock = await readFile(new URL("../components/MermaidBlock.tsx", import.meta.url), "utf8");
const tabBar = await readFile(new URL("../components/TabBar.tsx", import.meta.url), "utf8");
const markdownBody = await readFile(new URL("../components/MarkdownBody.tsx", import.meta.url), "utf8");
const messageView = await readFile(new URL("../components/MessageView.tsx", import.meta.url), "utf8");
const mcpConfig = await readFile(new URL("../../components/McpConfig.tsx", import.meta.url), "utf8");
const mcpHelpers = await readFile(new URL("../../components/mcp-config-helpers.ts", import.meta.url), "utf8");
const upstreamModels = await readFile(new URL("../../components/ModelsConfig.tsx", import.meta.url), "utf8");
const upstreamPanel = await readFile(new URL("../../components/SettingsPanel.tsx", import.meta.url), "utf8");
const upstreamViewer = await readFile(new URL("../../components/FileViewer.tsx", import.meta.url), "utf8");
const upstreamMermaid = await readFile(new URL("../../components/MermaidBlock.tsx", import.meta.url), "utf8");
const upstreamTabBar = await readFile(new URL("../../components/TabBar.tsx", import.meta.url), "utf8");
const upstreamMarkdownBody = await readFile(new URL("../../components/MarkdownBody.tsx", import.meta.url), "utf8");
const globalsCss = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");

const count = (src, re) => (src.match(re) ?? []).length;

test("设置面板挂起子代理入口（v0.9.0 237d0ca 曾漏移植）", () => {
  assert.match(panel, /id: "agents"/);
  assert.match(panel, /label: t\("common\.agents"\)/);
  assert.match(panel, /<AgentsConfig embedded/);
  assert.match(panel, /import \{ AgentsConfig \} from "@\/components\/AgentsConfig"/, "须复用上游叶子组件，不得本地重写");
});

test("AppShell 为 ChatWindow 供会话滚动位置（430fe4d 的状态持有侧）", () => {
  assert.match(shell, /sessionScrollPositionsRef = useRef\(new Map<string, ChatScrollPosition>\(\)\)/);
  assert.match(shell, /initialScrollPosition=\{selectedSession \? sessionScrollPositionsRef/);
  assert.match(shell, /onScrollPositionChange=\{handleSessionScrollPositionChange\}/);
  // ChatWindow 侧声明了这两个 prop，若上游改名而此处未跟，接线会静默断掉
  assert.match(chatWindow, /initialScrollPosition/);
  assert.match(chatWindow, /onScrollPositionChange/);
});

test("划词提问开关持久化到上游同一个 localStorage key（c0abfc2）", () => {
  const KEY = /pi-quote-selection-enabled/g;
  assert.equal(count(shell, KEY), 2, "读写两侧都要有，只在 state 里拨开关会刷新即失效");
  assert.ok(count(upstreamShell, KEY) >= 2, "上游已不用该 key 则本测试与 PowerI 两侧均需同步修正");
});

test("未发送草稿在切换会话/工作区时暂存回流（77ffe3c）", () => {
  assert.match(shell, /import \{[^}]*rekeyDraft[^}]*\} from "@\/lib\/draft-store"/);
  assert.match(shell, /function parkedNewSessionDraftKey/);
  assert.ok(count(shell, /parkedNewSessionDraftKey\(/g) >= 3, "restoreWorkspaceContext / handleCwdChange / handleSelectSession 至少要三处");
});

test("compact 输入框（划词弹窗）不承载附件", () => {
  assert.ok(count(chatInput, /^    if \(compact\) return;$/gm) >= 2, "processIncomingFiles 与 handlePaste 各一处守卫");
});

test("替换件登记的每个 watermark 都经 ack 正规推进（防手写空区间假通过）", () => {
  for (const entry of registry.replacements) {
    assert.ok(entry.watermarkProvenance?.commit, `${entry.poweri} 缺 watermarkProvenance：watermark 疑似手写，审计区间会退化为空`);
    assert.ok(
      entry.watermark.startsWith(entry.watermarkProvenance.commit) || entry.watermarkProvenance.commit.startsWith(entry.watermark),
      `${entry.poweri} watermark=${entry.watermark} 与 ack 记录=${entry.watermarkProvenance.commit} 不一致`,
    );
  }
});

test("触及上游对照文件的提交都逐条落入 ported/waived/pending", () => {
  // 三类处置不得互相重复（同一提交既算移植又算待办＝记账含糊）
  for (const entry of registry.replacements) {
    const seen = new Map();
    for (const item of entry.ported ?? []) check(entry, item, "ported", seen);
    for (const item of entry.waived ?? []) check(entry, item, "waived", seen);
    for (const item of entry.pending ?? []) check(entry, item, "pending", seen);
  }
});

function check(entry, item, bucket, seen) {
  if (item.commit === registry.upstreamRef) return;
  const prev = seen.get(item.commit);
  assert.equal(prev, undefined, `${entry.poweri} 的 ${item.commit} 同时记为 ${prev} 和 ${bucket}`);
  seen.set(item.commit, bucket);
  assert.ok(
    (item.note ?? item.reason ?? "").length >= 8,
    `${entry.poweri} ← ${item.commit}（${bucket}）缺理由，无法复盘判定依据`,
  );
}

// ===========================================================================
// 上游同步批次 1（.scratch/upstream-debt-alignment）：账目关掉的每条欠账
// 都在这里留一条接线断言。理由写在各 assert 的消息里——断的是「替换件有没有
// 真正消费基础层能力」，不是「代码长得像不像上游」。
// ===========================================================================

test("Prism 语言按需加载（046bc67e）：两个替换件都走 PrismLight + usePrismLanguages", () => {
  for (const [name, src] of [["MermaidBlock", mermaidBlock], ["FileViewer", fileViewer]]) {
    assert.match(
      src,
      /import SyntaxHighlighter from "react-syntax-highlighter\/dist\/esm\/prism-light"/,
      `${name} 必须深导入 core-only 的 PrismLight，否则 refractor/all 会回到首屏 chunk`,
    );
    assert.match(src, /usePrismLanguages/, `${name} 未接 usePrismLanguages`);
  }
  // FileViewer 的纯文本不触发加载；MermaidBlock 从第一个代码块就开始加载，不看流式状态。
  assert.match(fileViewer, /usePrismLanguages\(Boolean\(data\) && language !== "text"\)/);
  assert.match(mermaidBlock, /const languagesReady = usePrismLanguages\(\);/);
  // 上游对照：能力从上游移除时，本断言需同步修正而不是静默通过。
  assert.match(upstreamViewer, /usePrismLanguages/, "上游 FileViewer 已不再使用 usePrismLanguages");
  assert.match(upstreamMermaid, /usePrismLanguages/, "上游 MermaidBlock 已不再使用 usePrismLanguages");
  assert.match(upstreamMermaid, /prism-light/, "上游 MermaidBlock 已不再使用 prism-light");
});

test("Prism 按需加载的基础层能力仍在导出（F05 的依赖面）", async () => {
  const hook = await readFile(new URL("../../hooks/usePrismLanguages.ts", import.meta.url), "utf8");
  assert.match(hook, /export function usePrismLanguages/);
  const lib = await readFile(new URL("../../lib/prism-languages.ts", import.meta.url), "utf8");
  assert.match(lib, /export function loadPrismLanguages/);
  assert.match(lib, /export function prismLanguagesLoaded/);
});

test("浅色主题代码块只有一层边框（cfcf2a1a）", () => {
  // Prism 的 vs 主题给 <pre> 自己加了 1px #ddd 边框，外层容器已经画了框，叠成两圈。
  // 断言行为而非注释文本：只有高亮器那一支的 customStyle 需要显式抹掉边框。
  const start = mermaidBlock.indexOf("<SyntaxHighlighter");
  const customStyle = mermaidBlock.slice(
    mermaidBlock.indexOf("customStyle={{", start),
    mermaidBlock.indexOf("codeTagProps={{", start),
  );
  assert.match(customStyle, /border: "none"/, "CodeBlock 的 customStyle 必须显式 border: none");
  assert.match(upstreamMermaid, /border: "none"/, "上游已移除该修复则本断言需同步修正");
});

test("主题切换时代码块背景不打架（e2ea7da3）", () => {
  // 浅色主题用 backgroundColor，深色主题用 background 简写；只覆盖一个，
  // 切换主题时 React 会在同一个 <pre> 上删掉另一个，背景丢失。
  assert.match(mermaidBlock, /const codeBlockDarkTheme = \{/);
  assert.match(mermaidBlock, /delete codeBlockDarkTheme\['pre\[class\*="language-"\]'\]\.background;/);
  assert.match(mermaidBlock, /style=\{isDark \? codeBlockDarkTheme : vs\}/);
  // 背景只由 backgroundColor 持有，不得同时出现简写。
  assert.match(mermaidBlock, /backgroundColor: "color-mix\(in srgb, var\(--bg\) 92%, var\(--bg-panel\)\)"/);
  assert.match(upstreamMermaid, /codeBlockDarkTheme/, "上游 MermaidBlock 已不再使用 codeBlockDarkTheme");
  // 同一根因的另一半：聊天代码块也必须删掉简写，否则 F07/M02 的「同一根因」配对只对了一半。
  assert.match(mermaidBlock, /delete codeBlockDarkTheme\['pre\[class\*="language-"\]'\]\.background;/);
  assert.match(mermaidBlock, /style=\{isDark \? codeBlockDarkTheme : vs\}/);
});

test("长回复的高亮走 idle 预算（b2b6a45b）", async () => {
  assert.match(
    mermaidBlock,
    /import \{ takeHighlightBudget, waitForHighlight \} from "@\/lib\/highlight-queue"/,
    "未接基础层的高亮预算",
  );
  assert.match(
    mermaidBlock,
    /useState\(\s*\(\) => !isStreaming && prismLanguagesLoaded\(\) && takeHighlightBudget\(code\.length\),?\s*\)/,
    "首帧判定必须同时满足「语言就绪」与「预算允许」，缺任一项会渲染出无高亮的成品或一次性高亮全部代码块",
  );
  assert.match(
    mermaidBlock,
    /return waitForHighlight\(\(\) => setHighlighted\(true\)\);/,
    "超预算的代码块必须排队等 idle slice，而不是永久纯文本",
  );
  assert.match(upstreamMermaid, /waitForHighlight/, "上游 MermaidBlock 已不再使用 waitForHighlight");
  const queue = await readFile(new URL("../../lib/highlight-queue.ts", import.meta.url), "utf8");
  assert.match(queue, /export function takeHighlightBudget/);
  assert.match(queue, /export function waitForHighlight/);
});

test("CSV/TSV 表格预览复用上游叶子组件（f87afbbe）", () => {
  assert.match(fileViewer, /import \{ DelimitedTable \} from "@\/components\/DelimitedTable"/, "不得本地重写表格");
  assert.match(fileViewer, /import \{ isDelimitedTablePath \} from "@\/lib\/delimited-table"/, "扩展名判定复用基础层");
  assert.match(fileViewer, /<DelimitedTable\b/);
  // 分块加载的前缀也要出表；被切掉的最后一条记录由解析器丢弃。
  assert.match(fileViewer, /complete=\{!data\?\.truncated\}/);
  // 表格不参与「超长文件降级为轻量行」的判定，否则会渲染成纯文本。
  assert.match(fileViewer, /const hasPreview = isDelimitedTable \|\|/);
  // 表格与 markdown/html 一样默认开 preview。
  assert.match(fileViewer, /isDelimitedTable\s*\n\s*\|\| \(data\?\.language === "markdown"/);
  assert.match(upstreamViewer, /DelimitedTable/, "上游 FileViewer 已不再使用 DelimitedTable");
});

test("大文件分块加载与「加载更多」（0e712013）", () => {
  // 服务端已支持 ?offset=，缺的是替换件这份接线。
  assert.match(fileViewer, /getFileApiUrl\(filePath, "read", sourceSessionId, \{ offset: offset \|\| undefined \}\)/);
  assert.match(fileViewer, /const \[loadingMore, setLoadingMore\] = useState\(false\)/);
  assert.match(fileViewer, /const showLoadMore = !!data\?\.truncated/);
  // 追加而非替换：滚回前面历史行仍在。
  assert.match(fileViewer, /\{ \.\.\.d, content: current\.content \+ d\.content \}/);
  assert.match(fileViewer, /disabled=\{loadingMore\}/);
  // 文案走三语消息表，不在替换件里硬编码。
  assert.match(fileViewer, /t\("i18n\.loadMore"\)/);
  assert.match(upstreamViewer, /showLoadMore/, "上游 FileViewer 已不再使用 showLoadMore");
});

test("超 256KB 的 HTML 仍可预览（93b3aba5）", async () => {
  // 半份文档渲染不出来，预览单独拉一次整份文件；源码视图仍旧分块。
  assert.match(fileViewer, /const needsHtmlFull = displayMode === "preview"/);
  assert.match(fileViewer, /(!data\.truncated \|\| data\.size <= HTML_PREVIEW_MAX_BYTES)/);
  assert.match(fileViewer, /&& data\.size <= HTML_PREVIEW_MAX_BYTES;/);
  assert.match(fileViewer, /getFileApiUrl\(filePath, "download", sourceSessionId\)/);
  assert.match(fileViewer, /setHtmlFull\(\{ text: await r\.text\(\) \}\)/);
  // 预览已持有整份文件，此时「加载更多」只属于源码视图。
  assert.match(fileViewer, /const showLoadMore = !!data\?\.truncated && !\(isHtml && effectiveDisplayMode === "preview"\)/);
  const types = await readFile(new URL("../../lib/file-types.ts", import.meta.url), "utf8");
  assert.match(types, /export const HTML_PREVIEW_MAX_BYTES/);
  assert.match(upstreamViewer, /needsHtmlFull/, "上游 FileViewer 已不再使用 needsHtmlFull");
});

test("行号栏横向滚动时固定（c713fcaa）", () => {
  assert.match(fileViewer, /const FILE_PINNED_LINE_NUMBER_STYLE: CSSProperties = \{/);
  assert.match(fileViewer, /position: "sticky"/);
  // 只给行数有上限的视图用：每次滚动（含竖向）都要重新定位每个 sticky 行号。
  assert.match(fileViewer, /const lineNumberStyle = visible\.size <= SOURCE_HIGHLIGHT_MAX_LINES\n    \? FILE_PINNED_LINE_NUMBER_STYLE\n    : FILE_LINE_NUMBER_STYLE;/);
  // 行号列与代码列共用一个行盒（13 × 1.6 = 20.8）。
  assert.match(fileViewer, /fontSize: 13,\n  lineHeight: 1\.6,/);
  assert.match(fileViewer, /lineHeight: "20\.8px"/);
  // 上游 86d94e22 的 fontWeight 变量属 #1074 自研字体体系，本仓已 waive，不得出现。
  assert.doesNotMatch(fileViewer, /fontWeight: "var\(--font-mono-weight\)"/);
  assert.match(upstreamViewer, /FILE_PINNED_LINE_NUMBER_STYLE/, "上游 FileViewer 已不再使用 FILE_PINNED_LINE_NUMBER_STYLE");
});

test("源码视图背景走 backgroundColor（e2ea7da3 / 9da54e12）", () => {
  // vs 主题只给 <pre> 设 backgroundColor，vscDarkPlus 另设 background 简写。
  // customStyle 必须用长写：React 在同一个 <pre> 上删简写会把所有背景长写一起清掉，
  // 而没变过的 backgroundColor 不会再被写回，于是切回浅色后背景直接消失。
  const start = fileViewer.indexOf("const highlightedSource = useMemo(");
  const customStyle = fileViewer.slice(fileViewer.indexOf("customStyle={{", start), fileViewer.indexOf("codeTagProps={{", start));
  assert.match(customStyle, /backgroundColor: "var\(--bg\)"/);
  assert.doesNotMatch(customStyle, /(?:^|[\s{,])background:\s*"var\(--bg\)"/);
  assert.match(upstreamViewer, /backgroundColor: "var\(--bg\)"/, "上游 FileViewer 已不再用 backgroundColor 覆盖背景");
});

test("源码视图的暗色主题删掉 <pre> 的 background 简写（9da54e12 的另一半）", () => {
  // 深色下 <pre> 会同时带 background=#1e1e1e（vscDarkPlus 的简写）与 backgroundColor=var(--bg)。
  // 切回浅色时简写从 style 对象里消失，React 执行 node.style.background = "" 会把所有背景
  // 长写一起清掉；而 backgroundColor 取值 var(--bg) 前后没变，React 跳过重写 —— 结果是
  // 源码视图完全没有背景（比不做更差：原来的 background 写法两主题同键，不会被删）。
  // 上游用 fileViewerDarkTheme 删掉简写来避免这次删除；MermaidBlock 的 codeBlockDarkTheme
  // 是同一手法，两处必须同形，否则同一个 bug 会只在一半代码路径上复现。
  assert.match(
    fileViewer,
    /const fileViewerDarkTheme = \{/,
    "缺 fileViewerDarkTheme：vscDarkPlus 的 <pre> background 简写未删，深转浅时背景会被 React 清空",
  );
  assert.match(fileViewer, /delete fileViewerDarkTheme\['pre\[class\*="language-"\]'\]\.background;/);
  assert.match(fileViewer, /style=\{isDark \? fileViewerDarkTheme : vs\}/, "高亮器必须用删过简写的暗色主题");
  assert.match(upstreamViewer, /fileViewerDarkTheme/, "上游 FileViewer 已不再使用 fileViewerDarkTheme");
});

test("文件版本判重 + 隐藏页释放监听（70b2947c）", async () => {
  assert.match(fileViewer, /import \{ fileVersion, fileVersionChanged \} from "@\/lib\/file-version"/);
  assert.match(fileViewer, /import \{ HIDDEN_PAGE_GRACE_MS, usePageHiddenFor \} from "@\/hooks\/usePageHidden"/);
  // 五类查看器各记一个「屏幕上那一版」。
  assert.equal(fileViewer.match(/const shownVersionRef = useRef<string \| null>\(null\);/g)?.length, 5);
  // 文本查看器重连时先比版本，相同只重读 diff。
  assert.match(fileViewer, /if \(fileVersionChanged\(shownVersionRef\.current, fileVersion\(meta\)\)\) synchronize\(\);/);
  assert.match(fileViewer, /else void fetchGitDiff\(filePath\);/);
  // 隐藏超过宽限期才放手；宽限期用基础层的值。
  assert.match(fileViewer, /const pageHidden = usePageHiddenFor\(HIDDEN_PAGE_GRACE_MS\);/);
  assert.match(fileViewer, /const watchEnabled = watchRequested && !pageHidden;/);
  assert.doesNotMatch(fileViewer, /const HIDDEN_PAGE_GRACE_MS/);
  const version = await readFile(new URL("../../lib/file-version.ts", import.meta.url), "utf8");
  assert.match(version, /export function fileVersion\b/);
  assert.match(version, /export function fileVersionChanged/);
  const hidden = await readFile(new URL("../../hooks/usePageHidden.ts", import.meta.url), "utf8");
  assert.match(hidden, /export function usePageHiddenFor/);
  assert.match(upstreamViewer, /shownVersionRef/, "上游 FileViewer 已不再使用 shownVersionRef");
});

test("PDF #page= 页片段贯通三个替换件（5e9b997d）", async () => {
  // 基础层已就绪：解析函数与标签状态字段。
  assert.match(fileViewer, /import \{ parsePdfPageFragment, /);
  assert.match(tabBar, /\/\*\* PDF page requested by the link that opened this tab \(`#page=N`\)\. \*\/\n  page\?: number;/);
  // AppShell 三处签名透传。
  assert.match(shell, /options\?: \{ sourceSessionId\?: string \| null; modeHint\?: "diff"; page\?: number \}/);
  assert.match(shell, /const handleOpenLinkedFile = useCallback\(\(filePath: string, page\?: number\) => \{/);
  assert.match(shell, /initialPage=\{activeFileTab\.page\}/);
  assert.match(shell, /onOpenFile=\{\(filePath, page\) => handleOpenFile\(/);
  // 查看器只在 PDF 且页码合法时拼片段。
  assert.match(fileViewer, /const pageFragment = isPdf && initialPage && initialPage > 0 \? `#page=\$\{initialPage\}` : "";/);
  // 聊天入口的每一层签名都要带 page，否则页码在到达查看器前掉掉。
  assert.doesNotMatch(markdownBody, /onOpenFile\?: \(filePath: string\) => void;/);
  assert.match(markdownBody, /openFile\(filePath, parsePdfPageFragment\(href\) \?\? undefined\);/);
  assert.doesNotMatch(messageView, /onOpenFile\?: \(filePath: string\) => void;/);
  const links = await readFile(new URL("../../lib/file-links.ts", import.meta.url), "utf8");
  assert.match(links, /export function parsePdfPageFragment/);
  assert.match(upstreamTabBar, /page\?: number;/, "上游 TabBar 已不再有 page 字段");
});

test("站内锚点 + 桌面协议链接（2cefb72f / 5af2e04e）", async () => {
  for (const [name, src] of [["FileViewer", fileViewer], ["MarkdownBody", markdownBody]]) {
    assert.match(
      src,
      /import \{[^}]*jumpToMarkdownFragment[^}]*\} from "@\/lib\/markdown"/,
      `${name} 未接基础层的锚点跳转`,
    );
    assert.match(src, /onClick=\{jumpToMarkdownFragment\}/, `${name} 锚点未走 jumpToMarkdownFragment`);
    assert.match(src, /markdownAppUrlTransform/, `${name} 桌面协议链接会被 URL 过滤器移除`);
    assert.match(src, /isExternalMarkdownHref\(/, `${name} 未区分外部与 app 链接`);
  }
  // 锚点必须先于本地文件解析分出支路，否则会被当成相对路径。
  const anchorIndex = markdownBody.indexOf('if (href?.startsWith("#")) {');
  const filePathIndex = markdownBody.indexOf("const filePath = onOpenFile ? resolveLocalFileHref(href, cwd) : null;");
  assert.ok(anchorIndex > 0 && filePathIndex > anchorIndex, "锚点分支必须先于本地文件解析");
  const markdown = await readFile(new URL("../../lib/markdown.ts", import.meta.url), "utf8");
  assert.match(markdown, /export function jumpToMarkdownFragment/);
  assert.match(markdown, /export function isExternalMarkdownHref/);
  assert.match(markdown, /export function markdownAppUrlTransform/);
  // 不得新建 lib/markdown-anchors.ts（基础层没有该文件）。
  await assert.rejects(readFile(new URL("../../lib/markdown-anchors.ts", import.meta.url), "utf8"));
  assert.match(upstreamMarkdownBody, /jumpToMarkdownFragment/, "上游 MarkdownBody 已不再使用 jumpToMarkdownFragment");
});

test("设置接入 MCP 配置与信任流程（8716e708/92489b77/eeda8624/ce615e7c）", () => {
  // 分区与渲染：复用上游叶子组件，禁止复制（McpConfig 627 行会产生第二份同步资产）
  assert.match(panel, /id: "mcp"/);
  assert.match(panel, /t\("settings\.mcp"\)/);
  assert.match(panel, /<McpConfig embedded/);
  assert.match(panel, /import \{ McpConfig \} from "@\/components\/McpConfig"/, "须复用上游叶子组件，不得本地重写");
  assert.match(mcpConfig, /export function McpConfig/, "上游已移除该导出则本断言需同步修正");
  // 信任链路：AppShell 持有状态，Section 只借道（92489b77 的 props）
  assert.match(panel, /trust=\{projectTrust\}/);
  assert.match(panel, /onTrustProject=\{onOpenTrustDialog\}/);
  assert.match(panel, /onProjectTrustChanged=\{onProjectTrustChanged\}/);
  assert.match(shell, /<ProjectTrustDialog/);
  assert.match(shell, /const openProjectTrustDialog = useCallback\(/);
  assert.match(shell, /const handleProjectTrustChanged = useCallback\(/);
  assert.match(shell, /<SettingsPanel[\s\S]{0,600}?projectTrust=\{projectTrust\}/);
  assert.match(shell, /onOpenTrustDialog=\{openProjectTrustDialog\}/);
  assert.match(shell, /onProjectTrustChanged=\{handleProjectTrustChanged\}/);
  // /mcp 快捷入口：上游在基础层 raise intent（ce615e7c），PowerI 必须消费它
  assert.match(chatWindow, /onOpenSettings/, "ChatWindow 未把 onOpenSettings 传给 useAgentSession，/mcp 意图将静默丢失");
  // 上游对照
  assert.match(upstreamPanel, /<McpConfig embedded/, "上游 SettingsPanel 已不再渲染 McpConfig");
});

test("设置面板的 Escape 与焦点行为复用基础层 stacked-dialog（ce615e7c 的焦点半份）", () => {
  // 面板不接管焦点时，/mcp 从输入框开设置后焦点仍在 textarea：流式运行时按 Esc，
  // ChatInput 的 handleKeyDown 先跑（preventDefault + onAbort），面板自己的 Esc 监听
  // 看到 defaultPrevented 就让路 —— 结果是「跑了半天的回复被中断，设置还开着」。
  assert.match(
    panel,
    /import \{ focusModalPanel, listenForPanelEscape \} from "@\/lib\/stacked-dialog"/,
    "设置面板必须复用基础层 lib/stacked-dialog.ts，不得本地重写 Esc/焦点逻辑",
  );
  // ① Escape 走 listenForPanelEscape：气泡阶段 + 尊重 defaultPrevented + 跳过 IME 组字。
  //   自有实现缺第三项：中文输入法按 Esc 取消候选词会把整个面板连同 McpConfig 的草稿关掉。
  assert.match(panel, /useEffect\(\(\) => listenForPanelEscape\(document, onClose\), \[onClose\]\)/);
  assert.doesNotMatch(panel, /document\.addEventListener\("keydown"/, "不得再保留自有的 document keydown 监听");
  // ② 焦点在布局阶段进入面板（早于分区自己的 autoFocus 搜索框），关闭时还给开启者。
  assert.match(panel, /const dialogRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(panel, /useLayoutEffect\(\(\) => focusModalPanel\(document, dialogRef\.current, \{/);
  assert.match(
    panel,
    /restoreTextEntry: !window\.matchMedia\?\.\("\(pointer: coarse\)"\)\.matches/,
    "触摸屏上不得把焦点还给文本框，否则软件键盘会重新盖住刚回到的聊天",
  );
  // ③ 焦点目标必须是面板本体的 backdrop：带 tabIndex={-1} 才能接收 focus()。
  const backdrop = panel.slice(panel.indexOf('className="settings-dialog-backdrop"') - 400, panel.indexOf('className="settings-dialog-backdrop"'));
  assert.match(backdrop, /ref=\{dialogRef\}/, "backdrop 未挂 dialogRef，focusModalPanel 拿不到焦点目标");
  assert.match(backdrop, /tabIndex=\{-1\}/, "缺 tabIndex={-1} 时 div 不可聚焦，focusModalPanel 静默失效");
  // 上游对照：上游把这三件一起做，本仓断言不跟着上游就退化。
  assert.match(upstreamPanel, /listenForPanelEscape\(document, onClose\)/);
  assert.match(upstreamPanel, /tabIndex=\{-1\}/);
});

test("发送键切换（5df8278a）：设置与输入框两端都读 useEnterSendMode", () => {
  assert.match(panel, /import \{ setEnterSendMode, useEnterSendMode, type EnterSendMode \} from "@\/hooks\/useEnterSendMode"/);
  assert.match(panel, /const enterSendMode = useEnterSendMode\(\)/);
  // PowerI 用数据驱动的二选一（sendKeyOptions.map），不是两个写死的按钮
  assert.match(panel, /const sendKeyOptions: \{ id: EnterSendMode; label: string \}\[\]/);
  assert.match(panel, /onChange=\{\(\) => setEnterSendMode\(option\.id\)\}/);
  assert.match(panel, /t\("settings\.enterSendMode"\)/);
  // 输入框：读取模式并据它判定发送键
  assert.match(chatInput, /import \{ useEnterSendMode \} from "@\/hooks\/useEnterSendMode"/);
  assert.match(chatInput, /const enterSendMode = useEnterSendMode\(\)/);
  assert.match(chatInput, /enterSendMode === "ctrlEnter"/);
  // 依赖数组必须带上模式，否则切换设置后编辑器仍用旧判定
  assert.match(chatInput, /\[isMobile, enterSendMode, isStreaming/);
  // 上游对照
  assert.match(upstreamPanel, /useEnterSendMode/);
  assert.match(upstreamPanel, /setEnterSendMode\("ctrlEnter"\)/);
});

test("Code mode 工具设置（1c387b47）：只经 /api/tools/settings 读写", () => {
  // Code mode 的选择器就是上游 Settings › MCP 的 Code mode 行（9cf95474）；
  // PowerI 复用它，因此断言落在 MCP 分区 + 不绕道直写 settings.json。
  assert.match(panel, /<McpConfig embedded/);
  assert.match(mcpConfig, /function McpCodemodeRow\b/, "上游 McpConfig 已不再含 Code mode 选择");
  assert.match(mcpConfig, /MCP_CODEMODE_SELECTION/);
  // 写入集中在 helpers 里，恰好一处；面板不碰文件
  assert.match(mcpHelpers, /"\/api\/tools\/settings"/, "写入必须经 API 路由，不得直改 settings.json");
  assert.equal((mcpHelpers.match(/"\/api\/tools\/settings"/g) ?? []).length, 1);
  assert.doesNotMatch(mcpConfig, /writeFile(?:Sync)?\(/);
  assert.doesNotMatch(panel, /writeFile|readFile|settings\.json/, "替换件不得直接读写配置文件");
  // 上游对照
  assert.match(upstreamPanel, /<McpConfig embedded/);
});

test("enabledModels 开关（50f6cce9）：上游 ModelsConfig 自带开关，PowerI 只需把 cwd 交进去", () => {
  // 开关本体在基础层组件里，PowerI 不重写
  assert.match(upstreamModels, /EnabledModelsProviderSwitch/);
  assert.match(upstreamModels, /EnabledModelsSection/);
  assert.match(upstreamModels, /useEnabledModels\(cwd\)/);
  assert.match(panel, /<ModelsConfig embedded[^>]*cwd=\{cwd\}/, "缺 cwd 时项目级 enabledModels 覆盖不会被上报，开关会谎报可编辑");
  // 上游对照：上游也把 cwd 交进去
  assert.match(upstreamPanel, /<ModelsConfig embedded cwd=\{cwd\}/);
});

test("文件标签溢出不被滚动条裁切（bf0730c1）", () => {
  // 标签项曾被写死 36px 且贴底对齐：溢出后滚动条在 36px 条内占高度，
  // 标签被推出条顶、顶部裁掉且滚不回来（#1225）。
  assert.match(tabBar, /alignItems: "stretch"/, "标签项必须拉伸填满滚动条上方的视口，否则被顶出条顶裁掉");
  assert.match(tabBar, /overflowY: "hidden"/, "纵向溢出必须裁剪，被顶出的部分不能滚回来");
  // 标签项的样式块（从 gap: 6 起到 transition 结束）不得再写 height。
  const from = tabBar.indexOf("gap: 6,");
  const tabItem = tabBar.slice(from, tabBar.indexOf('transition: "background 0.1s, color 0.1s",', from));
  assert.doesNotMatch(tabItem, /height:/, "标签项不得再各自写死 36px，与滚动条叠加后会溢出");
  // 上游对照：能力被上游改掉时，本断言需同步修正而不是静默通过。
  assert.match(upstreamTabBar, /alignItems: "stretch"/, "上游已换掉 stretch");
  assert.match(upstreamTabBar, /overflowY: "hidden"/, "上游已去掉 overflowY 裁剪");
});

test("标签条恒定 36px 并支持滚轮横向滚动（f4adfd04）", () => {
  // 隐藏滚动条与接管滚轮是一对：只隐藏会让鼠标用户彻底没法滚。
  assert.match(tabBar, /className="tabbar-scroll"/, "隐藏滚动条的样式挂在基础层 globals.css 的这个 class 上");
  assert.match(globalsCss, /\.tabbar-scroll \{\s*scrollbar-width: none;\s*\}/, "基础层不再隐藏滚动条则 PowerI 的恒定 36px 前提失效");
  assert.match(globalsCss, /\.tabbar-scroll::-webkit-scrollbar \{\s*display: none;\s*\}/);
  assert.match(tabBar, /list\.addEventListener\("wheel", onWheel, \{ passive: false \}\)/, "隐藏了滚动条就必须接管滚轮，否则鼠标用户没法滚");
  assert.match(tabBar, /list\.scrollLeft \+= event\.deltaY \*/, "纵向滚轮量要转成横向位移");
  assert.match(upstreamTabBar, /className="tabbar-scroll"/, "上游已不再用该 class");
});

test("文件标签条无障碍语义与键盘导航（9290c272 无障碍部分）", () => {
  assert.match(tabBar, /role="tablist"/, "标签条缺 tablist 角色，屏幕阅读器不按标签组播报");
  assert.match(tabBar, /role="tab"/);
  assert.match(tabBar, /aria-selected=\{isActive\}/);
  assert.match(tabBar, /tabIndex=\{isActive \|\| \(!activeTabId && tabs\[0\]\?\.id === tab\.id\) \? 0 : -1\}/, "roving tabindex：只有激活项进入 Tab 顺序");
  assert.match(tabBar, /\["ArrowLeft", "ArrowRight", "Home", "End"\]\.includes\(event\.key\)/, "方向键导航缺失");
  // 终端标签部分明确不做：Tab 接口一旦长出 kind，本断言会红，提醒先读终端集成 spec。
  assert.doesNotMatch(tabBar, /\bkind\b/, "Tab 接口不得引入终端标签的 kind 字段");
  assert.match(upstreamTabBar, /role="tablist"/, "上游已改角色模型");
  assert.match(upstreamTabBar, /aria-selected=\{isActive\}/);
});
