import test from "node:test";
import assert from "node:assert/strict";
import { searchPiPackages, POPULAR_PI_PACKAGES } from "./packages-catalog.ts";

test("POPULAR_PI_PACKAGES contains standard official packages", () => {
  assert.ok(POPULAR_PI_PACKAGES.length >= 10);
  const mcp = POPULAR_PI_PACKAGES.find((p) => p.name === "pi-mcp-adapter");
  assert.ok(mcp);
  assert.equal(mcp.category, "extension");
  assert.ok(mcp.installCommand.startsWith("npm:"));
});

test("searchPiPackages filters by category", async () => {
  const skills = await searchPiPackages({ category: "skill" });
  assert.ok(skills.length > 0);
  for (const item of skills) {
    assert.equal(item.category, "skill");
  }
});

test("searchPiPackages filters by query string", async () => {
  const query = "subagent";
  const results = await searchPiPackages({ query });
  assert.ok(results.length > 0);
  assert.ok(results.some((r) => r.name.includes("subagent")));
});
