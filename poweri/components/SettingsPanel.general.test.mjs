/**
 * 设置面板「常规」选项卡的结构守卫。
 *
 * 为什么存在：上游 general 有 8 个区块，PowerI 替换件只有 4 个。本批只补两条
 * 有实质差异且基础层能力已就位的：
 *   1. 排版 typography —— 字号/宽度从「对话」拆成独立区块（上游 a0b7c4f9 的形状）
 *   2. 缓存未命中提示 —— 上游 #1265 的 showCacheMissNotices 开关
 *
 * 刻意不补的（账目 waived，见 docs/desktop/replacements.json）：
 *   - FontSettings（字体名/字重）：PowerI 自研字体体系
 *   - push / 登出：PowerI 走 gateway 鉴权与 Web Push
 *   - filesPlacement 二选一：PowerI 只有「文件在会话列表下方」一种结构
 *
 * 断言针对可观察结构（区块标题顺序、控件归属），不针对实现变量名。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");

/** 走源码文本取「常规」渲染区的区块标题序列（i18n key）。 */
function generalSectionHeadings() {
  const start = source.indexOf('className="settings-general"');
  assert.ok(start > 0, "找不到 settings-general 渲染区");
  // 到 usage 分区的 StatsPanel 为止，避免把别的分区算进来
  const end = source.indexOf("StatsPanel", start);
  const region = source.slice(start, end > 0 ? end : undefined);
  return [...region.matchAll(/settings-general-heading">\{t\("([^"]+)"\)\}/g)].map((m) => m[1]);
}

test("排版是独立区块，夹在外观与对话之间（上游 a0b7c4f9）", () => {
  const headings = generalSectionHeadings();
  const iTypo = headings.indexOf("settings.typography");
  const iAppearance = headings.indexOf("settings.appearance");
  const iChat = headings.indexOf("settings.chat");
  assert.ok(iTypo > -1, `「常规」里没有排版区块，实际区块: ${headings.join(" → ")}`);
  assert.ok(iAppearance < iTypo, "排版应在外观之后");
  assert.ok(iTypo < iChat, "排版应在对话之前");
});

test("字号与宽度两个滑块归排版区块，不再留在对话区块（上游 a0b7c4f9）", () => {
  const start = source.indexOf('className="settings-general"');
  const typoIdx = source.indexOf('t("settings.typography")', start);
  const chatIdx = source.indexOf('t("settings.chat")', start);
  const shellIdx = source.indexOf('t("settings.shellTool")', start);
  assert.ok(typoIdx > 0 && chatIdx > 0 && shellIdx > chatIdx, "区块锚点不全");

  for (const id of ["settings-chat-content-width", "settings-chat-content-font-size"]) {
    const at = source.indexOf(`id="${id}"`);
    assert.ok(at > typoIdx, `${id} 应在排版区块内`);
    assert.ok(at < chatIdx || at > shellIdx, `${id} 不应留在对话区块内`);
  }
});

test("缓存未命中提示开关挂在对话区块内（上游 #1265）", () => {
  const chatIdx = source.indexOf('t("settings.chat")', source.indexOf('className="settings-general"'));
  const sidebarOrShellIdx = source.indexOf('t("settings.shellTool")', chatIdx);
  const cacheIdx = source.indexOf('t("settings.cacheMissNotices")', chatIdx);
  assert.ok(cacheIdx > -1, "对话区块里没有缓存未命中提示开关");
  assert.ok(cacheIdx < sidebarOrShellIdx, "缓存未命中提示应在对话区块内（shell 区块之前）");
});

test("缓存未命中提示接到 /api/cache-miss-notices（而不是别处）", () => {
  assert.match(
    source,
    /fetch\(\s*["'`]\/api\/cache-miss-notices/,
    "缓存未命中提示必须读写 /api/cache-miss-notices",
  );
  assert.match(source, /method:\s*"PUT"/, "写路径应为 PUT");
});

test("排版描述走 tp()（PowerI 自研 key 不在上游字典里，用 t() 会原样输出 key）", () => {
  // 背景：抓图时发现「Fonts & layout」下直接显示 settings.typographyDescription。
  // 根因：`t()` 来自上游 useI18n，只查上游字典；PowerI 自研 key 存在 poweriMessages 里，
  // 必须走 `tp(locale, ...)`。同类错误会静默降级成 key 字面量，只能靠断言拦。
  const at = source.indexOf("settings.typographyDescription");
  assert.ok(at > -1, "找不到排版描述");
  const callSite = source.slice(Math.max(0, at - 30), at);
  assert.match(callSite, /tp\(locale,\s*["']$/, `排版描述必用 tp(locale, ...)，实际: ...${callSite}`);
});

test("不引入上游 FontSettings（PowerI 自研字体体系，账目 waived）", () => {
  assert.doesNotMatch(
    source,
    /import\s*\{[^}]*FontSettings[^}]*\}/,
    "字体名/字重属 waived 范围，不应引入上游 FontSettings",
  );
});
