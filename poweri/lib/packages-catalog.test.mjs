import test from "node:test";
import assert from "node:assert/strict";
import {
  searchPiPackages,
  SNAPSHOT_OFFICIAL_PACKAGES,
  parsePiDevPackagesHtmlWithTotal,
  findPackageMetadata,
  getPiDevWebUrl,
} from "./packages-catalog.ts";

test("SNAPSHOT_OFFICIAL_PACKAGES covers all categories and multi-type badges", () => {
  const categories = new Set(SNAPSHOT_OFFICIAL_PACKAGES.map((p) => p.category));
  assert.ok(categories.has("extension"));
  assert.ok(categories.has("skill"));
  assert.ok(categories.has("prompt"));
  assert.ok(categories.has("theme"));
  assert.ok(categories.has("package"));
  
  const subagents = SNAPSHOT_OFFICIAL_PACKAGES.find((p) => p.name === "pi-subagents");
  assert.ok(subagents);
  assert.ok(subagents.categories.includes("extension"));
  assert.ok(subagents.categories.includes("skill"));
});

test("getPiDevWebUrl correctly converts npm and bare package specs", () => {
  assert.equal(getPiDevWebUrl("npm:pi-subagents"), "https://pi.dev/packages/pi-subagents");
  assert.equal(getPiDevWebUrl("@companion-ai/feynman"), "https://pi.dev/packages/@companion-ai/feynman");
});

test("findPackageMetadata finds package description by source", () => {
  const meta = findPackageMetadata("npm:pi-mcp-adapter");
  assert.ok(meta);
  assert.equal(meta.name, "pi-mcp-adapter");
  assert.ok(meta.description?.includes("MCP"));
  assert.equal(meta.author, "nicopreme");
});

test("searchPiPackages supports sort parameters and returns correct sorting metadata", async () => {
  const res = await searchPiPackages({ category: "all", page: 1, sort: "downloads" });
  assert.ok(res.packages.length > 0);
  assert.equal(res.sortBy, "downloads");

  const resRecent = await searchPiPackages({ category: "all", page: 1, sort: "recent" });
  assert.ok(resRecent.packages.length > 0);
  assert.equal(resRecent.sortBy, "recent");
});
