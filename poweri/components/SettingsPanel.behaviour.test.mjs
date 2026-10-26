/**
 * 设置面板（PowerI 替换件）行为守卫。
 *
 * 为什么存在：`poweri/lib/replacement-wiring.test.mjs` 只断言「接线点存在」，
 * 但设置项的可观察行为（发送键判定、Code mode 写入路径、模型开关的 cwd 供给）
 * 需要被执行，而不是被正则匹配。这里用与上游 `components/ChatInput.test.mjs`
 * 相同的手段——用 TypeScript 编译器从源码里取出 `handleKeyDown`，在 vm 里真跑——
 * 断言 PowerI 输入框在两个发送模式下的可观察行为。
 *
 * 背景票：S02（上游 5df8278a · configurable send key）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import { createJiti } from "jiti";
import ts from "typescript";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { canRunBuiltinSlashCommandWhileStreaming } = await jiti.import("./ChatInput.tsx");

const source = ts.createSourceFile(
  "ChatInput.tsx",
  readFileSync(new URL("./ChatInput.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function findHandler(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "handleKeyDown") {
    return node.initializer.arguments[0];
  }
  return ts.forEachChild(node, findHandler);
}

const handlerScript = new Script(ts.transpileModule(findHandler(source).getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText);

/**
 * 跑一次按键，返回输入框实际做出的动作。
 *
 * 动作取值：`send`（立即发送）、`steer`/`followup`（流式中排队）、
 * `native`（不拦截，浏览器自己插入换行）、`prevented`（拦截但不发送，如 IME 保护）。
 */
function press(keys, state) {
  let action = "native";
  const handler = handlerScript.runInNewContext({
    Date: { now: () => 1000 },
    COMPOSITION_END_ENTER_GRACE_MS: 100,
    isMobile: false,
    isStreaming: false,
    enterSendMode: "enter",
    isComposingRef: { current: false },
    lastCompositionEndAtRef: { current: 0 },
    historyMenuOpen: false,
    inputHistory: [],
    historyActiveIndex: 0,
    slashMenuOpen: false,
    slashQuery: null,
    displayedSlashCommands: [{}],
    slashActiveIndex: 0,
    atMenuOpen: false,
    atQuery: null,
    atMatches: [{}],
    atActiveIndex: 0,
    onSteer() {},
    onFollowUp() {},
    sendQueued(mode) { action = mode; },
    handleSend() { action = "send"; },
    applySlashCommand() { action = "slash"; },
    submitsSlashCommandOnEnter: () => false,
    value: "",
    setSlashMenuOpen() {},
    applyAtCompletion() { action = "file"; },
    applyHistoryInput() { action = "history"; },
    ...state,
  });
  handler({
    key: "Enter",
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    nativeEvent: { isComposing: false, keyCode: 13 },
    preventDefault() { action = "prevented"; },
    ...keys,
  });
  return action;
}

test("Enter 发送模式：Enter 发送、Shift+Enter 换行（默认行为不回归）", () => {
  assert.equal(press({}, { enterSendMode: "enter" }), "send");
  assert.equal(press({ shiftKey: true }, { enterSendMode: "enter" }), "native");
  // 默认模式里 Ctrl+Enter 只是带修饰的 Enter，语义仍是发送
  assert.equal(press({ ctrlKey: true }, { enterSendMode: "enter" }), "send");
});

test("Ctrl+Enter 发送模式：Enter 换行、Ctrl/Cmd+Enter 发送", () => {
  assert.equal(press({}, { enterSendMode: "ctrlEnter" }), "native", "Ctrl+Enter 模式下 Enter 必须插入换行");
  assert.equal(press({ ctrlKey: true }, { enterSendMode: "ctrlEnter" }), "send");
  assert.equal(press({ metaKey: true }, { enterSendMode: "ctrlEnter" }), "send");
  assert.equal(press({ shiftKey: true }, { enterSendMode: "ctrlEnter" }), "native", "Shift+Enter 始终换行");
});

test("Ctrl+Enter 发送模式：流式中 Enter 不打断队列，修饰键才排队", () => {
  assert.equal(
    press({}, { enterSendMode: "ctrlEnter", isStreaming: true }),
    "native",
    "Enter 在 Ctrl+Enter 模式下不能提前把消息塞进运行中的回合",
  );
  assert.equal(press({ ctrlKey: true }, { enterSendMode: "ctrlEnter", isStreaming: true }), "steer");
});

test("Ctrl+Enter 发送模式：IME 组字保护仍挡在换行之前", () => {
  // Safari 用 Enter 确认候选词；拦截掉这个 Enter 才能避免多插一个换行。
  assert.equal(
    press({}, { enterSendMode: "ctrlEnter", lastCompositionEndAtRef: { current: 950 } }),
    "prevented",
  );
  assert.equal(press({}, { enterSendMode: "ctrlEnter", isComposingRef: { current: true } }), "native");
});

test("Ctrl+Enter 发送模式不改变内置斜杠命令在流式中的可用性判定", () => {
  // 发送键只决定"哪个按键发送"，不决定"哪些命令能跑"：后者仍是 canRunBuiltinSlashCommandWhileStreaming 的职责。
  assert.match(canRunBuiltinSlashCommandWhileStreaming.toString(), /availableWhileStreaming/);
  assert.equal(press({ ctrlKey: true }, { enterSendMode: "ctrlEnter", isStreaming: true }), "steer");
});

test("常规设置真的渲染出二选一控件，且默认选中 Enter", async (t) => {
  // 上面几条钉住键盘行为，这条钉住"用户能改"：只有控件真的在 DOM 里、
  // 且默认值与 hook 的默认一致，设置项才算闭环。
  const React = await jiti.import("react");
  const { renderToStaticMarkup } = await jiti.import("react-dom/server");
  const { I18nProvider } = await jiti.import("@/hooks/useI18n");
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  globalThis.fetch = async () => new Response(JSON.stringify({ isWindows: false }), { status: 200 });
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousStorage;
  });
  // SettingsPanel 静态 import StatsPanel → UsagePanel，后者 import 了一份 .css；
  // Node 的 ESM loader 不认 CSS，用空模块顶掉（内容与本断言无关）。
  const jitiNoCss = createJiti(import.meta.url, {
    jsx: { runtime: "automatic" },
    tsconfigPaths: true,
    alias: { "../styles/usage-panel.css": new URL("./test-fixtures/empty-module.mjs", import.meta.url).pathname },
    interopDefault: true,
  });
  const { SettingsPanel } = await jitiNoCss.import("./SettingsPanel.tsx");
  const html = renderToStaticMarkup(
    React.createElement(I18nProvider, null,
      React.createElement(SettingsPanel, { cwd: null, sessionId: null, initialSection: "general", onClose: () => {}, onSessionReloaded: () => {} }),
    ),
  );
  const radios = [...html.matchAll(/name="settings-enter-send-mode"[^>]*/g)].map((m) => m[0]);
  assert.equal(radios.length, 2, "发送键必须给两个选项，不能只是一个开关");
  assert.match(radios[0], /checked=""/, "默认应是 Enter 发送，与 useEnterSendMode 的默认一致");
  assert.doesNotMatch(radios[1], /checked=""/);
});
