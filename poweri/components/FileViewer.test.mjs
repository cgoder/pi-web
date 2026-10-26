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
  const fetchContent = new Function(
    "useCallback", "sourceSessionId", "contentRequestRef", "setError", "setData",
    "getFileApiUrl", "fetch",
    outputText,
  )(
    (fn) => fn,
    null,
    { current: 0 },
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
  return { fetchContent, requests, state };
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
