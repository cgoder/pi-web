/**
 * 面板加载时序守卫（重开慢根因修复的回归防线）：
 * - mount 时不得无条件 force check 更新（每次打开面板强拉全部 git 源）
 * - 首屏完成后空闲触发 auto check（服务端 TTL 门控，非 force）
 * - 更新 badge 展开时按源按需 auto 拉取
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "SkillsMarketView.tsx"), "utf8");

test("面板打开不再强制检查更新（mount 时的 bare refreshUpdates 已移除）", () => {
  assert.doesNotMatch(
    source,
    /void refreshUpdates\(\);/,
    "mount 时的无条件 force check 必须保持移除——它会绕过 TTL 强拉全部 git 源",
  );
});

test("首屏渲染完成后空闲触发 auto check（懒加载，非 force）", () => {
  assert.match(source, /refreshUpdates\(\{ mode: "auto" \}\)/, "必须存在 TTL 门控的懒加载触发");
  assert.match(
    source,
    /mode: opts\?\.mode/,
    "请求必须透传 mode 给服务端（auto = TTL 门控，缺省 force）",
  );
});

test("更新 badge 展开时按源按需拉取且按源合并（不清掉其他源数据）", () => {
  assert.match(
    source,
    /refreshUpdates\(\{ mode: "auto", subscriptionId: skill\.subscriptionId \}\)/,
    "展开区数据缺失时应限源 auto 拉取",
  );
  assert.match(
    source,
    /prev\.filter\(\(u\) => u\.subscriptionId !== sourceId\)/,
    "限源拉取必须按源合并写入",
  );
});
