// PowerI 替换件接线回归测试。
//
// 为什么存在：e2e（e2e/run.mjs、e2e/terminal.mjs）全部 goto 上游根路由 `/`，从不进 `/poweri`；
// 上游 components/SettingsPanel.test.mjs 也只校验上游文件。于是「上游能力已合并进基础层、
// 但 PowerI 替换件没接线」这类缺口零测试覆盖 —— v0.9.0 同步中就漏出子代理标签页、
// 划词开关持久化、会话滚动记忆三处（见 docs/desktop/replacements.json 的 ported 记录）。
// 本文件用源码断言钉住这些接线点，写法对齐上游 components/SettingsPanel.test.mjs。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shell = await readFile(new URL("../layout/AppShell.tsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../components/SettingsPanel.tsx", import.meta.url), "utf8");
const chatWindow = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
const chatInput = await readFile(new URL("../components/ChatInput.tsx", import.meta.url), "utf8");
const upstreamShell = await readFile(new URL("../../components/AppShell.tsx", import.meta.url), "utf8");
const registry = JSON.parse(
  await readFile(new URL("../../docs/desktop/replacements.json", import.meta.url), "utf8"),
);

const count = (src, re) => (src.match(re) ?? []).length;

test("设置面板挂起子代理入口（v0.9.0 237d0ca 曾漏移植）", () => {
  assert.match(panel, /id: "agents"/);
  assert.match(panel, /label: t\("common\.agents"\)/);
  assert.match(panel, /<AgentsConfig embedded/);
  assert.match(panel, /import \{ AgentsConfig \} from "@\/components\/AgentsConfig"/, "须复用上游叶子组件，不得本地重写");
});

test("AppShell 为 ChatWindow 供会话滚动位置（430fe4d 的状态持有侧）", () => {
  assert.match(shell, /sessionScrollPositionsRef = useRef\(new Map<string, ChatScrollPosition>\(\)\)/);
  assert.match(shell, /initialScrollPosition=\{selectedSession \? sessionScrollPositionsRef/);
  assert.match(shell, /onScrollPositionChange=\{handleSessionScrollPositionChange\}/);
  // ChatWindow 侧声明了这两个 prop，若上游改名而此处未跟，接线会静默断掉
  assert.match(chatWindow, /initialScrollPosition/);
  assert.match(chatWindow, /onScrollPositionChange/);
});

test("划词提问开关持久化到上游同一个 localStorage key（c0abfc2）", () => {
  const KEY = /pi-quote-selection-enabled/g;
  assert.equal(count(shell, KEY), 2, "读写两侧都要有，只在 state 里拨开关会刷新即失效");
  assert.ok(count(upstreamShell, KEY) >= 2, "上游已不用该 key 则本测试与 PowerI 两侧均需同步修正");
});

test("未发送草稿在切换会话/工作区时暂存回流（77ffe3c）", () => {
  assert.match(shell, /import \{[^}]*rekeyDraft[^}]*\} from "@\/lib\/draft-store"/);
  assert.match(shell, /function parkedNewSessionDraftKey/);
  assert.ok(count(shell, /parkedNewSessionDraftKey\(/g) >= 3, "restoreWorkspaceContext / handleCwdChange / handleSelectSession 至少要三处");
});

test("compact 输入框（划词弹窗）不承载附件", () => {
  assert.ok(count(chatInput, /^    if \(compact\) return;$/gm) >= 2, "processIncomingFiles 与 handlePaste 各一处守卫");
});

test("替换件登记的每个 watermark 都经 ack 正规推进（防手写空区间假通过）", () => {
  for (const entry of registry.replacements) {
    assert.ok(entry.watermarkProvenance?.commit, `${entry.poweri} 缺 watermarkProvenance：watermark 疑似手写，审计区间会退化为空`);
    assert.ok(
      entry.watermark.startsWith(entry.watermarkProvenance.commit) || entry.watermarkProvenance.commit.startsWith(entry.watermark),
      `${entry.poweri} watermark=${entry.watermark} 与 ack 记录=${entry.watermarkProvenance.commit} 不一致`,
    );
  }
});

test("触及上游对照文件的提交都逐条落入 ported/waived/pending", () => {
  // 三类处置不得互相重复（同一提交既算移植又算待办＝记账含糊）
  for (const entry of registry.replacements) {
    const seen = new Map();
    for (const item of entry.ported ?? []) check(entry, item, "ported", seen);
    for (const item of entry.waived ?? []) check(entry, item, "waived", seen);
    for (const item of entry.pending ?? []) check(entry, item, "pending", seen);
  }
});

function check(entry, item, bucket, seen) {
  if (item.commit === registry.upstreamRef) return;
  const prev = seen.get(item.commit);
  assert.equal(prev, undefined, `${entry.poweri} 的 ${item.commit} 同时记为 ${prev} 和 ${bucket}`);
  seen.set(item.commit, bucket);
  assert.ok(
    (item.note ?? item.reason ?? "").length >= 8,
    `${entry.poweri} ← ${item.commit}（${bucket}）缺理由，无法复盘判定依据`,
  );
}
