// FileViewer 替换件的渲染分支回归测试。
//
// 为什么存在：上游 components/FileViewer.test.mjs 只校验上游文件；PowerI 的
// 替换件把分页、CSV 表格、HTML 大文件预览、gutter、主题背景等分支整段重写了，
// 上游的断言无法覆盖。这里按上游同一套做法（读源码 + 用 TypeScript 编译出
// 表达式再执行）钉住「能力在基础层、替换件没接线」这类缺口，不新增 e2e。
//
// 断言对象是外部可观察的渲染分支与数据形状，不是 JSX 行号或样式数值。

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("FileViewer.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** `TextFileViewer`'s own view calculations, executed without mounting the component. */
function viewCalculations() {
  // 每张票接入一个计算时无须改这里：只编译实际声明的那些。
  const names = [
    "isDelimitedTable", "viewerContent", "sourceLines", "language", "prismReady",
    "isHtml", "isMarkdown", "hasPreview", "effectiveDisplayMode", "useLightweightSource",
    "showLoadMore", "needsHtmlFull",
  ];
  const viewer = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "TextFileViewer");
  assert.ok(viewer, "TextFileViewer is declared");
  const declared = new Set();
  const calculations = viewer.body.statements.filter((node) =>
    ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => {
      const name = declaration.name.getText(file);
      if (!names.includes(name)) return false;
      declared.add(name);
      return true;
    }),
  ).map((node) => node.getText(file)).join("\n");
  const returned = [...declared].join(", ");

  const { outputText } = ts.transpileModule(`
    return (data, displayMode, hasGitDiff = false, isDeletedDiff = false, wrapLines = false, filePath = "/tmp/file.txt") => {
      const isDelimitedTablePath = (path) => /\\.(csv|tsv)$/i.test(path);
      const SOURCE_HIGHLIGHT_MAX_LINES = 1_000;
      const HTML_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;
      const usePrismLanguages = (enabled) => !enabled;
      const useMemo = (calculate) => calculate();
      ${calculations}
      return { ${returned} };
    };
  `, { compilerOptions: { jsx: ts.JsxEmit.React } });
  return new Function(outputText)();
}

test("CSV and TSV files preview as a table through the upstream leaf component", () => {
  assert.match(source, /import \{ DelimitedTable \} from "@\/components\/DelimitedTable"/, "须复用上游叶子组件，不得本地重写表格");
  assert.match(source, /import \{ isDelimitedTablePath \} from "@\/lib\/delimited-table"/, "须复用上游的扩展名判定");
  assert.match(source, /<DelimitedTable\b/);
  assert.match(source, /complete=\{!data\?\.truncated\}/, "分块加载的前缀也要出表，切掉的最后一条记录由解析器丢弃");
});

test("a .csv or .tsv file opens in preview and keeps source one click away", () => {
  const render = viewCalculations();
  for (const filePath of ["/tmp/data.csv", "/tmp/data.tsv", "/tmp/DATA.CSV"]) {
    const view = render({ content: "a,b\n1,2\n", language: "text", size: 8 }, "preview", false, false, false, filePath);
    assert.equal(view.isDelimitedTable, true, `${filePath} 应识别为分隔符表格`);
    assert.equal(view.hasPreview, true, `${filePath} 应有 preview 模式`);
    // 表格不参与「超长文件降级为轻量行」的判定。
    assert.equal(view.useLightweightSource, false);
  }
  // 非表格文件不受影响。
  assert.equal(render({ content: "a\n", language: "text", size: 2 }, "source", false, false, false, "/tmp/a.txt").isDelimitedTable, false);
});

test("a CSV table previews its loaded prefix without waiting for the whole file", () => {
  const render = viewCalculations();
  const partial = { content: "a,b\n1,2\n", language: "text", size: 900 * 1024, truncated: true, nextOffset: 256 * 1024 };
  assert.equal(render(partial, "preview", false, false, false, "/tmp/data.csv").hasPreview, true);
  // 表格视图不参与「超长文件降级为轻量行」的判定（否则会渲染成纯文本而非表格）。
  assert.equal(render(partial, "preview", false, false, false, "/tmp/data.csv").useLightweightSource, false);
  // markdown 仍需整个文件才能渲染（上游 0e712013），截断时不提供 preview。
  assert.equal(render({ ...partial, language: "markdown" }, "preview", false, false, false, "/tmp/a.md").hasPreview, false);
});

// ---- F02 大文件分页与「加载更多」 ----

/** `TextFileViewer`'s own `fetchContent`, compiled with stubbed `fetch`/state. */
async function loadFetchContent(files) {
  const viewer = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "TextFileViewer");
  const statement = viewer.body.statements.find((node) =>
    ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) =>
      ts.isIdentifier(declaration.name) && declaration.name.text === "fetchContent",
    ),
  );
  assert.ok(statement, "fetchContent is declared");
  const { outputText } = ts.transpileModule(`${statement.getText(file)}\nreturn fetchContent;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const requests = [];
  const state = { data: null, error: null };
  const shownVersionRef = { current: null };
  const fetchContent = new Function(
    "useCallback", "sourceSessionId", "contentRequestRef", "shownVersionRef", "fileVersion",
    "setError", "setData", "getFileApiUrl", "fetch",
    outputText,
  )(
    (fn) => fn,
    null,
    { current: 0 },
    shownVersionRef,
    // 与基础层同形：size:mtime，缺任一项则为 null。
    (meta) => (typeof meta?.size === "number" && typeof meta?.mtime === "string" ? `${meta.size}:${meta.mtime}` : null),
    (error) => { state.error = error; },
    (update) => { state.data = typeof update === "function" ? update(state.data) : update; },
    (filePath, type, sessionId, params) => {
      // 与模块里真实 getFileApiUrl 一致：值为 undefined 的参数不写入。
      const search = new URLSearchParams({ type });
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value !== undefined) search.set(key, String(value));
      }
      return `/api/files/${filePath}?${search.toString()}`;
    },
    async (url) => {
      // 只从 URL 里取 offset；其余内容由测试用 files 给出。
      const offset = Number(new URL(url, "http://localhost").searchParams.get("offset") ?? 0);
      requests.push(offset);
      const body = files[offset];
      return { json: async () => body };
    },
  );
  return { fetchContent, requests, state, shownVersionRef };
}

test("fetchContent reads a block and reports how much of the file is left", async () => {
  const { fetchContent, requests, state } = await loadFetchContent({
    0: { content: "aaa", language: "text", size: 10, nextOffset: 3, truncated: true },
  });

  await fetchContent("/tmp/big.log");

  assert.deepEqual(requests, [0], "首次请求不带 offset");
  assert.equal(state.data.content, "aaa");
  assert.equal(state.data.nextOffset, 3);
  assert.equal(state.data.truncated, true);
});

test("fetchContent appends the next block instead of replacing the loaded one", async () => {
  const { fetchContent, requests, state } = await loadFetchContent({
    0: { content: "aaa", language: "text", size: 10, nextOffset: 3, truncated: true },
    3: { content: "bbb", language: "text", size: 10, nextOffset: 6, truncated: true },
    6: { content: "cc", language: "text", size: 8, nextOffset: 8, truncated: false },
  });

  await fetchContent("/tmp/big.log");
  await fetchContent("/tmp/big.log", 3);
  await fetchContent("/tmp/big.log", 6);

  // 追加而不是替换：滚回去看前面的行还在。
  assert.deepEqual(requests, [0, 3, 6]);
  assert.equal(state.data.content, "aaabbbcc");
  assert.equal(state.data.nextOffset, 8);
  assert.equal(state.data.truncated, false);
});

test("a failed chunk read surfaces the server's error and keeps what is loaded", async () => {
  const { fetchContent, state } = await loadFetchContent({
    0: { content: "aaa", language: "text", size: 10, nextOffset: 3, truncated: true },
    3: { error: "Invalid text preview offset" },
  });

  await fetchContent("/tmp/big.log");
  await fetchContent("/tmp/big.log", 3);

  assert.equal(state.data.content, "aaa");
  assert.equal(state.error, "Invalid text preview offset");
});

test("the Load more bar shows the loaded / total bytes and disables while loading", () => {
  assert.match(source, /t\("i18n\.loadMore"\)/, "文案走三语消息表，不在替换件里硬编码");
  assert.match(source, /t\("i18n\.loading"\)/);
  assert.match(source, /formatSize\(data\.nextOffset\)\} \/ \{formatSize\(data\.size\)\}/);
  assert.match(source, /disabled=\{loadingMore\}/);
  assert.match(source, /setLoadingMore\(true\)/);
});

// ---- F03 超 256KB 的 HTML 仍可预览 ----

test("a large HTML file previews whole while its source view stays chunked", () => {
  // 上游 93b3aba5：预览需要整份文档，源码视图仍旧分块。
  assert.match(source, /HTML_PREVIEW_MAX_BYTES/);
  assert.match(source, /const needsHtmlFull = displayMode === "preview"/);
  // 完整内容只在切到预览时拉，且走 download 的整份读取。
  assert.match(source, /getFileApiUrl\(filePath, "download", sourceSessionId\)/);
  assert.match(source, /setHtmlFull\(\{ text: await r\.text\(\) \}\)/);
  // 拉取未完成时给出 loading/错误提示，而不是空白 iframe。
  assert.match(source, /htmlFull\?\.error \?\? t\("i18n\.loading"\)/);
  // 预览已显示整份文件，此时「加载更多」只属于源码视图。
  assert.match(source, /const showLoadMore = !!data\?\.truncated && !\(isHtml && effectiveDisplayMode === "preview"\);/);
});

test("a partly loaded HTML file only counts as previewable within the cap", () => {
  const render = viewCalculations();
  const cap = 10 * 1024 * 1024;
  const partial = { content: "<p>hi</p>", language: "html", size: 900 * 1024, truncated: true, nextOffset: 256 * 1024 };

  assert.equal(render(partial, "preview").hasPreview, true, "超过单块但仍在 HTML 上限内应可预览");
  assert.equal(render({ ...partial, size: cap + 1 }, "preview").hasPreview, false, "超过上限只能看源码");
  assert.equal(render({ ...partial, truncated: false, size: cap + 1 }, "preview").hasPreview, true, "完整文件不受上限限制");
  // 源码视图的「加载更多」保留；预览视图持有整份文件，不应出现。
  assert.equal(render(partial, "source").showLoadMore, true);
  assert.equal(render(partial, "preview").showLoadMore, false);
});

test("the whole-file HTML fetch is skipped until preview is actually shown", () => {
  const render = viewCalculations();
  const partial = { content: "<p>hi</p>", language: "html", size: 900 * 1024, truncated: true, nextOffset: 256 * 1024 };

  assert.equal(render(partial, "preview").needsHtmlFull, true);
  assert.equal(render(partial, "source").needsHtmlFull, false, "未切预览时不发完整内容请求");
  assert.equal(render({ ...partial, truncated: false }, "preview").needsHtmlFull, false, "已完整时无需再拉");
  assert.equal(render({ ...partial, size: 11 * 1024 * 1024 }, "preview").needsHtmlFull, false, "超上限不拉（拉了也渲染不了）");
});

// ---- F06 行号栏固定 + 代码字体 ----

test("the gutter is pinned in the views whose row count is bounded", () => {
  // 上游 c713fcaa：sticky 行号在每次滚动（含竖向）都要浏览器重新定位，所以只给
  // 行数有上限的视图用：高亮的 Source 视图与同样短的 diff。
  assert.match(source, /const FILE_PINNED_LINE_NUMBER_STYLE: CSSProperties = \{/);
  assert.match(source, /position: "sticky",\n  left: 0,\n  zIndex: 1,/);
  // 高亮源码视图用固定版。
  const highlighted = source.slice(source.indexOf("const highlightedSource = useMemo("), source.indexOf("</SyntaxHighlighter>", source.indexOf("const highlightedSource = useMemo(")));
  assert.match(highlighted, /\.\.\.FILE_PINNED_LINE_NUMBER_STYLE/);
  // 超过上限的纯文本回退与更长的 diff 保持不固定。
  assert.match(source, /const lineNumberStyle = visible\.size <= SOURCE_HIGHLIGHT_MAX_LINES\n    \? FILE_PINNED_LINE_NUMBER_STYLE\n    : FILE_LINE_NUMBER_STYLE;/);
  assert.match(source, /const useLightweightSource = sourceLines\.length > SOURCE_HIGHLIGHT_MAX_LINES/);
});

test("the gutter repeats the code font's line box", () => {
  // 行号列与代码列必须共用一个行盒，否则行号会与代码行错位。
  const [codeStyle, gutterStyle] = (() => {
    const transpile = (name) => {
      const statement = file.statements.find((node) =>
        ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) =>
          ts.isIdentifier(declaration.name) && declaration.name.text === name,
        ),
      );
      assert.ok(statement, `${name} is declared in the module`);
      const { outputText } = ts.transpileModule(`${statement.getText(file)}\nreturn ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
      return new Function(outputText)();
    };
    return [transpile("FILE_CODE_STYLE"), transpile("FILE_LINE_NUMBER_STYLE")];
  })();

  const lineBox = codeStyle.fontSize * codeStyle.lineHeight;
  assert.equal(parseFloat(gutterStyle.lineHeight), lineBox, `行号列行高 ${gutterStyle.lineHeight} 必须等于代码字号 ${codeStyle.fontSize} × 行高 ${codeStyle.lineHeight}`);
  // 不引入新的 CSS 变量：字体仍走现有的 --font-mono 体系。
  assert.equal(codeStyle.fontFamily, "var(--font-mono)");
  assert.equal(gutterStyle.fontFamily, "var(--font-mono)");
  assert.equal(gutterStyle.lineHeight, "20.8px");
});

// ---- F07 主题切换时代码块背景正确（与 M02 同一根因） ----

test("the source view owns its background through backgroundColor, not the shorthand", () => {
  // 上游 e2ea7da3：vs 主题给 <pre> 用 backgroundColor，vscDarkPlus 用 background
  // 简写。customStyle 只覆盖其中一个时，切主题后另一个会顶回来（浅色下发暗、
  // 深色下发亮）。两种主题共用一个属性名才能都覆盖住。
  const start = source.indexOf("const highlightedSource = useMemo(");
  const customStyle = source.slice(source.indexOf("customStyle={{", start), source.indexOf("codeTagProps={{", start));

  assert.match(customStyle, /backgroundColor: "var\(--bg\)"/, "须用 backgroundColor 覆盖主题值");
  assert.doesNotMatch(customStyle, /(?:^|[\s{,])background:\s*"var\(--bg\)"/, "background 简写盖不住只设 backgroundColor 的主题");
});

// ---- F10 文件版本判重 + 隐藏页释放事件流 ----

test("every viewer compares the file's version before reloading it", () => {
  // 上游 70b2947c：切窗口回来、SSE 重连时若无条件重载，画面会闪，
  // 文本的 Load more 分块、媒体播放进度、PDF 的滚动位置全部丢失。
  // 修法是记住「屏幕上那一版」（size:mtime），重连时先比再决定是否重拉。
  assert.match(source, /import \{ fileVersion, fileVersionChanged \} from "@\/lib\/file-version"/);
  assert.match(source, /import \{ HIDDEN_PAGE_GRACE_MS, usePageHiddenFor \} from "@\/hooks\/usePageHidden"/);

  // 每类查看器各有一个版本 ref（文本、图片、音频、视频、文档）。
  assert.equal(
    source.match(/const shownVersionRef = useRef<string \| null>\(null\);/g)?.length,
    5,
    "五个查看器都要记住屏幕上的版本",
  );
  // 切换文件时清空（每个查看器一处），否则会拿上一个文件的版本去比；
  // 变更事件里也先清空再按事件载荷重设（四个带事件流的查看器）。
  assert.equal(source.match(/shownVersionRef\.current = null;/g)?.length, 9);

  // 内容读回时记下版本；读回完整内容才算数（分块追加时版本不变）。
  assert.match(source, /shownVersionRef\.current = fileVersion\(d\);/);
  // 变更事件里直接拿到新版本，省掉一次 meta 往返。
  assert.match(source, /shownVersionRef\.current = fileVersion\(d\);/);
});

test("a reconnect that finds the same size and mtime keeps what is loaded", () => {
  // 文本查看器的 connected：版本相同时只重读 diff（期间的提交会改它），
  // 不重读文件内容。
  assert.match(source, /const shown = shownVersionRef\.current;\n      if \(shown === null\) \{\n        synchronize\(\);\n        return;\n      \}/);
  assert.match(source, /if \(fileVersionChanged\(shownVersionRef\.current, fileVersion\(meta\)\)\) synchronize\(\);\n          else void fetchGitDiff\(filePath\);/);
  // 拿不到 meta（网络异常）就照旧重读，不能因为比不了版本而停在旧内容。
  assert.match(source, /\.catch\(\(\) => \{\n          if \(active\) synchronize\(\);\n        \}\);/);
});

test("a page hidden past the grace lets go of its file watch", () => {
  // #1283：一个浏览器连接一个查看器，几个后台标签页就能占满 HTTP/1.1 的六连接池。
  assert.match(source, /const pageHidden = usePageHiddenFor\(HIDDEN_PAGE_GRACE_MS\);/);
  assert.match(source, /const watchEnabled = watchRequested && !pageHidden;/);
  // 宽限期用基础层的值，不在替换件里另立一个。
  assert.doesNotMatch(source, /HIDDEN_PAGE_GRACE_MS\s*=|const HIDDEN_PAGE_GRACE_MS/);
});

// ---- F08 PDF `#page=` 页片段跳转（跨 FileViewer / TabBar / AppShell） ----

const tabBarSource = (await readFile(new URL("./TabBar.tsx", import.meta.url), "utf8"));
const appShellSource = (await readFile(new URL("../layout/AppShell.tsx", import.meta.url), "utf8"));
const tabStateSource = (await readFile(new URL("../../components/file-tab-state.ts", import.meta.url), "utf8"));

test("the file tab carries the page a link asked for", () => {
  // 基础层 components/file-tab-state.ts 已有 page 字段与 bumpRevision 逻辑，
  // 替换件的标签类型必须认得它，否则状态在传进 FileViewer 前就掉了。
  assert.match(tabStateSource, /page\?: number;/, "基础层 file-tab-state 保留 page 字段");
  assert.match(tabBarSource, /\/\*\* PDF page requested by the link that opened this tab \(`#page=N`\)\. \*\/\n  page\?: number;/);
  // 换页要重挂载查看器（iframe 的 URL 才会重算）。
  assert.match(tabStateSource, /const pageChanged = existing\.page !== input\.page;/);
  assert.match(tabStateSource, /if \(pageChanged\) \{\n      next\.page = input\.page;/);
});

test("the viewer appends the page fragment to a PDF's iframe URL", () => {
  assert.match(source, /import \{ parsePdfPageFragment, resolveLocalFileHref, shouldOpenLocalFileInApp \} from "@\/lib\/file-links"/);
  assert.match(source, /initialPage\?: number;/);
  // 只在 PDF 且页码合法时加片段；非 PDF 走原来的 preview URL。
  assert.match(source, /const pageFragment = isPdf && initialPage && initialPage > 0 \? `#page=\$\{initialPage\}` : "";/);
  assert.match(source, /`\$\{getFileApiUrl\(filePath, "read", sourceSessionId, bust \? \{ v: bust \} : undefined\)\}\$\{pageFragment\}`/);
  // 查看器内部的 markdown 预览链接同样透传页片段（上游 5e9b997d 的第二步）。
  assert.match(source, /onOpenFile\(linkedFile, parsePdfPageFragment\(href\) \?\? undefined\);/);
  assert.match(source, /onOpenFile\?: \(filePath: string, page\?: number\) => void;/);
});

test("AppShell passes the page from the link to the tab and to the viewer", () => {
  assert.match(appShellSource, /options\?: \{ sourceSessionId\?: string \| null; modeHint\?: "diff"; page\?: number \}/);
  assert.match(appShellSource, /const page = options\?\.page;/);
  assert.match(appShellSource, /openFileTab\(prev, \{\n      fileName,\n      filePath,\n      modeHint,\n      page,/);
  assert.match(appShellSource, /const handleOpenLinkedFile = useCallback\(\(filePath: string, page\?: number\) => \{/);
  assert.match(appShellSource, /initialPage=\{activeFileTab\.page\}/);
  assert.match(appShellSource, /onOpenFile=\{\(filePath, page\) => handleOpenFile\(/);
});

test("the chat path carries the page too, so both entries open the same page", () => {
  // 聊天里的链接经 MarkdownBody → MessageView → ChatWindow → AppShell 才到查看器，
  // 中间任何一层的签名漏掉 page，页码都会在到达 FileViewer 前掉掉。
  const markdownBodySource = readFileSync(new URL("./MarkdownBody.tsx", import.meta.url), "utf8");
  const messageViewSource = readFileSync(new URL("./MessageView.tsx", import.meta.url), "utf8");

  assert.match(markdownBodySource, /openFile\(filePath, parsePdfPageFragment\(href\) \?\? undefined\);/);
  assert.match(markdownBodySource, /onOpenFile\?: \(filePath: string, page\?: number\) => void;/);
  // MessageView 的每一层（Props、各视图、BlockView、TextBlock）都要带 page。
  assert.doesNotMatch(messageViewSource, /onOpenFile\?: \(filePath: string\) => void;/);
  assert.match(messageViewSource, /onOpenFile\?: \(filePath: string, page\?: number\) => void;/);
});
