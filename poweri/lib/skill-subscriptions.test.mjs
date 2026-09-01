import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SUBSCRIPTIONS,
  SKILLS_SH_POPULAR_SKILLS,
} from "./skill-subscriptions.ts";

test("DEFAULT_SUBSCRIPTIONS includes LITTA and skills.sh official sources", () => {
  const ids = DEFAULT_SUBSCRIPTIONS.map((s) => s.id);
  assert.ok(ids.includes("sub-litta-business"));
  assert.ok(ids.includes("sub-skills-sh"));
  assert.ok(ids.includes("sub-pi-public-skills"));
});

test("SKILLS_SH_POPULAR_SKILLS provides core development skills", () => {
  const names = SKILLS_SH_POPULAR_SKILLS.map((s) => s.name);
  assert.ok(names.includes("git-commit-helper"));
  assert.ok(names.includes("browser-tools"));
  assert.ok(names.includes("tdd"));
  assert.ok(names.includes("code-review"));
  assert.ok(names.includes("domain-modeling"));
});
