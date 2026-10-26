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

// ── 主题与语言：入口归位 + 主题全集 ────────────────────────────────────────────
// 上游 2eb95b99 (#772) 删掉了顶栏的主题/语言按钮，理由写在提交信息里：
// "Appearance and locale already live in Settings > General. Drop the duplicate
//  toolbar buttons so the chat chrome stays on the session, not on configuring
//  the web UI." ADR-0003 §2 也拍板 theme/language 移除 → SettingsPanel.general。
test("顶栏不再有主题与语言按钮（上游 2eb95b99 / ADR-0003 §2）", () => {
  assert.doesNotMatch(shell, /renderThemeButton/, "顶栏主题按钮应已移除");
  assert.doesNotMatch(shell, /renderLanguageButton/, "顶栏语言按钮应已移除");
  // 系统主题订阅必须继续挂着，否则 data-theme 不再跟随系统切换（上游同一条提交的第二个修正）。
  assert.match(shell, /useTheme\(\)/, "移除按钮后仍需保持系统主题订阅挂载");
});

test("设置的主题选项来自 THEME_OPTIONS 全集，而非手写三项", () => {
  // lib/theme.ts 的 THEME_OPTIONS 是唯一真源；app/globals.css 里 13 套
  // [data-theme=...] 变量早已随基础层就位，替换件只需把它们全部列出来。
  assert.match(panel, /THEME_OPTIONS/, "主题列表必须映射 THEME_OPTIONS，不能手写");
  assert.match(panel, /data-theme=\{option\.id\}/, "色板必须按该主题自己的变量上色");
  assert.match(panel, /data-system=\{option\.id === "auto"/, "System 是开关不是配色，需单独标记");
});

// ── MessageView / MarkdownBody 上游欠账（spec/lane2-messageview，23 条 pending） ──
// 账目里这些条目的 note 大多是空的，判定全部从 `git show <hash>` 的真实 diff 重建；
// 能移植的钉成断言，结构性差异的由 docs/desktop/replacements.json 的 waived 记录承担。

test("用户消息换行保真：keepLineBreaks 走 remark 内建插件而非 CSS pre-wrap（faeff036）", () => {
  // 上游两处同时改：MarkdownBody 新增 keepLineBreaks prop 选 markdownUserRemarkPlugins，
  // UserMessageView 把 \\r\\n / 独 \\r 归一成 \\n（Chrome 在 pre-wrap 下把独 \\r 渲染成空格）。
  // 只加插件不改回车，粘贴文本仍会被合并成一段。
  assert.match(markdownBody, /keepLineBreaks\?: boolean/, "MarkdownBody 缺 keepLineBreaks prop");
  assert.match(markdownBody, /remarkPlugins=\{keepLineBreaks \? markdownUserRemarkPlugins : markdownRemarkPlugins\}/);
  assert.match(messageView, /\.replace\(\/\\r\\n\?\/g, "\\n"\)/, "用户消息未归一 \\r\\n / 独 \\r");
  assert.equal(count(messageView, /keepLineBreaks/g) >= 2, true, "两处用户消息渲染（skill 展开态 + 普通态）都要带上");
  // 上游对照：插件与归一化都在基础层，替换件只需接线。
  assert.match(upstreamMarkdownBody, /keepLineBreaks \? markdownUserRemarkPlugins/);
});

test("两位数有序列表序号不被 overflow-x 裁切（8347ea5c）", () => {
  // 上游把 list 的左内距改成按最宽序号的位数计算，通过 --ol-marker-digits 传给 CSS；
  // 基础层 app/globals.css 的 .markdown-body ol 已消费该变量，替换件不传就退回 2 位默认值。
  assert.match(markdownBody, /\["--ol-marker-digits" as string\]: Math\.max\(digits, 2\)/);
  assert.match(globalsCss, /var\(--ol-marker-digits, 2\)/, "基础层 CSS 不再使用该变量，此接线失效");
});

test("MarkdownBody 流式分块解析与 memo（a952ed507e）", () => {
  // 逐 chunk 重解析整段回复是二次复杂度（14k 字符在 4x 降速下 8.8s）。
  // 分块靠基础层 splitMarkdownBlocks()：「只能切在空行后、行首非列表项、围栏外」的规则都在那里。
  assert.match(markdownBody, /import \{ splitMarkdownBlocks \} from "@\/lib\/markdown-blocks"/);
  assert.match(markdownBody, /isStreaming \? splitMarkdownBlocks\(normalizedMarkdown\) : \[normalizedMarkdown\]/);
  assert.match(markdownBody, /const MarkdownBlock = memo\(/, "块组件必须 memo，否则每片都会重解析");
  // 上游同期剔除的 ImagePreview 包装：这里登记为结构性差异，用断言把理由钉住。
  assert.doesNotMatch(markdownBody, /ImagePreview/, "PowerI 不走 ImagePreview：单图预览需上游 ImagePreview（未在 poweri 设替换件），改用原生 img");
});

test("流式分块不破坏行内文件路径识别与 HTML 兜底（PowerI 独有前置处理）", () => {
  // PowerI 在归一化前先做 linkifyInlineFilePaths + escapeUnbalancedHtml。
  // 上游这条提交把分块放在 normalizeDisplayMath 之后；若把 PowerI 前置处理挪到分块之后，
  // 跨块的行内路径会被切碎，链接化与转义必须保持在切块之前。
  const linkifyAt = markdownBody.indexOf("linkifyInlineFilePaths(children");
  const escapeAt = markdownBody.indexOf("escapeUnbalancedHtml(enhancedMarkdown)");
  const splitAt = markdownBody.indexOf("splitMarkdownBlocks(normalizedMarkdown)");
  assert.ok(linkifyAt > 0 && escapeAt > linkifyAt && splitAt > escapeAt, "预处理顺序必须是 linkify → escape → 分块");
});

test("Markdown 内链点击落在当前文档内（2cefb72f）", () => {
  // 净化器给 id 加 user-content- 前缀、同时给同名 fragment href 加前缀（rehypeMatchClobberedIds）；
  // 点击必须滚到链接所在 .markdown-body 里的那个 id，且不改 app URL —— 在 Tauri iframe 里
  // target=_blank 的 fragment 会开出第二个 WebView 窗口并永远停在顶部。
  assert.match(markdownBody, /import \{[^}]*jumpToMarkdownFragment[^}]*\} from "@\/lib\/markdown"/);
  assert.match(markdownBody, /if \(href\?\.startsWith\("#"\)\)/);
  assert.match(markdownBody, /onClick=\{jumpToMarkdownFragment\}/);
  // 上游对照：基础层仍导出该处理器，且净化器仍加前缀。
  assert.match(upstreamMarkdownBody, /onClick=\{jumpToMarkdownFragment\}/);
  assert.match(globalsCss, /--ol-marker-digits/, "基础层 CSS 与 fragment 处理同期落地，缺失说明基础层版本倒退");
});

test("markdown 内联音视频（51b11598）", () => {
  // `![](take.wav)` 是模型展示它生成的音/视频的方式，<img> 放不出来；
  // 文件 API 本来就支持 range 请求，样式已在基础层 globals.css。
  assert.match(markdownBody, /import \{ isAudioPath, isVideoPath \} from "@\/lib\/file-types"/);
  assert.match(markdownBody, /if \(isAudioPath\(mediaPath\)\)/);
  assert.match(markdownBody, /return <audio controls preload="metadata" src=\{mediaSrc\} aria-label=\{label\} \/>/);
  assert.match(markdownBody, /return <video controls playsInline preload="metadata" src=\{mediaSrc\} aria-label=\{label\} \/>/);
  assert.match(markdownBody, /const mediaPath = filePath \?\? href\?\.split\(\/\[\?#\]\/, 1\)\[0\] \?\? ""/, "查询串/片段要去掉后判类型");
  // 上游对照：媒体样式也在基础层，缺一不可。
  assert.match(globalsCss, /\.markdown-body audio \{/);
  assert.match(globalsCss, /\.markdown-body video \{/);
});

test("用户手动展开的工具卡在流式更新中保持展开（b42d3f40）", () => {
  // 流式消息在 store → messages → Process details → 会话文件读回之间反复重挂载，
  // 组件内 useState 会被重置，刚展开的卡片立刻收起。展开状态必须存在组件外。
  assert.match(messageView, /import \{ isToolCallExpanded, setToolCallExpanded \} from "@\/lib\/tool-call-expansion"/);
  assert.match(messageView, /useState\(\(\) => isToolCallExpanded\(block\.toolCallId\)\)/);
  assert.match(messageView, /setToolCallExpanded\(block\.toolCallId, next\)/);
  assert.match(messageView, /onClick=\{toggleExpanded\}/);
});

test("codemode 调用按脚本 + 子调用渲染（9dc822e / cc697e62 / 82e55398）", () => {
  // 三笔连起来是一条线：先用脚本替换 input JSON 并列出脚本发起的调用，
  // 再把 MCP 名字显示成 server/tool 并缩进 JSON 结果，
  // 最后把脚本塞回「任何工具都用」的输入框、调用列表单独留一块。
  assert.match(messageView, /import \{ CODEMODE_TOOL_NAME, codemodeCalls, codemodeScript, codemodeScriptPreview, stripCodemodeHeader \} from "@\/lib\/codemode-view"/);
  assert.match(messageView, /import \{ CodemodeCallList \} from "@\/components\/CodemodeToolView"/);
  assert.match(messageView, /const codemodeCode = block\.toolName === CODEMODE_TOOL_NAME && !isStreamingInput \? codemodeScript\(block\.input\) : null/);
  assert.match(messageView, /\{codemode \? codemode\.code\.replace\(\/\\r\/g, ""\)\.trimEnd\(\) : inputStr\}/, "82e55398：脚本要落在通用输入框里");
  assert.match(messageView, /<CodemodeCallList calls=\{codemode\.calls\} omitted=\{codemode\.omitted\} isError=\{isError\} \/>/);
  assert.match(messageView, /!codemodeRunning/, "运行中的进度快照只有调用、没有正文，别渲染空结果块");
  // MCP 标签
  assert.match(messageView, /import \{ mcpToolLabel, prettyMcpResultText \} from "@\/lib\/mcp-tool-display"/);
  assert.match(messageView, /const mcpLabel = mcpToolLabel\(block\.toolName, result\?\.details\)/);
  assert.match(messageView, /prettyMcpResultText\(joinedResultText\)/);
});

test("压缩摘要默认折叠并可展开（47d8b9a4）", () => {
  // 摘要可能几页长，TUI 里也是折叠态；折叠时机头留下 tokensBefore 计数便于对账。
  assert.match(messageView, /const \[expanded, setExpanded\] = useState\(false\)/);
  assert.match(messageView, /tokensBefore/);
  assert.match(messageView, /\{expanded && <CompactionSummaryDetails summary=\{summary\} \/>\}/);
  assert.match(messageView, /function CompactionSummaryDetails\(/, "展开体要抽成独立组件，否则默认折叠时仍会解析整段摘要");
});

test("自定义消息的标题栏即折叠开关（574cbba1）", () => {
  // 旧实现只有一个按钮兼两职：隐藏消息切正文、有 details 时切 details，
  // 于是 display:true 且无 details 的消息永远折不起来。现在标题栏折叠正文，footer 只管 details。
  const header = messageView.slice(messageView.indexOf("function CustomMessageView"), messageView.indexOf("function getMessageText"));
  // PowerI 刻意偏差：上游 ChatWindow 用 isHiddenCustomMessage() 直接丢弃 display:false 的消息，
  // PowerI 不丢（以降级样式折起 + 「hidden extension message」标），所以默认值按 display 分：
  // 展示的默认展开、隐藏的默认收起。其余折叠语义与上游一致。
  assert.match(header, /const \[contentExpanded, setContentExpanded\] = useState\(!isHiddenDisplay\)/);
  assert.match(header, /aria-expanded=\{contentExpanded\}/);
  assert.match(header, /transform: contentExpanded \? "rotate\(180deg\)" : "none"/, "chevron 朝下=展开，和工具卡同一套语义");
  assert.match(header, /!contentExpanded && text && \(/, "折叠后要给一行预览");
  assert.doesNotMatch(header, /if \(isHiddenDisplay\) setContentExpanded/, "footer 不再兼管正文折叠");
});

test("PDF #page= 片段从消息链接传到文件预览（5e9b997d）", () => {
  // 链接 href 解析成文件路径时片段会丢，页码必须在 MarkdownBody 取出后作为第二个参数带下去。
  // MessageView 这一侧就是 onOpenFile 类型链：MessageView → AssistantMessageView → BlockView → TextBlock。
  assert.equal(count(messageView, /onOpenFile\?: \(filePath: string, page\?: number\) => void/g) >= 4, true, "onOpenFile 的 page 参数要在整条类型链上存在");
  assert.match(markdownBody, /parsePdfPageFragment\(href\) \?\? undefined/, "页码需在此取出，否则路径一解析就丢");
});

test("流式回复 t/s 的计时起点存在视图之外（5fd1e674）", () => {
  // 切会话会重挂 AssistantMessageView；起点若在组件内，新视图会把已流过来的 token
  // 除以半秒，报出几千 t/s。起点按 reply（provider/model/请求时间戳）记在模块级。
  assert.match(messageView, /import \{ streamRateKey, streamRateStart, streamTokensPerSecond, type StreamRateStart \} from "@\/lib\/stream-token-rate"/);
  assert.match(messageView, /streamStartRef\.current \?\?= streamRateStart\(streamRateKeyRef\.current, tokens, now\)/);
  assert.match(messageView, /const rate = streamTokensPerSecond\(streamStartRef\.current, tokens, now\)/);
  assert.doesNotMatch(messageView, /const elapsed = \(now - streamStartRef\.current\) \/ 1000/, "旧的本地计时必须被替换，否则切会话仍重新起算");
});

test("输出上限截断要显式告知并可压缩上下文（c8449730 / 342fc9a2）", () => {
  // 两笔连起来：先加黄条告知 stopReason=length；再区分“连正文都没有”的那种，
  // 不引导用户继续发问（还会被截），而是给出压缩上下文的按钮与失败信息。
  assert.match(messageView, /const truncated = isAssistantTruncated\(message, \{ isStreaming \}\)/);
  assert.match(messageView, /const unansweredTruncation = truncated && !hasAssistantAnswer\(message\)/);
  assert.match(messageView, /!providerError && !truncated\) return null/, "只有思考、被截断的消息不能被空内容守卫吞掉");
  assert.match(messageView, /t\(unansweredTruncation \? "chat\.truncatedWithoutAnswer" : "chat\.truncatedByOutputLimit"\)/);
  assert.match(messageView, /onClick=\{onCompact\}/);
  assert.match(messageView, /compactError && \(/);
});

test("长思考分片渲染（3d1ac418）", () => {
  // 单个文本节点下，每个流式 chunk 都要重排整段思考，模型打转时页面直接冻住。
  // 分片规则在基础层 splitThinkingPieces()（8000 字符处找换行、无换行 16000 硬切、不切代理对）。
  assert.match(messageView, /splitThinkingPieces \} from "@\/lib\/message-display"/);
  assert.match(messageView, /function ThinkingText\(\{ text \}: \{ text: string \}\)/);
  assert.match(messageView, /<ThinkingText text=\{\(block\.deferred \? content : block\.thinking\) \?\? ""\} \/>/);
  // 有意不用 memo（memo 的 bailout 会钉住整份思考字符串），所以片元素不得包 memo。
  const thinkingText = messageView.slice(messageView.indexOf("function ThinkingText"), messageView.indexOf("export function ThinkingBlock"));
  assert.doesNotMatch(thinkingText, /memo\(/);
});

test("模型显示名走 getModelDisplayName（ed840edf）：未移植，缺口在此钉住", () => {
  // 上游新增纯函数：provider/model 双向匹配 enabledModels 的 key（含 provider 前缀、
  // 带 / 的 responseModel、裸 model 名），都匹配不上时回退 `provider/model`。
  // PowerI 仍用两段裸查表，`modelNames[provider:model] ?? modelNames[model] ?? model`，
  // 于是 responseModel 带前缀（如 "anthropic/claude-x"）时显示成裸 model 名。
  // 该函数属于上游纯工具层，PowerI 不能复制进 poweri/lib（重复实现），只能等上游导出后 import。
  assert.match(messageView, /modelNames\?\.\[`\$\{message\.provider\}:\$\{message\.model\}`\] \?\? modelNames\?\.\[message\.model\] \?\? message\.model/);
  assert.doesNotMatch(messageView, /getModelDisplayName/, "若已移植请改成正向断言；同时确认上游已导出该函数");
});

test("编辑分支的语义与上游 585d56c2 / 7303179c 不同：PowerI 走 onNavigate+onEditContent", () => {
  // 上游 585d56c2 把 fork 入口改成「导航到该条再编辑」，7303179c 又改成点击只预填、
  // 发送时才 navigate_tree 分支。PowerI 两个 handler 都没有：ChatWindow 传的是
  // onNavigate（无返回值）+ onEditContent(message)，点击即 onNavigate(prevAssistantEntryId!)
  // 后预填输入框，既不 await 导航结果、也没有取消编辑的 banner。
  // 这是产品层分支模型的差异（PowerI 的 fork/导航由 ChatWindow 自管），
  // 不是显式 waived 记录所能覆盖的未来同步风险，所以用断言把现状钉死：
  // 上游改名/改签名时这条会红，提醒重新评估而不是静默漏接。
  assert.match(messageView, /onNavigate\?: \(entryId: string\) => void;/);
  assert.match(messageView, /const canNavigate = !!prevAssistantEntryId && !!onNavigate/);
  assert.match(messageView, /onClick=\{\(\) => \{ onNavigate!\(prevAssistantEntryId!\); onEditContent\?\.\(editTarget\); \}\}/);
  assert.doesNotMatch(messageView, /onCancelEdit/, "上游的取消编辑 banner 未移植");
});

test("运行中消息的键稳定性（cfb4876b）：MessageView 块键缺口在此钉住", () => {
  // 上游把块键从 entryId 改成纯 index，因为跑的这条消息要等文件重读才有 entry id。
  // ChatWindow 侧已在本批落地：消息键走基础层 messageKeys[idx]（不再 entryIds[idx] ?? idx）。
  // 剩余一半在 MessageView：块键仍是 `${entryId ?? "stream"}-${originalIndex}`，
  // 首读时 entryId 从 undefined 变成真值，键变 ⇒ 重挂载 ⇒ 滚动位置与展开态回退。
  assert.match(messageView, /key=\{`\$\{entryId \?\? "stream"\}-\$\{originalIndex\}`\}/);
  assert.match(chatWindow, /const messageKey = messageKeys\[idx\];/);
});

test("表格边框与滚动渐隐分层（e070e0b7）", () => {
  // 基础层把 mask 挂在 .markdown-table-wrap、边框挂在 .markdown-table-frame 上：
  // 合成一层会把边框跟着一起淡化。上游为此加了外框，替换件不渲染外框就丢边框（也丢渐隐）。
  assert.match(markdownBody, /<div className="markdown-table-frame">/);
  assert.match(markdownBody, /<div className="markdown-table-wrap">/);
  assert.match(globalsCss, /\.markdown-table-frame \{[\s\S]*?border: 1px solid var\(--border\);/, "外框是边框的宿主");
  assert.match(globalsCss, /\.markdown-code-block > pre,\s*\n\s*\.markdown-table-wrap \{\s*\n\s*--scroll-fade-size/, "mask 挂在 wrap 上，两层缺一不可");
});

// ── 上游欠账清理：ChatWindow.tsx 替换件（spec/lane1-chatwindow） ───────────────
// 每条对应 docs/desktop/replacements.json 中该替换件 pending 数组的一个上游提交。
// 断言全部钉在「PowerI 现状代码里必须出现的接线点」，并尽量附上游对照，
// 让上游把能力改掉时本文件变红而不是静默通过。
const upstreamChatWindow = await readFile(new URL("../../components/ChatWindow.tsx", import.meta.url), "utf8");
const turnViews = await readFile(new URL("../../lib/turn-views.ts", import.meta.url), "utf8");
const rpcManager = await readFile(new URL("../../lib/rpc-manager.ts", import.meta.url), "utf8");
const upstreamMessageView = await readFile(new URL("../../components/MessageView.tsx", import.meta.url), "utf8");
const upstreamChatInput = await readFile(new URL("../../components/ChatInput.tsx", import.meta.url), "utf8");

test("剪切选择框必须压过会话侧栏（f3a4ff62 / #855）", () => {
  // #session-sidebar 是 z-index 200；130 会让剪贴工具条在靠左时被侧栏盖住。
  assert.match(chatWindow, /zIndex: 260,/, "划词工具条层级必须高于侧栏的 200");
  assert.match(upstreamChatWindow, /zIndex: 260,/, "上游已改层级模型");
});

test("扩展对话框标题保留换行（fcd94bf7 / #961 前身）", () => {
  // pi TUI 原样显示 title；select/input 没有独立 message 字段，扩展会把多行文本塞在这里。
  assert.match(
    chatWindow,
    /fontWeight: 650, lineHeight: 1\.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" \}\}>\{request\.title\}/,
    "扩展对话框标题缺 pre-wrap：多行标题会被压成一行",
  );
  assert.match(upstreamChatWindow, /fontWeight: 650, lineHeight: 1\.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" \}\}>\{request\.title\}/);
});

test("长标题可收缩，不再把选项挤出对话框（46b52356 / #890）", () => {
  // 只给 maxHeight: "50%" 时光标父级高度不确定，flexShrink: 0 让标题吃满内容高度，
  // 选项区被压到 0、footer 被 overflow: hidden 裁掉，弹窗看起来「卡死」。
  assert.match(
    chatWindow,
    /flexShrink: 1, minHeight: 0, display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 14px", borderBottom: "1px solid var\(--border\)", maxHeight: "50vh", overflowY: "auto"/,
    "扩展对话框 header 必须 flexShrink: 1 + maxHeight: 50vh",
  );
  assert.match(upstreamChatWindow, /maxHeight: "50vh", overflowY: "auto"/);
});

test("终止性输出截断算作答，避免整轮被折叠（c8449730 + 342fc9a2 / #830 #968）", () => {
  // 上游把 isAssistantTruncated 并入 finalAnswerMessage 判定，并把「无作答的截断」
  // 交给 MessageView 的 compact 恢复入口。PowerI 的 MessageView 已拆掉 onCompact 通道，
  // 因此只接第一半（classification），第二半保持缺口。
  // 判定本体已抽到 lib/turn-views.ts（上游同一轮的重构），由 getFinalAnswerViews 统一做，
  // 替换件不再自己拼 withAssistantBlocks。
  assert.match(chatWindow, /const finalAnswerMessage = finalViews\.answer;/);
  assert.match(turnViews, /getAssistantErrorMessage\(message\) \|\| isAssistantTruncated\(message\)/);
  assert.match(upstreamChatWindow, /getFinalAnswerViews\(/);
});

test("PDF #page= 片段经 onOpenFile 第二参数透传（5e9b997d / #841）", () => {
  assert.match(chatWindow, /onOpenFile\?: \(filePath: string, page\?: number\) => void;/, "PowerI Props 缺 page 参数");
  assert.match(upstreamChatWindow, /onOpenFile\?: \(filePath: string, page\?: number\) => void;/);
});

test("消息列表显示可抓的滚动条（5933184f + ea8a2781 / #873 #788）", () => {
  assert.match(chatWindow, /useScrollbarVisibility\(scrollContainerRef, Boolean\(session\?\.id\) \|\| !isEmptyNew\)/);
  assert.match(
    chatWindow,
    /className="scrollbar-subtle min-w-0 flex-1 overflow-x-hidden overflow-y-auto pt-4 \[scrollbar-gutter:stable\]"/,
    "消息列表既要有 scrollbar-subtle（悬停显示）又要留稳定 gutter",
  );
  assert.doesNotMatch(chatWindow, /\[scrollbar-width:none\]/, "列表已不再整体隐藏滚动条");
  assert.match(upstreamChatWindow, /useScrollbarVisibility\(scrollContainerRef,/);
  assert.match(globalsCss, /\.scrollbar-subtle::-webkit-scrollbar-thumb/, "基础层样式缺席则本接线无效");
});

test("回到最新一条按钮（5fd1e674 的 showScrollToBottom 侧）", () => {
  // 上游 #896/#988 一并把 showScrollToBottom 从 hook 里取出来渲染；
  // PowerI 至今没有任何回到尾部的浮层按钮。
  assert.match(chatWindow, /\bshowScrollToBottom\b/, "hook 已提供 showScrollToBottom，PowerI 未取用");
  assert.match(chatWindow, /className=\{`chat-scroll-to-bottom\$\{/);
  assert.match(globalsCss, /\.chat-scroll-to-bottom/);
});

test("扩展请求排队计数「+N more」与放大按钮（70470cab + 981e270f / #947）", () => {
  // 队列本体（waitingExtensionDialogCount / waitingExtensionCustomUiCount）已在
  // 基础层 hook 里，替换件只是没取。
  assert.match(chatWindow, /waitingExtensionDialogCount/);
  assert.match(chatWindow, /waitingExtensionCustomUiCount/);
  assert.match(chatWindow, /function ExtensionWaitingCount\(/);
  assert.match(chatWindow, /t\("chat\.extensionMoreWaiting", \{ count \}\)/);
  // 内容自适应加宽 + 用户的放大/还原按钮
  assert.match(chatWindow, /import \{ EXTENSION_DIALOG_BASE_WIDTH, fitExtensionDialogWidth \} from "@\/lib\/extension-dialog-fit"/);
  assert.match(chatWindow, /fitExtensionDialogWidth\(/);
  assert.match(chatWindow, /function ExtensionSizeIcon\(/);
  assert.match(chatWindow, /t\("chat\.extensionMaximize"\)/);
  // 自定义面板：按内容定宽，超宽行不再横向滚动
  assert.match(chatWindow, /width: "max-content",\s*\n\s*minWidth: "min\(920px, 100%\)"/);
  assert.match(upstreamChatWindow, /EXTENSION_DIALOG_BASE_WIDTH/);
});

test("压缩错误横幅可关闭（0e87681f / #784）—— 缺口：替换件 ChatInput 未接 onDismissCompactError", () => {
  // 基础层 hook 已导出 dismissCompactError、上游 ChatInput 也接受 onDismissCompactError，
  // 但 PowerI 的 ChatInput 替换件自身 Props 没有这项（另属一份替换件），
  // 因此本侧只钉「上游能力已在基础层、PowerI 未接」这个事实，防止静默通过。
  assert.match(
    upstreamChatInput,
    /onDismissCompactError\?: \(\) => void;/,
    "上游 ChatInput 已接关闭回调后，本条缺口描述需要更新",
  );
  assert.doesNotMatch(chatWindow, /onDismissCompactError=\{dismissCompactError\}/, "占位：接线后才成立");
  assert.doesNotMatch(chatInput, /onDismissCompactError/, "PowerI ChatInput 替换件仍无此 prop（本条保持 pending）");
});

test("历史分页不重复预置同一页（d474ce23 / #1149）", () => {
  // 页面落地与 loadingOlderRef 清零早于下一个 cursor 渲染，中间的 observer 回调
  // 仍持旧 cursor，会把同一页再取一次（e2e 观测到 50-150 行重复）。
  assert.match(chatWindow, /const requestedCursorRef = useRef<string \| null>\(null\)/);
  assert.match(chatWindow, /const loadOlderPage = useCallback\(/);
  assert.match(chatWindow, /\[sentinel, visibleCount, historyCursor, hasEarlierMessages, session, loadOlderPage, sessionIdRef, scrollContainerRef\]/);
  assert.match(chatWindow, /if \(!oldestId \|\| oldestId === requestedCursorRef\.current\) return;/);
  assert.match(chatWindow, /useEffect\(\(\) => \{\s*\n\s*\/\/ A reloaded history can come back to a cursor asked for before\.\s*\n\s*if \(historyCursor !== requestedCursorRef\.current\) requestedCursorRef\.current = null;/);
  // 三条入口（恢复、搜索定位、sentinel）都必须走同一层，否则记忆的 cursor 会被绕过。
  assert.equal(count(chatWindow, /loadOlderPage\(/g), 3, "恢复、搜索定位、sentinel 三条入口都要走同一层");
  assert.match(upstreamChatWindow, /requestedCursorRef/);
});

test("Process details 折叠判定按「有无真实作答」（f47c38a2 / #906）", () => {
  // 只有 error/truncation 通知时不该折叠，否则这段唯一可见的文字被藏起来。
  assert.match(
    chatWindow,
    /import \{[^}]*\bcollapsesProcessDetails\b[^}]*\} from "@\/lib\/message-display"/,
  );
  assert.match(chatWindow, /const answered = collapsesProcessDetails\(finalAnswerMessage\);/);
  assert.match(chatWindow, /key=\{answered \? "answered" : "unanswered"\}[\s\S]{0,200}defaultExpanded=\{!answered\}/);
  assert.match(upstreamChatWindow, /collapsesProcessDetails\(finalAnswerMessage\)/);
});

test("单行通知垂直居中、文本区吃满 500px 上限（d850be1e / #1130）", () => {
  // 60px min-height 减去 2px 边框与 21px 行盒，剩下 37px 由上下 padding 均分；
  // 沿用 14px 会把文字顶到中线以上 4.5px。
  assert.match(chatWindow, /const NOTICE_TEXT_PADDING_Y_PX = \(NOTICE_MIN_HEIGHT_PX - 2 - NOTICE_LINE_BOX_PX\) \/ 2;/);
  assert.match(chatWindow, /marginTop: NOTICE_TEXT_PADDING_Y_PX \+ 7,/);
  assert.match(chatWindow, /padding: `\$\{NOTICE_TEXT_PADDING_Y_PX\}px 0`/);
  assert.match(chatWindow, /const NOTICE_TEXT_MAX_HEIGHT_PX = NOTICE_MAX_HEIGHT_PX - 2;/);
  assert.match(upstreamChatWindow, /NOTICE_TEXT_PADDING_Y_PX/);
});

test("划词「Ask here」不再清掉输入框光标（bc762a3e / #1319）", () => {
  // insertText 已经聚焦输入框并折叠页面选区；再调 removeAllRanges() 会把 textarea
  // 自己的 selection 一起清掉，光标跳到 offset 0，问题被插到引用之前。
  const askHere = chatWindow.slice(
    chatWindow.indexOf("const askSelectionHere = useCallback"),
    chatWindow.indexOf("const askSelectionInNewChat = useCallback"),
  );
  assert.ok(askHere.length > 0, "未找到 askSelectionHere");
  assert.doesNotMatch(askHere, /window\.getSelection\(\)\?\.removeAllRanges\(\)/, "Ask here 不得再清选区");
  assert.match(upstreamChatWindow, /No `removeAllRanges\(\)` here|focus already collapses the page's selection/);
});

test("一轮没有锚点的长回合也要成组（69882b9f / #941）", () => {
  // 会话详情默认只发最近 50 条；比一页还长的回合首条 user 消息不在里面，
  // 旧循环把首段整段平铺，丢掉 Process details 折叠。
  assert.match(chatWindow, /const hasAnchor = isMessageGroupAnchor\(msg\);/);
  assert.match(chatWindow, /if \(!hasAnchor && idx !== 0\) \{/);
  assert.match(chatWindow, /const userIdx = hasAnchor \? idx : -1;/);
  assert.match(chatWindow, /const groupStartIdx = hasAnchor \? idx : 0;/);
  assert.match(chatWindow, /groupStartIdx = hasAnchor \? idx : 0;[\s\S]{0,6000}?process-group-\$\{messageKeys\[groupStartIdx\]\}/, "成组键必须指向 groupStartIdx（首条已加载消息）");
  assert.match(upstreamChatWindow, /const groupStartIdx = hasAnchor \? idx : 0;/);
});

test("作答出现后 Process details 折叠（0bae9b6c / #1011）", () => {
  // useState 只在挂载时读 defaultExpanded：先渲染成无作答（展开）的组，
  // 答案出现后永远不收起。用 answered 作 key 精确重置这一次迁移。
  assert.match(chatWindow, /<ProcessDetailsGroup key=\{answered \? "answered" : "unanswered"\}/);
  assert.match(upstreamChatWindow, /<ProcessDetailsGroup key=\{answered \? "answered" : "unanswered"\}/);
});

test("消息键在运行中保持稳定（cfb4876b / #1184）", () => {
  // 运行中新增的消息要等重新读文件才有 entryId；键从 entryIds[idx] 变成 id 时
  // React 会重挂该消息（气泡内滚动、展开的思考、工具输出滚动全部复位）。
  assert.match(chatWindow, /loading, error, messages, activeToolResults, entryIds, messageKeys, historyCursor, hasEarlierMessages, earlierTurnCount, streamingStore,/);
  assert.match(chatWindow, /const messageKey = messageKeys\[idx\];/);
  assert.match(chatWindow, /key=\{`process-group-\$\{messageKeys\[groupStartIdx\]\}`\}/);
  assert.match(upstreamChatWindow, /const messageKey = messageKeys\[idx\];/);
});

test("流式回复期间把工具结果一起交给 MessageView（def1478d / 断线重连）", () => {
  // SSE 重连后条目会重发，activeToolResults 才是活的那份；渲染时不带它，
  // 重连期间的 shell 输出就看不到。
  assert.match(chatWindow, /<StreamingReply store=\{streamingStore\}[\s\S]*?toolResults=\{activeToolResults\}/);
  assert.match(upstreamChatWindow, /<StreamingReply store=\{streamingStore\}[\s\S]*?toolResults=\{toolResultsMap\}/);
});

test("扩展的 confirm 提示按 markdown 渲染（f4a700dc / #699）", () => {
  assert.match(chatWindow, /const focusFirstOption = useCallback\(\(element: HTMLDivElement \| null\) => element\?\.focus\(\), \[\]\);/);
  assert.match(chatWindow, /role="button"\s*\n\s*tabIndex=\{0\}\s*\n\s*data-extension-option\s*\n\s*aria-label=\{option\}/);
  assert.match(chatWindow, /<div inert>\s*\n\s*<MarkdownBody>\{option\}<\/MarkdownBody>/);
  assert.match(chatWindow, /querySelectorAll<HTMLElement>\("\[data-extension-option\]"\)/);
  assert.match(upstreamChatWindow, /querySelectorAll<HTMLElement>\("\[data-extension-option\]"\)/);
});

test("运行中回合显示推理等级（3f07a5ff / #777）—— 缺口：推理控件在替换件 ChatInput", () => {
  // 该提交的 2 行 ChatWindow 改动只是把 hook 的 isAutoThinkingSelection 转交下游
  // ChatInput；渲染逻辑全部在替换件 ChatInput.tsx 里（另属一份替换件）。
  // 本侧只钉「基础层 hook 已导出、上游 ChatWindow 已传、PowerI 未传」这个事实。
  assert.match(upstreamChatWindow, /isAutoThinkingSelection=\{isAutoThinkingSelection\}/);
  assert.doesNotMatch(chatWindow, /isAutoThinkingSelection=\{isAutoThinkingSelection\}/, "占位：ChatInput 替换件接上后才成立");
  assert.doesNotMatch(chatInput, /isAutoThinkingSelection/, "PowerI ChatInput 替换件仍无此 prop（本条保持 pending）");
});

test("终端二维码/条码在通知里保持等宽对齐（e7415ea9 / #755）", () => {
  // pre-line 会把连续空格折叠，UI 字体让空格与方块不同宽、1.5 行高撑开行距，
  // qrcode-terminal 画出来的二维码就散了。
  assert.match(chatWindow, /import \{ splitNoticeText \} from "@\/lib\/notice-text"/);
  assert.match(chatWindow, /splitNoticeText\(notice\.message\)\.map\(\(part, partIndex\) => part\.kind === "art" \?/);
  assert.match(chatWindow, /fontFamily: "Menlo, Consolas, 'DejaVu Sans Mono', monospace",\s*\n\s*lineHeight: 1,/);
  assert.match(upstreamChatWindow, /splitNoticeText\(notice\.message\)/);
});

test("自定义面板逐键不再重渲染全部答案（06991071 / #1005）", () => {
  // 每次按键都会重渲染 ChatWindow，而分组回合每次给 MessageView 新副本，
  // 破坏了 memo，可见答案的 markdown 就重跑一遍。副本按存储消息缓存。
  assert.match(chatWindow, /import \{ getFinalAnswerViews, keepWrittenFiles, type FinalAnswerViews \} from "@\/lib\/turn-views"/);
  assert.match(chatWindow, /const finalAnswerViewCache = useMemo\(\(\) => new WeakMap<AssistantMessage, FinalAnswerViews>\(\), \[\]\)/);
  assert.match(chatWindow, /const finalViews = getFinalAnswerViews\(finalAnswerViewCache, messages\[finalAssistantIdx\] as AssistantMessage\)/);
  assert.match(chatWindow, /const finalAnswerMessage = finalViews\.answer;/);
  assert.match(chatWindow, /const message = processIdx === finalAssistantIdx \? finalViews\.process : processMessage;/);
  assert.match(chatWindow, /keepWrittenFiles\(finalViews, extractTurnWrittenFiles\(/);
  assert.match(upstreamChatWindow, /getFinalAnswerViews\(finalAnswerViewCache/);
});

test("处理详情折叠摘要不再重复文字标题（56f71d99 / 上游 fold summary 简化）", () => {
  // 折展箭头已经表达「可折叠」，屏幕阅读器靠 aria-label 拿全名。
  assert.match(chatWindow, /const parts = \[`\$\{messageCount\} \$\{t\(messageCount === 1 \? "chat\.message" : "chat\.messages"\)\}`\];/);
  assert.match(chatWindow, /aria-label=\{\[t\("chat\.processDetails"\), \.\.\.parts\]\.join\(" · "\)\}/);
  assert.match(upstreamChatWindow, /aria-label=\{\[t\("chat\.processDetails"\), \.\.\.parts/);
});

test("回合进行中允许 fork 与「问在新会话」（19774b84 / #1023 的 ChatWindow 半份）", () => {
  // rpc-manager 的 fork 只拒绝运行中的 `!` shell：它另开 SessionManager 复制文件，
  // 不动运行中的 AgentSession。ChatWindow 若继续用 sessionBusy 挡，就白白禁用了能力。
  assert.match(chatWindow, /onFork=\{bashRunning \|\| isNew \|\| \(idx === 0 && msg\.role === "user"\) \? undefined : handleFork\}/);
  assert.match(chatWindow, /\{onAskInNewChat && quotedSelection\.sourceEntryId && !bashRunning && \(/);
  assert.match(rpcManager, /Cannot fork while a shell command is running/);
  assert.match(upstreamChatWindow, /onFork=\{bashRunning \|\| isNew \? undefined : handleFork\}/);
});

test("工具结束与音频持有回调经 ChatWindow 转交 hook（4ad8aa31 / d1529d04 的 ChatWindow 半份）", () => {
  // 两者都要 ChatWindow 声明 prop 并转交 useAgentSession / 挂一个 effect；
  // 壳侧（poweri/layout/AppShell.tsx）接线不在本 lane。
  assert.match(chatWindow, /onToolEnd\?: \(toolName: string\) => void;/);
  assert.match(chatWindow, /onAgentEnd: wrappedOnAgentEnd, onToolEnd, onAttentionNeeded/);
  assert.match(chatWindow, /holdAudio\?: \(\) => \(\) => void;/);
  assert.match(
    chatWindow,
    /useEffect\(\(\) => \{\s*\n\s*if \(!agentRunning \|\| !holdAudio\) return;\s*\n\s*return holdAudio\(\);\s*\n\s*\}, \[agentRunning, holdAudio\]\);/,
  );
  assert.match(upstreamChatWindow, /onAgentEnd: wrappedOnAgentEnd, onToolEnd, onAttentionNeeded/);
});

test("/mcp 打开设置：ChatWindow 半份已接线（ce615e7c）", () => {
  assert.match(chatWindow, /onOpenSettings\?: \(section: SettingsSection\) => void;/);
  assert.match(chatWindow, /onOpenSettings,\s*\n\s*deferInitialScroll: Boolean\(pendingScrollRestore\),/);
  assert.match(upstreamChatWindow, /onOpenSettings,\s*\n\s*deferInitialScroll/);
});

test("会话级 fork/命名与历史编辑：ChatWindow 半份依赖替换件 MessageView（585d56c2 / 7303179c）—— 保持 pending", () => {
  // 上游把「分叉入口」和「历史编辑」的判定搬到了 MessageView 的新 props
  // （onEditContent(message, entryId) + cancelEdit + isEditing）。PowerI 的
  // MessageView 仍是旧 API（onNavigate + prevAssistantEntryId），端口需要先改它。
  // 旧 API（onNavigate + prevAssistantEntryId，点击即导航）仍在替换件里：
  // 直接接上游的 new API 会让历史编辑退回「点一下就落盘」的旧缺陷。
  assert.match(messageView, /onNavigate\?: \(entryId: string\) => void;/);
  assert.match(messageView, /prevAssistantEntryId\?: string;/);
  assert.doesNotMatch(messageView, /onEditContent\?: \(message: UserMessage, entryId: string\) => void;/);
  assert.match(upstreamMessageView, /onEditContent\?: \(message: UserMessage, entryId: string\) => void;/);
});

test("压缩摘要/子代理结束之后的流式段落仍有锚点（0611857d）", () => {
  // 注释原先只说压缩摘要；子代理完成消息同样会插在最后一条 user 之后。
  assert.match(chatWindow, /\/\/ Anchor for live-tail detection\. A compaction summary or subagent\n\s*\/\/ completion can sit after the last user message and own the\n\s*\/\/ still-streaming segment\. lastUserIdx stays the scroll target\./);
  assert.match(upstreamChatWindow, /A compaction summary or subagent/);
});

test("扩展弹窗排队时的提示音只在「从无到有」响一次（70470cab / #883）", () => {
  // 队首被回答后下一个立刻顶上，若按键去重，排队的每个都会再响一次。
  assert.match(chatWindow, /const extensionDialogShownRef = useRef\(false\);/);
  assert.match(chatWindow, /const surfaced = Boolean\(extensionDialog\) && !extensionDialogShownRef\.current;/);
  assert.match(chatWindow, /extensionDialogShownRef\.current = Boolean\(extensionDialog\);/);
  assert.match(chatWindow, /<ExtensionDialog key=\{extensionDialog\.id\} request=\{extensionDialog\} waitingCount=\{waitingExtensionDialogCount\}/);
  assert.match(chatWindow, /<ExtensionCustomPanel key=\{extensionCustomUi\.id\} request=\{extensionCustomUi\} waitingCount=\{waitingExtensionCustomUiCount\}/);
  assert.match(upstreamChatWindow, /const extensionDialogShownRef = useRef\(false\);/);
});
