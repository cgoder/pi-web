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
// 包索引的 `Prism` 构建在模块求值时就 import refractor/all（约 300 种语言），
// 每次页面加载都要付这个代价；改用深导入的 PrismLight 后语言才成为独立 chunk。
test("MermaidBlock renders through the core-only PrismLight, not the all-languages Prism build", () => {
  assert.match(source, /import SyntaxHighlighter from "react-syntax-highlighter\/dist\/esm\/prism-light"/);
  assert.doesNotMatch(source, /\{ Prism as SyntaxHighlighter \} from "react-syntax-highlighter"/);
  assert.doesNotMatch(source, /from "react-syntax-highlighter"\s*;/);
});

test("CodeBlock waits for the Prism languages before it highlights", () => {
  assert.match(source, /import \{ usePrismLanguages \} from "@\/hooks\/usePrismLanguages"/);
  assert.match(source, /import \{ prismLanguagesLoaded \} from "@\/lib\/prism-languages"/);
  // 首帧就判定：语言未就绪时不能把 highlighted 置真，否则渲染出无高亮的成品。
  assert.match(source, /useState\(\s*\(\) => !isStreaming && prismLanguagesLoaded\(\)/);
  // 语言就绪是延后高亮的前置条件（与 M03 的预算组合）。
  assert.match(source, /if \(isStreaming \|\| highlighted \|\| !languagesReady\) return;/);
});

test("CodeBlock starts the language load with its first render, streaming or not", () => {
  // `usePrismLanguages()` 默认 enabled=true：调用处不得传条件参数，
  // 否则流式期间不会启动加载，回复结束后才补高亮。
  assert.match(source, /\n  const languagesReady = usePrismLanguages\(\);\n/);
});

// ---- 源码级守卫：浅色主题的双重边框（上游 cfcf2a1a） ----
// vs 主题给 <pre> 自己加了 1px #ddd 边框，外层容器已经画了框，叠成两圈。
test("CodeBlock drops the light theme's own border inside the wrapper", () => {
  // 只看高亮器那一支的 customStyle：边框必须被显式抹掉。
  const start = source.indexOf("<SyntaxHighlighter");
  const customStyle = source.slice(source.indexOf("customStyle={{", start), source.indexOf("codeTagProps={{ ", start));
  assert.match(customStyle, /border: "none"/);
});

// ---- 源码级守卫：高亮预算与延迟高亮（上游 b2b6a45b） ----
test("CodeBlock takes its highlight budget and defers what exceeds it", () => {
  assert.match(
    source,
    /import \{ takeHighlightBudget, waitForHighlight \} from "@\/lib\/highlight-queue"/,
    "未接基础层的高亮预算",
  );
  // 首帧判定必须同时满足「语言就绪」与「预算允许」，缺任一项会渲染出无高亮的成品、
  // 或把一整段长回复的全部代码块塞进同一个 task。
  assert.match(source, /useState\(\s*\(\) => !isStreaming && prismLanguagesLoaded\(\) && takeHighlightBudget\(code\.length\),?\s*\)/);
  // 超预算的块不是永久纯文本：轮到一个 idle slice 时由 waitForHighlight 补上。
  assert.match(source, /return waitForHighlight\(\(\) => setHighlighted\(true\)\);/);
});

function renderMermaid(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MermaidBlock, props),
    ),
  );
}

function renderCode(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(CodeBlock, props),
    ),
  );
}

// PrismLight 是 core-only，语言注册是一次性的全局状态；渲染类测试按状态分两段，
// 本段必须在任何 loadPrismLanguages() 之前跑。
test("CodeBlock renders the same numbered lines without tokens until the Prism languages load", () => {
  const html = renderCode({ code: "const x = 1;\nlet y = 2;", lang: "javascript" });

  assert.doesNotMatch(html, /class="token/);
  assert.equal(html.match(/react-syntax-highlighter-line-number/g)?.length, 2);
  assert.match(html, /const x = 1;/);
});

test("CodeBlock owns the pre background without a competing shorthand", () => {
  // 上游 e2ea7da3：vs 用 backgroundColor，vscDarkPlus 用 background 简写；
  // 只覆盖一个，切换主题时另一个会顶回来。两种渲染分支都要由 backgroundColor 持有。
  for (const isStreaming of [false, true]) {
    const html = renderCode({ code: "const x = 1;", lang: "javascript", isStreaming });
    const pre = html.match(/<pre\b[^>]*>/)?.[0];
    assert.ok(pre);
    assert.match(pre, /background-color:color-mix/);
    assert.doesNotMatch(pre, /(?:[;"]|^)background:/);
  }
});

test("CodeBlock highlights code when not streaming", async () => {
  await loadPrismLanguages();
  const html = renderCode({ code: "const x = 1;", lang: "javascript" });

  assert.match(html, /class="token/);
  assert.match(html, /const/);
});

test("CodeBlock renders plain text without tokenization while streaming", () => {
  // 高亮一个正在增长的块会每个 chunk 重新 tokenize 全部内容，是流式渲染里最贵的一步。
  const html = renderCode({ code: "const x = 1;", lang: "javascript", isStreaming: true });

  assert.doesNotMatch(html, /class="token/);
  assert.match(html, /const x = 1;/);
});

test("a finished block past the task budget keeps its lines, numbers and box but not its colors", () => {
  // 一块超过整个 task 额度（HIGHLIGHT_TASK_BUDGET）的代码永远拿不到预算，
  // 与全局剩余额度无关，所以这条断言不依赖测试执行顺序。
  const code = "const value = 1;\n".repeat(200);
  assert.ok(code.length > 2_000);

  const html = renderCode({ code, lang: "javascript" });

  assert.doesNotMatch(html, /class="token/, "超预算的块先以纯文本渲染");
  // 盒子不变：行号与内容都在，拿到颜色时尺寸不会跳。
  assert.match(html, /react-syntax-highlighter-line-number/);
  assert.match(html, /const value = 1;/);
});

// Simple sequenceDiagram for testing
const mermaidSrc = `sequenceDiagram
    Alice->>Bob: Hello
    Bob-->>Alice: Hi`;

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

test("MermaidBlock handles Chinese characters in diagram", () => {
  const chineseMermaid = `sequenceDiagram
    participant PC as PC客户端
    PC->>SV: 请求登录`;

  const html = renderMermaid({ code: chineseMermaid, defaultPreview: true });

  assert.doesNotMatch(html, /mermaid-block-error/);
  assert.match(html, /mermaid-block/);
});
