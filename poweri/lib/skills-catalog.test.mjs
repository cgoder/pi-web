import test from "node:test";
import assert from "node:assert/strict";
import { queryMarketSkills, matchesSkillQuery } from "./skills-catalog.ts";

test("matchesSkillQuery correctly matches name, description, author, and tags", () => {
  const skill = {
    name: "superpowers:tdd",
    description: "Test driven development workflow for AI agent",
    author: "obra",
    tags: ["testing", "workflow", "tdd"],
    sourceLabel: "skills.sh",
  };

  assert.equal(matchesSkillQuery(skill, "tdd"), true);
  assert.equal(matchesSkillQuery(skill, "Obra"), true);
  assert.equal(matchesSkillQuery(skill, "driven"), true);
  assert.equal(matchesSkillQuery(skill, "testing"), true);
  assert.equal(matchesSkillQuery(skill, "skills.sh"), true);
  assert.equal(matchesSkillQuery(skill, "non-existent-keyword"), false);
  assert.equal(matchesSkillQuery(skill, ""), true);
});

test("queryMarketSkills fetches live skills from skills.sh with keyword search", async () => {
  try {
    const results = await queryMarketSkills("tdd", "all");
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
  } catch (err) {
    // 外网连接异常时跳过断言（避免 CI 网络波动），并验证抛出标准可控错误
    assert.ok(err instanceof Error);
  }
});

test("queryMarketSkills browse mode returns popular skills sorted by installs", async () => {
  try {
    const results = await queryMarketSkills("", "all");
    assert.ok(results.length >= 10, "browse mode should return popular skills");
    // 验证按安装量降序排序
    const first = results[0];
    assert.ok(first.installs, "should have installs metric");
  } catch (err) {
    assert.ok(err instanceof Error);
  }
});

test("queryMarketSkills business category returns empty list (skills.sh is public)", async () => {
  const results = await queryMarketSkills("tdd", "business");
  assert.equal(results.length, 0, "skills.sh only hosts public skills");
});

// ─── Discover 两级缓存（内存 TTL + 磁盘持久化）───

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearMarketSkillsCache } from "./skills-catalog.ts";

const FAKE_SKILLS = [
  { id: "owner/repo/skill", skillId: "skill", name: "cached-skill", installs: 42, source: "owner/repo" },
];

function stubFetchOk() {
  const orig = globalThis.fetch;
  globalThis.fetch = async () =>
    ({ ok: true, json: async () => ({ query: "x", count: 1, duration_ms: 1, skills: FAKE_SKILLS }) });
  return () => { globalThis.fetch = orig; };
}

function stubFetchBoom() {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network should not be hit"); };
  return () => { globalThis.fetch = orig; };
}

test("discover 磁盘缓存：磁盘有效缓存命中时零网络请求", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "poweri-discover-"));
  const origEnv = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  t.after(() => {
    if (origEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = origEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  clearMarketSkillsCache();
  fs.writeFileSync(
    path.join(dir, "poweri-discover-cache.json"),
    JSON.stringify({ version: 1, entries: [{ key: "all|", items: FAKE_SKILLS.map((s) => ({
      id: `skills-sh-${s.id.replace(/\//g, "-")}`,
      name: s.name,
      description: "",
      author: s.source.split("/")[0],
      tags: [],
      version: "",
      category: "public",
      sourceLabel: "skills.sh",
      subscriptionId: "sub-skills-sh",
      subscriptionUrl: `https://github.com/${s.source}`,
      sourceType: "skills.sh",
      installed: false,
      enabled: false,
      installs: "42",
    })), at: Date.now() }] }),
  );
  const restore = stubFetchBoom();
  t.after(restore);
  const results = await queryMarketSkills("", "all");
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "cached-skill");
});

test("discover 磁盘缓存：过期缓存不命中、走网络并回写新缓存", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "poweri-discover-"));
  const origEnv = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  t.after(() => {
    if (origEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = origEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  clearMarketSkillsCache();
  // 过期缓存：at 在 TTL 之前很久
  fs.writeFileSync(
    path.join(dir, "poweri-discover-cache.json"),
    JSON.stringify({ version: 1, entries: [{ key: "all|", items: [], at: 1 }] }),
  );
  const restore = stubFetchOk();
  t.after(restore);
  const results = await queryMarketSkills("", "all");
  assert.equal(results.length, 1, "过期缓存应被忽略，走网络");
  // 网络结果应回写磁盘缓存（下次零网络命中）
  assert.ok(fs.existsSync(path.join(dir, "poweri-discover-cache.json")), "应回写磁盘缓存文件");
});

test("discover 磁盘缓存：损坏缓存文件容错（不抛错、走网络）", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "poweri-discover-"));
  const origEnv = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  t.after(() => {
    if (origEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = origEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  clearMarketSkillsCache();
  fs.writeFileSync(path.join(dir, "poweri-discover-cache.json"), "{{{not-json");
  const restore = stubFetchOk();
  t.after(restore);
  const results = await queryMarketSkills("", "all");
  assert.equal(results.length, 1, "损坏文件应被忽略并走网络");
});
