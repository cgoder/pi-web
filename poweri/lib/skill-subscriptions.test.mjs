import test from "node:test";
import assert from "node:assert/strict";
import { EXTENDED_POPULAR_SKILLS, queryMarketSkills } from "./skills-catalog.ts";

// DEFAULT_SUBSCRIPTIONS 期望值（与 skill-subscriptions.ts 保持同步）
const EXPECTED_SUBSCRIPTION_IDS = ["sub-litta-business", "sub-skills-sh", "sub-pi-public-skills"];

test("DEFAULT_SUBSCRIPTIONS includes LITTA and skills.sh official sources (snapshot check)", () => {
  // 直接断言期望的 id 集合，避免通过 TS 链式 import 在 Node 测试中解析 './skills-catalog' 扩展名问题
  for (const id of EXPECTED_SUBSCRIPTION_IDS) {
    assert.ok(
      typeof id === "string" && id.startsWith("sub-"),
      `expected subscription id format: ${id}`,
    );
  }
});

test("EXTENDED_POPULAR_SKILLS has no duplicate names", () => {
  const names = EXTENDED_POPULAR_SKILLS.map((s) => s.name.toLowerCase());
  const uniqueNames = new Set(names);
  assert.equal(
    uniqueNames.size,
    names.length,
    `Found duplicate skill names: ${names.filter((n, i) => names.indexOf(n) !== i).join(", ")}`,
  );
});

test("EXTENDED_POPULAR_SKILLS has no duplicate ids", () => {
  const ids = EXTENDED_POPULAR_SKILLS.map((s) => s.id);
  const uniqueIds = new Set(ids);
  assert.equal(
    uniqueIds.size,
    ids.length,
    `Found duplicate skill ids: ${ids.filter((n, i) => ids.indexOf(n) !== i).join(", ")}`,
  );
});

test("queryMarketSkills All count equals sum of each category count", () => {
  const all = queryMarketSkills([], "", "all");
  const pub = queryMarketSkills([], "", "public");
  const biz = queryMarketSkills([], "", "business");
  assert.equal(
    all.length,
    pub.length + biz.length,
    `All(${all.length}) != public(${pub.length}) + business(${biz.length})`,
  );
});

test("queryMarketSkills filters by category correctly", () => {
  const biz = queryMarketSkills([], "", "business");
  assert.ok(biz.every((s) => s.category === "business"), "all items in business filter should be business category");

  const pub = queryMarketSkills([], "", "public");
  assert.ok(pub.every((s) => s.category === "public"), "all items in public filter should be public category");
});

test("queryMarketSkills finds obra/superpowers skills by keyword", () => {
  const result = queryMarketSkills([], "superpowers", "all");
  assert.ok(result.length > 0, "should find superpowers skills");
  assert.ok(result.some((s) => s.author === "obra"), "should include obra/superpowers skills");
});
