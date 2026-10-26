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

// ---- T03（9290c272 无障碍部分）：tablist / tab / aria-selected / roving tabindex ----
// 上游那条提交把工作区终端标签与无障碍改进打包在一起。PowerI 的 Tab 接口没有
// kind 字段，结构上承载不了终端标签（属终端集成 spec），所以这里只钉无障碍契约：
// 不得出现 kind / closing / tabLabel，也不得塞终端图标分支。

test("T03 标签条是 tablist，每个标签是 tab 且带 aria-selected", () => {
  const html = renderTabBar(3);
  assert.match(html, /<div role="tablist"/, "标签条容器需要 tablist 角色，屏幕阅读器才会按标签组播报");
  assert.match(html, /<div role="tablist" aria-label="[^"]+"/, "tablist 需要可读名称，否则只播报「标签组」");

  const tabs = html.match(/role="tab"/g) ?? [];
  assert.equal(tabs.length, 3);
  // 激活项 aria-selected=true，其余 false：这是「已选/未选」的唯一来源。
  assert.match(html, /role="tab" aria-label="file-0\.ts" aria-selected="true"/);
  assert.equal((html.match(/aria-selected="false"/g) ?? []).length, 2);
});

test("T03 roving tabindex：Tab 键在标签条内只停一次", () => {
  const html = renderTabBar(3);
  const order = [...html.matchAll(/role="tab"[^>]*tabindex="(-?\d)"/g)].map(([, value]) => value);
  assert.deepEqual(order, ["0", "-1", "-1"], "只有激活标签进入 Tab 顺序");
});

test("T03 无激活标签时第一个标签仍可取焦", () => {
  // activeTabId="" 是 Panel 尚无激活项的常态（AppShell 传 null ?? ""）。
  const html = renderTabBar(3, { activeTabId: "" });
  const order = [...html.matchAll(/role="tab"[^>]*tabindex="(-?\d)"/g)].map(([, value]) => value);
  assert.deepEqual(order, ["0", "-1", "-1"], "否则整条标签条会从 Tab 顺序里消失，键盘无法进入");
});

test("T03 方向键在标签间移动选中与焦点", () => {
  const source = readFileSync(new URL("./TabBar.tsx", import.meta.url), "utf8");
  assert.match(source, /\["ArrowLeft", "ArrowRight", "Home", "End"\]\.includes\(event\.key\)/,
    "左右方向键与 Home/End 都要处理");
  // 方向键要「选中 + 焦点」一起走：只移动焦点会让下一次按键落在旧标签上。
  const handlerStart = source.indexOf("const handleTabKeyDown");
  const handler = source.slice(handlerStart, source.indexOf("\n  };", handlerStart));
  assert.match(handler, /onSelectTab\(/, "方向键要连带切换选中项，而不是只移动焦点");
  assert.match(handler, /\.focus\(/, "方向键之后要把焦点移到目标标签");
  assert.match(handler, /% tabs\.length/, "左右方向键要循环，到头绕回另一端");
  // 关闭按钮里的按键冒泡到标签上时不能劫持（close 按钮自己处理 Enter/Space）。
  assert.match(source, /if \(event\.target !== event\.currentTarget\) return;/,
    "必须排除来自关闭按钮等子元素的按键");
});

test("T03 关闭标签后焦点落到相邻标签，不丢到 body", () => {
  const source = readFileSync(new URL("./TabBar.tsx", import.meta.url), "utf8");
  const handlerStart = source.indexOf("const handleClose");
  const handler = source.slice(handlerStart, source.indexOf("\n  };", handlerStart));
  // 关闭后焦点若随按钮消失，键盘用户会被丢回 body：显式交回给相邻标签。
  assert.match(handler, /onCloseTab\(tabId\)/, "关闭仍走 AppShell 的 handleCloseFileTab");
  assert.match(handler, /tabs\[index - 1\]\?\.id \?\? tabs\[index \+ 1\]\?\.id/,
    "焦点目标取关闭前的相邻标签（优先前一个）");
  assert.match(handler, /\.focus\(/, "要真的把焦点交回去，不能只算目标");
  // 焦点原本不在这个标签里时不得抢焦点（用户可能在输入框里）。
  assert.match(handler, /contains\(document\.activeElement\)/, "只在焦点本来就在该标签里时才接管");
});

test("T03 不引入终端标签抽象（kind / closing / tabLabel 明确不做）", () => {
  const source = readFileSync(new URL("./TabBar.tsx", import.meta.url), "utf8");
  const iface = source.slice(source.indexOf("export interface Tab"), source.indexOf("interface Props"));
  assert.doesNotMatch(iface, /\bkind\b/, "Tab 接口不得加 kind：终端标签属终端集成 spec");
  assert.doesNotMatch(iface, /\bclosing\b/, "Tab 接口不得加 closing：那是终端关闭态");
  assert.doesNotMatch(source, /tabLabel/, "terminal.tabLabel 一类文案随终端标签一起不做");
  assert.doesNotMatch(source, /terminal\.close/, "关闭文案保持 i18n.close，不引入终端分支");
});
