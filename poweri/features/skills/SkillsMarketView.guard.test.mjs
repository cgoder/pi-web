/**
 * Skills 面板行为守卫（回归防线）：
 * - 加载时序：mount 不得无条件 force check 更新；空闲懒加载 auto check；展开区按需限源拉取
 * - 源管理：添加/编辑/删除入口不限定 tab；默认源亦可删除
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

test("源管理入口不限定 tab（添加/编辑在 Installed 与 Discover 均可用）", () => {
  assert.doesNotMatch(
    source,
    /activeTab === "discover" && \(\s*\n\s*<button\s*\n\s*type="button"\s*\n\s*onClick=\{handleOpenAdd\}/,
    "添加源按钮不得限定在 Discover tab",
  );
  assert.doesNotMatch(
    source,
    /activeTab === "discover" && \(\s*\n\s*<button\s*\n\s*type="button"\s*\n\s*onClick=\{\(e\) => handleOpenEdit/,
    "编辑（内含删除）按钮不得限定在 Discover tab",
  );
});

test("默认源亦可删除（删除按钮不再排除 isDefault）", () => {
  assert.match(
    source,
    /\{isEdit && onDelete && \(/,
    "删除按钮不得带 !isDefault 条件——默认源收敛后仍允许用户删除",
  );
});
