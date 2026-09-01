import test from "node:test";
import assert from "node:assert/strict";
import {
  searchPiPackages,
  SNAPSHOT_OFFICIAL_PACKAGES,
  findPackageMetadata,
  getPiDevWebUrl,
  isSamePackage,
  normalizePackageSource,
} from "./packages-catalog.ts";

test("isSamePackage strictly differentiates scoped vs unscoped packages", () => {
  // 关键测试：严禁模糊匹配将不同 scope 的同名包误判为同一包
  assert.equal(isSamePackage("pi-subagents", "@tintinweb/pi-subagents"), false);
  assert.equal(isSamePackage("pi-subagents", "@ferris1225/pi-subagents"), false);
  assert.equal(isSamePackage("@narumitw/pi-subagents", "@tintinweb/pi-subagents"), false);

  // 相同包名的各种格式归一化后匹配
  assert.equal(isSamePackage("npm:pi-subagents", "pi-subagents"), true);
  assert.equal(isSamePackage("npm:pi-subagents@1.0.0", "pi-subagents"), true);
  assert.equal(isSamePackage("npm:@tintinweb/pi-subagents@0.19.0", "@tintinweb/pi-subagents"), true);
  assert.equal(isSamePackage("git:github.com/user/repo", "https://github.com/user/repo.git"), true);
});

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
