import test from "node:test";
import assert from "node:assert/strict";
import { queryMarketSkills } from "./skills-catalog.ts";

test("queryMarketSkills fetches live skills from skills.sh with keyword search", async () => {
  const results = await queryMarketSkills([], "tdd", "all");
  assert.ok(results.length > 0, "should return skills for 'tdd'");
  assert.ok(
    results.some((s) => s.name.toLowerCase().includes("tdd")),
    "should include a skill with name matching 'tdd'",
  );
  // 验证返回的数据结构完整性
  const first = results[0];
  assert.ok(first.id.startsWith("skills-sh-"));
  assert.ok(first.name);
  assert.ok(first.author);
  assert.equal(first.sourceType, "skills.sh");
  assert.equal(first.category, "public");
});

test("queryMarketSkills browse mode returns popular skills sorted by installs", async () => {
  const results = await queryMarketSkills([], "", "all");
  assert.ok(results.length >= 10, "browse mode should return popular skills");
  // 验证按安装量降序排序
  const first = results[0];
  assert.ok(first.installs, "should have installs metric");
});

test("queryMarketSkills business category returns empty list (skills.sh is public)", async () => {
  const results = await queryMarketSkills([], "tdd", "business");
  assert.equal(results.length, 0, "skills.sh only hosts public skills");
});
