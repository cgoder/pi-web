// 上游 246c1f20：diff 的 gap 行（hunk 间被略去的未改行）要渲染成「⋯ N 行」标记，
// 不再静默丢弃。MessageView（SplitDiff）与 FileViewer（unified 折叠段）两侧都验。
import assert from "node:assert/strict";
import { test } from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

/** 一个跨越 hunk 边界、中间带 gap 的 unified patch。 */
const PATCH_WITH_GAP = [
  "--- a/sample.txt",
  "+++ b/sample.txt",
  "@@ -1,3 +1,3 @@",
  " alpha",
  "-beta",
  "+BETA",
  " gamma",
  "",
  "@@ -40,3 +40,3 @@",
  " omega",
  "-psi",
  "+PSI",
  " chi",
].join("\n");

test("MessageView SplitDiff 把 gap 行渲染成「⋯ N 行」标记（上游 246c1f20）", async () => {
  const { parseUnifiedPatch } = await jiti.import("@/lib/patch");
  const files = parseUnifiedPatch(PATCH_WITH_GAP);
  assert.ok(files, "patch 可解析");
  const gapRows = files[0].rows.filter((r) => r.type === "gap");
  assert.equal(gapRows.length, 1, "hunk 之间恰好一条 gap");
  assert.equal(gapRows[0].count, 36, "gap.count = 被略去的行数（40-1-3=36）");
});

test("FileViewer diffLines 把 gap 计入折叠段数量（上游 246c1f20）", async () => {
  const React = await jiti.import("react");
  const { renderToStaticMarkup } = await jiti.import("react-dom/server");
  const mod = await jiti.import("@/poweri/components/FileViewer.tsx");
  const DiffView = mod.DiffView ?? mod.default?.DiffView;
  assert.ok(DiffView, "FileViewer 需导出 DiffView");
  const { I18nProvider } = await jiti.import("@/hooks/useI18n");
  const html = renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(DiffView, { patch: PATCH_WITH_GAP })),
  );
  assert.match(html, /行未改动|unchanged lines?/, "折叠段渲染 diff.unchangedLines 文案");
  assert.match(html, /36|⋯/, "折叠段数量含 gap 的 36 行（或未知标记 ⋯）");
});
