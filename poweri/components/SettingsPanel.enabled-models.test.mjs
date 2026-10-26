/**
 * S04：enabledModels 开关（上游 50f6cce9）在 PowerI 设置里的可用性守卫。
 *
 * 勘察结论先写在这里，因为它决定了本票"改了什么"：
 *
 * 1. 开关本体**早已可用**。`poweri/components/SettingsPanel.tsx` 复用上游
 *    `components/ModelsConfig.tsx`，而后者内部就有 EnabledModelsBanner /
 *    EnabledModelsProviderSwitch / EnabledModelsSection / useEnabledModels。
 *    不存在"自研模型面板未采用开关"这回事——登记表那条理由已过时。
 *
 * 2. 但接线漏了一个参数：上游是 `<ModelsConfig embedded cwd={cwd} .../>`，
 *    PowerI 是 `<ModelsConfig embedded .../>`。缺 cwd 时 useEnabledModels
 *    不带 `?cwd=` 请求 `/api/models/enabled`，路由落到 `process.cwd()`，
 *    于是项目级 `.pi/settings.json` 的 enabledModels 覆盖被完全看不见：
 *    面板报告 scope=global、editable=true，开关可点，点了却对当前项目的
 *    模型选择器毫无影响。上游专门用 `editable: scope === "global"` +
 *    models.enabledProjectScope 文案来避免这个谎报，缺 cwd 就白费了。
 *
 * 本文件断言的就是第 2 点：cwd 确实进了 ModelsConfig，且这条路径在 403
 * 之外真的会返回 project/editable=false。
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const panel = read("./SettingsPanel.tsx");
const upstreamPanel = read("../../components/SettingsPanel.tsx");
const modelsConfig = read("../../components/ModelsConfig.tsx");

test("enabledModels 开关本体在上游 ModelsConfig 里，PowerI 不重写", () => {
  for (const symbol of ["EnabledModelsBanner", "EnabledModelsProviderSwitch", "EnabledModelsSection"]) {
    assert.match(modelsConfig, new RegExp(`<${symbol}\\b`), `上游已不再渲染 ${symbol}`);
  }
  assert.match(modelsConfig, /useEnabledModels\(cwd\)/, "上游已不再把 cwd 交给 useEnabledModels");
  // 复制会产生第二份需要同步的资产
  assert.doesNotMatch(panel, /export function ModelsConfig/);
  assert.match(panel, /import \{ ModelsConfig \} from "@\/components\/ModelsConfig"/);
});

test("ModelsConfig 拿得到 cwd：否则项目级 enabledModels 覆盖会被静默忽略", () => {
  assert.match(panel, /<ModelsConfig embedded cwd=\{cwd\}/, "缺 cwd 时面板会谎报「可编辑」，开关点了不生效");
  // 上游对照：上游也交（把 ModelsConfig 换成自研面板会导致此断言失败，而非静默通过）
  assert.match(upstreamPanel, /<ModelsConfig embedded cwd=\{cwd\}/);
});

test("cwd 进得去 enabledModels 视图：项目覆盖时 editable=false 且指向项目文件", async (t) => {
  const root = new URL("../..", import.meta.url).pathname;
  const jiti = createJiti(import.meta.url, { alias: { "@": root }, interopDefault: true });
  const { allowFileRoot } = await jiti.import(join(root, "lib/allowed-roots.ts"));
  const { GET } = await jiti.import(join(root, "app/api/models/enabled/route.ts"));

  const cwd = await mkdtemp(join(tmpdir(), "poweri-enabled-models-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await writeFile(join(cwd, ".pi", "settings.json"), JSON.stringify({ enabledModels: ["*/*"] }));
  allowFileRoot(cwd);

  const view = await (await GET(new Request(
    `http://localhost/api/models/enabled?cwd=${encodeURIComponent(cwd)}`,
  ))).json();

  assert.equal(view.scope, "project", "项目级 enabledModels 必须被识别，否则开关会写一个用户永远看不到的值");
  assert.equal(view.editable, false);
  assert.ok(
    String(view.settingsPath).endsWith(join(".pi", "settings.json")),
    `settingsPath 应指向项目文件，实际 ${view.settingsPath}`,
  );
});
