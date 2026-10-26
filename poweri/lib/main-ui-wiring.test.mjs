// 主界面（FileExplorer / SessionSidebar）替换件接线回归测试。
//
// 与 replacement-wiring.test.mjs 同源动机：基础层能力随上游合并就位，但
// poweri/ 替换件是冻结副本，不会自动接上。这些断言钉住「哪条上游提交、接在哪一行」。
// 每条测试名带上游 commit 短哈希，便于对着 replacements.json 对账。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const explorer = await readFile(new URL("../components/FileExplorer.tsx", import.meta.url), "utf8");
const sidebar = await readFile(new URL("../components/SessionSidebar.tsx", import.meta.url), "utf8");

test("FileExplorer 能列出 Git 忽略的文件（上游 2f6a0a93）", () => {
  // 基础层 app/api/files/[...path]/route.ts 已支持 `hidden=1`，返回项带 hidden 原因；
  // 替换件要做的只是把开关传下去，并把它们画灰。
  assert.match(explorer, /hidden=1/, "必须把 hidden=1 传给 files 路由");
  assert.match(explorer, /showHidden/, "缺少开关状态");
  assert.match(explorer, /FileTreeHiddenReason/, "应从基础层 lib/file-tree-visibility 取原因类型");
  // 必须真的降透明度，否则「灰显」只存在于注释里。
  assert.match(explorer, /HIDDEN_ENTRY_OPACITY\s*=\s*0?\.\d+/, "缺少灰显透明度常量");
});

test("能把工作区在系统文件管理器中打开（上游 a0c00f37）", () => {
  // 路由 app/api/open-in-explorer 已在基础层就位。"在文件管理器中打开"按钮
  // 住在侧栏工具条（与上游一致），不在文件树里。
  assert.match(sidebar, /open-in-explorer/, "必须调用 /api/open-in-explorer");
  // 服务端才能开窗口，且只能在本机：必须探一次可用性再决定按钮状态。
  assert.match(sidebar, /FileManagerAvailability/, "缺少可用性探测");
  assert.match(sidebar, /openInFileManager/, "缺少打开文件管理器的动作");
});

test("SessionSidebar 具有会话搜索入口（上游 1cbd96fd）", () => {
  // 上游把这个能力拆成 components/SessionSearch.tsx（可 import、不可改）+ 路由
  // app/api/sessions/search；两者都已在基础层。替换件要做的只是接入。
  assert.match(sidebar, /from "@\/components\/SessionSearch"/, "必须复用上游 SessionSearch，不自建一份");
  assert.match(sidebar, /<SessionSearch\b/, "组件必须实际渲染");
  assert.match(sidebar, /sessionSearchQuery/, "搜索关键字要能输进来");
  assert.match(sidebar, /open=\{sessionSearchActive\}/, "搜索面板需由关键字驱动，否则空查询也会盖住列表");
});

test("SessionSidebar 会话行不再直接罗列消息条数（改用可视化）", () => {
  // AGENTS.md 设计理念第 1 条：可视化优先于数字罗列，数字是下钻层。
  // 因此 sidebar.messagesCount 不应再作为可见文本渲染。
  assert.doesNotMatch(
    sidebar,
    /<span>\{t\("sidebar\.messagesCount"/,
    "消息数应改为分段条，精确值只留在 title 悬浮提示里",
  );
  assert.match(sidebar, /MessageVolumeBar|messagesCountBuckets/, "缺少消息量分段条组件");
});
