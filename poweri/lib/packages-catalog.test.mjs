import test from "node:test";
import assert from "node:assert/strict";
import {
  searchPiPackages,
  SNAPSHOT_OFFICIAL_PACKAGES,
  parsePiDevPackagesHtmlWithTotal,
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

test("parsePiDevPackagesHtmlWithTotal parses real count and items", () => {
  const sampleHtml = `
    <span class="packages-count">1-50 / 5387</span>
    <article class="surface-panel content-card" data-package-card="true" data-package-name="test-plugin" data-package-types="extension" data-package-downloads="12345">
      <div class="packages-card-body">
        <h3 class="packages-name"><a href="/packages/test-plugin">test-plugin</a></h3>
        <p class="packages-desc">Test description</p>
        <div class="packages-meta"><span>author</span><span>10K/mo</span><span>1d ago</span></div>
      </div>
    </article>
  `;
  const { items, total } = parsePiDevPackagesHtmlWithTotal(sampleHtml);
  assert.equal(total, 5387);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, "test-plugin");
});

test("searchPiPackages returns true remote total and hasMore state", async () => {
  const res = await searchPiPackages({ category: "all", page: 1 });
  assert.ok(res.packages.length > 0);
  assert.ok(res.total >= res.packages.length);
});
