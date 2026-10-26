import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "MermaidBlock.tsx"), "utf8");

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { MermaidBlock, CodeBlock } = await jiti.import("./MermaidBlock.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { loadPrismLanguages } = await jiti.import("@/lib/prism-languages");

// ---- 源码级守卫：复制必须走 copyToClipboard（原生剪贴板插件优先），禁止退回 lib/clipboard ----
// 背景（Windows v0.2.4 反馈）：代码框右上角「复制」在 WebView2 跨源 iframe 里被
// Permissions Policy 拒绝（NotAllowedError），lib/clipboard#copyText 无兜底且调用方无 catch。
test("CodeBlock copy uses the hardened copyToClipboard, not lib/clipboard", () => {
  assert.match(source, /import \{ copyToClipboard \} from "@\/poweri\/lib\/file-actions"/);
  assert.doesNotMatch(source, /@\/lib\/clipboard/);
  assert.match(source, /copyToClipboard\(code\)\.then/);
  assert.match(source, /\.catch\(/);
});

// ---- 源码级守卫：Prism 语言按需加载（上游 046bc67e） ----
// 包索引的 `Prism` 构建在模块求值时就 import refractor/all（约 300 种语言）；
// 改用深导入的 PrismLight 后，语言才成为独立 chunk，首次有高亮需求时才加载。
test("MermaidBlock renders through the core-only PrismLight, not the all-languages Prism build", () => {
  assert.match(source, /import SyntaxHighlighter from "react-syntax-highlighter\/dist\/esm\/prism-light"/);
  assert.doesNotMatch(source, /\{ Prism as SyntaxHighlighter \} from "react-syntax-highlighter"/);
  assert.doesNotMatch(source, /from "react-syntax-highlighter"\s*;/);
});

test("CodeBlock waits for the Prism languages before it highlights", () => {
  assert.match(source, /import \{ usePrismLanguages \} from "@\/hooks\/usePrismLanguages"/);
  assert.match(source, /import \{ prismLanguagesLoaded \} from "@\/lib\/prism-languages"/);
  // 首帧就判定：语言未就绪时不能把 highlighted 置真，否则渲染出无高亮的成品。
  assert.match(source, /useState\(\(\) => !isStreaming && prismLanguagesLoaded\(\)\)/);
  // 语言就绪是延后高亮的前置条件（与 M03 的预算组合后）。
  assert.match(source, /if \(isStreaming \|\| highlighted \|\| !languagesReady\) return;/);
});

test("CodeBlock starts the language load with its first render, streaming or not", () => {
  // `usePrismLanguages()` 默认 enabled=true：调用处不得传条件参数，
  // 否则流式期间不会启动加载，回复结束时才补高亮。
  assert.match(source, /\n  const languagesReady = usePrismLanguages\(\);\n/);
});

// ---- 源码级守卫：浅色主题的双重边框与主题切换背景（上游 cfcf2a1a + e2ea7da3） ----
// vs 主题给 <pre> 自己加了 1px #ddd 边框，外层容器已经画了框，叠成两圈。
test("CodeBlock drops the light theme's own border inside the wrapper", () => {
  // 只看高亮器那一支的 customStyle：边框必须被显式抹掉。
  const start = source.indexOf("<SyntaxHighlighter");
  const customStyle = source.slice(source.indexOf("customStyle={{", start), source.indexOf("codeTagProps={{ ", start));
  assert.match(customStyle, /border: "none"/);
});

test("CodeBlock owns the pre background without a competing shorthand", () => {
  for (const isStreaming of [false, true]) {
    const html = renderCode({ code: "const x = 1;", lang: "javascript", isStreaming });
    const pre = html.match(/<pre\b[^>]*>/)?.[0];
    assert.ok(pre);
    assert.match(pre, /background-color:color-mix/);
    assert.doesNotMatch(pre, /(?:[;"]|^)background:/);
  }
});

// Simple sequenceDiagram for testing
const mermaidSrc = `sequenceDiagram
    Alice->>Bob: Hello
    Bob-->>Alice: Hi`;

function renderMermaid(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MermaidBlock, props),
    ),
  );
}

test("MermaidBlock renders source by default", () => {
  const html = renderMermaid({ code: mermaidSrc });

  assert.match(html, />Preview</);
  assert.match(html, /Alice/);
  assert.doesNotMatch(html, /mermaid-block-loading/);
});

test("MermaidBlock can render preview by default", () => {
  const html = renderMermaid({ code: mermaidSrc, defaultPreview: true });

  assert.match(html, />Source</);
  assert.match(html, /mermaid-block-loading/);
  assert.doesNotMatch(html, /Alice/);
});

test("MermaidBlock with isStreaming falls back to source view", () => {
  const html = renderMermaid({ code: mermaidSrc, isStreaming: true, defaultPreview: true });

  assert.match(html, /disabled/);
  assert.match(html, />Preview</);
  assert.match(html, /Alice/);
  assert.match(html, /-&gt;&gt;/);
});

test("MermaidBlock renders empty graph without error", () => {
  const html = renderMermaid({ code: "graph TD", defaultPreview: true });

  assert.doesNotMatch(html, /mermaid-block-error/);
  assert.match(html, /mermaid-block-loading/);
});

function renderCode(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(CodeBlock, props),
    ),
  );
}

// 必须在亮语言的测试之前：PrismLight 是 core-only，语言注册是一次性全局状态。
test("CodeBlock renders the same numbered lines without tokens until the Prism languages load", () => {
  const html = renderCode({ code: "const x = 1;\nlet y = 2;", lang: "javascript" });

  assert.doesNotMatch(html, /class="token/);
  assert.equal(html.match(/react-syntax-highlighter-line-number/g)?.length, 2);
  assert.match(html, /const x = 1;/);
});

test("CodeBlock highlights code when not streaming", async () => {
  await loadPrismLanguages();
  const html = renderCode({ code: "const x = 1;", lang: "javascript" });

  assert.match(html, /class="token/);
  assert.match(html, /const/);
});

test("CodeBlock renders plain text without tokenization while streaming", () => {
  const html = renderCode({ code: "const x = 1;", lang: "javascript", isStreaming: true });

  assert.doesNotMatch(html, /class="token/);
  assert.match(html, /const x = 1;/);
});

test("MermaidBlock handles Chinese characters in diagram", () => {
  const chineseMermaid = `sequenceDiagram
    participant PC as PC客户端
    PC->>SV: 请求登录`;

  const html = renderMermaid({ code: chineseMermaid, defaultPreview: true });

  assert.doesNotMatch(html, /mermaid-block-error/);
  assert.match(html, /mermaid-block/);
});
