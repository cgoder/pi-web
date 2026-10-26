// PowerI 文件标签条（TabBar 替换件）回归测试。
//
// 与上游 components/TabBar.test.mjs 同一形态：jiti + renderToStaticMarkup，
// 断言渲染出的 DOM 契约（role / aria / 内联样式），不测 JSX 行号与文案。
//
// 为什么 PowerI 需要自己一份：上游测试只覆盖上游 components/TabBar.tsx；
// 替换件是独立实现，上游修复不会自动落到这里（见 docs/desktop/replacements.json）。

import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { TabBar } = await jiti.import("./TabBar.tsx");

function makeTabs(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `t${index}`,
    label: `file-${index}.ts`,
    filePath: `/p/file-${index}.ts`,
  }));
}

function renderTabBar(count, extra = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(TabBar, {
        tabs: makeTabs(count),
        activeTabId: "t0",
        onSelectTab() {},
        onCloseTab() {},
        ...extra,
      }),
    ),
  );
}

/** 所有带内联样式的 <div> 的样式声明表，按文档顺序。第 0 个是标签条容器。 */
function divStyles(html) {
  return [...html.matchAll(/<div [^>]*style="([^"]*)"/g)].map(([, style]) =>
    Object.fromEntries(
      style
        .split(";")
        .filter(Boolean)
        .map((declaration) => {
          const colon = declaration.indexOf(":");
          return [declaration.slice(0, colon), declaration.slice(colon + 1)];
        }),
    ),
  );
}

// ---- T01（bf0730c1）：溢出标签不被滚动条顶出 36px 视口 ----

test("T01 溢出时标签填满滚动视口上方，而不是被顶出可视区", () => {
  // 标签溢出后应用自带的 10px（触控 6px）滚动条要在 36px 条内占高度；
  // 写死 36px 且贴底对齐的标签项会被推过条顶、顶部被裁掉（#1225）。
  const [list, ...tabs] = divStyles(renderTabBar(12));
  assert.equal(list.height, "36px", "标签条总高度必须固定 36px");
  assert.equal(list["overflow-x"], "auto");
  assert.equal(list["overflow-y"], "hidden", "纵向溢出必须裁剪，否则被顶出的部分还能滚回来");
  assert.equal(list["align-items"], "stretch", "标签项要拉伸填满滚动条上方的剩余空间");

  assert.equal(tabs.length, 12);
  for (const tab of tabs) {
    assert.equal(tab.height, undefined, "标签项不得再各自写死 36px，否则与滚动条叠加后溢出");
    assert.equal(tab["align-items"], "center", "拉伸后内容仍要垂直居中");
  }
});
