import test from "node:test";
import assert from "node:assert/strict";
import {
  searchPiPackages,
  SNAPSHOT_OFFICIAL_PACKAGES,
  parsePiDevPackagesHtml,
  findPackageMetadata,
  getPiDevWebUrl,
} from "./packages-catalog.ts";

test("SNAPSHOT_OFFICIAL_PACKAGES covers all categories", () => {
  const categories = new Set(SNAPSHOT_OFFICIAL_PACKAGES.map((p) => p.category));
  assert.ok(categories.has("extension"));
  assert.ok(categories.has("skill"));
  assert.ok(categories.has("prompt"));
  assert.ok(categories.has("theme"));
  assert.ok(categories.has("package"));
});

test("getPiDevWebUrl correctly converts npm and bare package specs", () => {
  assert.equal(getPiDevWebUrl("npm:pi-subagents"), "https://pi.dev/packages/pi-subagents");
  assert.equal(getPiDevWebUrl("@companion-ai/feynman"), "https://pi.dev/packages/@companion-ai/feynman");
});

test("searchPiPackages supports pagination and category guarantees", async () => {
  const page1 = await searchPiPackages({ category: "all", page: 1, pageSize: 10 });
  assert.equal(page1.packages.length, 10);
  assert.equal(page1.page, 1);
  assert.ok(page1.hasMore);

  const prompts = await searchPiPackages({ category: "prompt", page: 1 });
  assert.ok(prompts.packages.length > 0);
  for (const item of prompts.packages) {
    assert.equal(item.category, "prompt");
  }

  const themes = await searchPiPackages({ category: "theme", page: 1 });
  assert.ok(themes.packages.length > 0);
  for (const item of themes.packages) {
    assert.equal(item.category, "theme");
  }
});
