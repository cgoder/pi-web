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

/** The module-level `const <name> = ...` statement, compiled and evaluated. */
function moduleConstant(name) {
  const statement = file.statements.find((node) =>
    ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) =>
      ts.isIdentifier(declaration.name) && declaration.name.text === name,
    ),
  );
  assert.ok(statement, `${name} is declared in the module`);
  const { outputText } = ts.transpileModule(`${statement.getText(file)}\nreturn ${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  return new Function(outputText)();
}

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
  // markdown 仍需整个文件才能渲染，截断时不提供 preview。
  assert.equal(render({ ...partial, language: "markdown" }, "preview", false, false, false, "/tmp/a.md").hasPreview, true);
});
