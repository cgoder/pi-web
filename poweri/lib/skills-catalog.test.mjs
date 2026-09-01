import test from "node:test";
import assert from "node:assert/strict";
import {
  EXTENDED_POPULAR_SKILLS,
  queryMarketSkills,
} from "./skills-catalog.ts";

test("EXTENDED_POPULAR_SKILLS covers obra/superpowers suite", () => {
  const names = EXTENDED_POPULAR_SKILLS.map((s) => s.name);
  assert.ok(names.includes("superpowers:systematic-debugging"));
  assert.ok(names.includes("superpowers:tdd"));
  assert.ok(names.includes("superpowers:subagents"));
  assert.ok(names.includes("superpowers:executing-plans"));
  assert.ok(names.includes("superpowers:brainstorming"));
});

test("queryMarketSkills finds superpowers skills by query keyword", () => {
  const results = queryMarketSkills([], "superpowers");
  assert.ok(results.length >= 5);
  for (const r of results) {
    assert.ok(
      r.name.includes("superpowers") ||
      r.tags?.includes("superpowers") ||
      r.description.includes("superpowers")
    );
  }
});

test("queryMarketSkills matches by author, tag or description", () => {
  const byAuthor = queryMarketSkills([], "obra");
  assert.ok(byAuthor.length >= 5);

  // react-component-designer 有 react tag
  const byTag = queryMarketSkills([], "react");
  assert.ok(byTag.some((s) => s.name === "react-component-designer"));
});
