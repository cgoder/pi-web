// replaceLinksWithMarkdown 的 PowerI 侧回归测试。
//
// 上游 components/ChatInput.test.mjs 校验的是上游文件；PowerI 的替换件把
// handlePaste 整段重写（图片分支走 processIncomingFiles），上游断言无法覆盖。
// 这里用与上游相同的 jiti 加载方式钉住纯函数行为，不新增 e2e。

import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { replaceLinksWithMarkdown } = await jiti.import("./ChatInput.tsx");

const link = (label, href, occurrence = 0) => ({ label, href, occurrence });

test("把纯文本里出现的链接标签换成 Markdown 链接", () => {
  assert.equal(
    replaceLinksWithMarkdown("see the docs here", [link("the docs", "https://example.com/docs")]),
    "see [the docs](https://example.com/docs) here",
  );
});

test("同一标签出现多次时按 occurrence 定位", () => {
  assert.equal(
    replaceLinksWithMarkdown("Jobs:\nEngineer\nEngineer\nDone", [
      link("Engineer", "https://example.com/1"),
      link("Engineer", "https://example.com/2", 1),
    ]),
    "Jobs:\n[Engineer](https://example.com/1)\n[Engineer](https://example.com/2)\nDone",
  );
});

test("转义 label 与 href 里的 Markdown 元字符", () => {
  assert.equal(
    replaceLinksWithMarkdown("Read [this]", [link("[this]", "https://example.com/a_(b)")]),
    "Read [\\[this\\]](https://example.com/a_\\(b\\))",
  );
});

test("没有可还原的链接时返回 null，调用方据此不接管粘贴", () => {
  assert.equal(replaceLinksWithMarkdown("plain text", [link("missing", "https://example.com")]), null);
  assert.equal(replaceLinksWithMarkdown("plain text", []), null);
});
