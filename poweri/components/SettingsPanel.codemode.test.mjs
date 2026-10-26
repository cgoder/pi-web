/**
 * S03：Code mode 工具设置（上游 1c387b47 + 9cf95474）。
 *
 * 勘察结论：Code mode 的选择器不是独立面板，它在 Settings › MCP 里作为
 * 侧栏首行（McpCodemodeRow）与详情页（McpCodemodeDetail）出现，两者都在
 * 上游 components/McpConfig.tsx 内。所以本票没有独立 UI 要做——S01 把
 * McpConfig 挂进 MCP 分区时它就跟着来了。真正需要钉住的是**写入口**：
 * 选项只能经 PUT /api/tools/settings 落盘，面板不许自己碰 settings.json。
 *
 * 上游 1c387b47 的理由值得抄在这里：Automatic 什么都不写（codemode 注册为
 * inactive，等 MCP 扩展在有 codemode-exposure 的服务器接入时激活它）；
 * Always on 往全局 defaultTools 加 +codemode。PUT 的编辑只删指名的
 * codemode 条目再追加 +codemode，所以纯修饰符列表也成立；修饰符列表被
 * 清空时整个键删掉，因为 defaultTools: [] 表示「没有工具」而不是 pi 默认值。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const panel = read("./SettingsPanel.tsx");
const mcpConfig = read("../../components/McpConfig.tsx");

test("Code mode 选择器随 MCP 分区一起到达 PowerI，不另建面板", () => {
  // 没有 S01 的 <McpConfig embedded/> 就没有这行；这条断言把两票绑在一起。
  assert.match(panel, /<McpConfig embedded/);
  assert.match(mcpConfig, /function McpCodemodeRow\b/, "上游已把 Code mode 行移出 McpConfig");
  assert.match(mcpConfig, /MCP_CODEMODE_SELECTION/);
  assert.doesNotMatch(panel, /McpCodemodeRow|CodemodeToolView/, "PowerI 不应自带一份 Code mode UI");
});

test("面板不自己写 settings 文件：写入只经 /api/tools/settings", () => {
  // 上游 route 的注释就是这条约定：它是全局 defaultTools 的唯一写入者。
  // 写入口在 helpers 里（saveCodemodePreference 等），不止一个调用点。
  assert.match(mcpConfig, /saveCodemode|onChange=\{onCodemodeChange\}/);
  const helpers = read("../../components/mcp-config-helpers.ts");
  assert.equal((helpers.match(/"\/api\/tools\/settings"/g) ?? []).length, 1, "写入必须集中在一处");
  assert.doesNotMatch(mcpConfig, /writeFile(?:Sync)?\(/, "面板直写文件会绕过 pi SettingsManager 的文件锁");
  assert.doesNotMatch(panel, /settings\.json/);
});

test("Code mode 走 PUT /api/tools/settings：Always on 写 +codemode，Automatic 撤回", async (t) => {
  const root = new URL("../..", import.meta.url).pathname;
  const home = await mkdtemp(join(tmpdir(), "poweri-codemode-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const previous = process.env.PI_HOME ?? process.env.HOME;
  process.env.HOME = home;
  process.env.PI_HOME = home;
  t.after(() => {
    if (previous === undefined) { delete process.env.HOME; delete process.env.PI_HOME; }
    else { process.env.HOME = previous; process.env.PI_HOME = previous; }
  });

  const jiti = createJiti(import.meta.url, { alias: { "@": root }, interopDefault: true });
  const { GET, PUT } = await jiti.import(join(root, "app/api/tools/settings/route.ts"));

  // 路由要求 Host 头（lib/request-security.ts）；没有它就只会拿到 403。
  const put = (body) => PUT(new Request("http://localhost/api/tools/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", host: "localhost" },
    body: JSON.stringify(body),
  }));

  // Automatic 什么都不写；GET 仍要如实报告这个选择。
  const automatic = await (await put({ codemode: "automatic" })).json();
  assert.equal(automatic.codemode, "automatic");
  assert.equal((await (await GET()).json()).codemode, "automatic");

  // Always on 往 defaultTools 加 +codemode。
  const always = await (await put({ codemode: "always" })).json();
  assert.equal(always.codemode, "always");
  const settingsPath = join(home, ".pi", "agent", "settings.json");
  const written = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.ok(
    written.defaultTools.some((entry) => String(entry).includes("codemode")),
    `Always on 必须落进 defaultTools，实际 ${JSON.stringify(written.defaultTools)}`,
  );

  // 撤回：+codemode 被删掉，其余条目原样保留。
  await put({ codemode: "automatic" });
  const reverted = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.ok(
    !(reverted.defaultTools ?? []).some((entry) => String(entry).includes("codemode")),
    `Automatic 必须撤回 +codemode，实际 ${JSON.stringify(reverted.defaultTools)}`,
  );
});

test("纯修饰符列表被撤回后整键删除，而不是留下 []（[] 表示没有任何工具）", async (t) => {
  const root = new URL("../..", import.meta.url).pathname;
  const home = await mkdtemp(join(tmpdir(), "poweri-codemode-mod-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const previousHome = process.env.HOME;
  const previousPiHome = process.env.PI_HOME;
  process.env.HOME = home;
  process.env.PI_HOME = home;
  t.after(() => {
    process.env.HOME = previousHome;
    if (previousPiHome === undefined) delete process.env.PI_HOME;
    else process.env.PI_HOME = previousPiHome;
  });

  const settingsPath = join(home, ".pi", "agent", "settings.json");
  await mkdir(join(home, ".pi", "agent"), { recursive: true });
  await writeFile(settingsPath, JSON.stringify({ defaultTools: ["+codemode"] }));

  const jiti = createJiti(import.meta.url, { alias: { "@": root }, interopDefault: true });
  const { PUT } = await jiti.import(join(root, "app/api/tools/settings/route.ts"));
  await PUT(new Request("http://localhost/api/tools/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", host: "localhost" },
    body: JSON.stringify({ codemode: "automatic" }),
  }));

  const written = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.ok(
    !("defaultTools" in written),
    `清空后应删键而非留下 []，实际 ${JSON.stringify(written)}`,
  );
});
