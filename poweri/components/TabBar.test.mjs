// PowerI 文件标签条（TabBar 替换件）回归测试。
//
// 与上游 components/TabBar.test.mjs 同一形态：jiti + renderToStaticMarkup，
// 断言渲染出的 DOM 契约（role / aria / 内联样式），不测 JSX 行号与文案。
//
// 为什么 PowerI 需要自己一份：上游测试只覆盖上游 components/TabBar.tsx；
// 替换件是独立实现，上游修复不会自动落到这里（见 docs/desktop/replacements.json）。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// ---- T02（f4adfd04）：高度恒定 36px + 滚轮横向滚动 -------

test("T02 隐藏滚动条外观但保留滚动，滚轮接管横向滚动", () => {
  // 隐藏滚动条与接管滚轮是一对：只隐藏会让没有横向滚动条可拖的鼠标用户彻底没法滚。
  const html = renderTabBar(12);
  // 容器挂了隐藏滚动条的 class（规则在基础层 app/globals.css，上游 f4adfd04），
  // 属性输出顺序不作约束，只钉住 class 在不在。
  assert.match(html, /<div [^>]*\bclass="tabbar-scroll"/, "容器要挂上隐藏滚动条的 class（规则在上游 globals.css）");
  const source = readFileSync(new URL("./TabBar.tsx", import.meta.url), "utf8");
  assert.match(source, /list\.addEventListener\("wheel", onWheel, \{ passive: false \}\)/,
    "必须非 passive 监听 wheel：横向滚动时页面不得同时滚动");
  assert.match(source, /list\.scrollLeft \+= event\.deltaY \*/,
    "纵向滚动量要转成横向位移");
  assert.match(source, /event\.deltaMode === 1 \? 16/, "行模式（Firefox）要换算成像素");
  assert.match(source, /Math\.abs\(event\.deltaY\) <= Math\.abs\(event\.deltaX\)/,
    "用户本来就横向滚（触控板横扫）时让浏览器自己处理，不要重复位移");
  assert.match(source, /list\.scrollWidth <= list\.clientWidth/,
    "未溢出时不要 preventDefault，否则页面在条上滚不动");
});

test("T02 激活标签滚入可视区，且只移动标签条本身", () => {
  const source = readFileSync(new URL("./TabBar.tsx", import.meta.url), "utf8");
  // scrollIntoView 会连带滚动外围面板；只改 scrollLeft 才能只移动标签条。
  assert.doesNotMatch(source, /\.scrollIntoView\(/, "不得用 scrollIntoView，它会连带滚动周围面板");
  assert.match(source, /\[activeTabId, tabs\.length\]/, "切换/新开标签时要重新滚入视野");
});
