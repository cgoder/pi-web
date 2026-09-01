import test from "node:test";
import assert from "node:assert/strict";
import {
  searchPiPackages,
  SNAPSHOT_OFFICIAL_PACKAGES,
  parsePiDevPackagesHtml,
  findPackageMetadata,
  getPiDevWebUrl,
} from "./packages-catalog.ts";

test("SNAPSHOT_OFFICIAL_PACKAGES contains standard official packages", () => {
  assert.ok(SNAPSHOT_OFFICIAL_PACKAGES.length >= 10);
  const mcp = SNAPSHOT_OFFICIAL_PACKAGES.find((p) => p.name === "pi-mcp-adapter");
  assert.ok(mcp);
  assert.equal(mcp.category, "extension");
  assert.ok(mcp.installCommand.startsWith("npm:"));
  assert.equal(mcp.webUrl, "https://pi.dev/packages/pi-mcp-adapter");
});

test("getPiDevWebUrl correctly converts npm and bare package specs", () => {
  assert.equal(getPiDevWebUrl("npm:pi-subagents"), "https://pi.dev/packages/pi-subagents");
  assert.equal(getPiDevWebUrl("@companion-ai/feynman"), "https://pi.dev/packages/@companion-ai/feynman");
});

test("parsePiDevPackagesHtml parses raw official HTML structure correctly", () => {
  const sampleHtml = `
    <article class="surface-panel content-card" data-package-card="true" data-package-name="test-plugin" data-package-types="extension" data-package-downloads="12345">
      <div class="packages-card-body">
        <h3 class="packages-name"><a href="/packages/test-plugin">test-plugin</a></h3>
        <p class="packages-desc">This is a test description for plugin</p>
        <div class="packages-meta"><span>authorName</span><span>12.3K/mo</span><span>1d ago</span></div>
      </div>
    </article>
  `;
  const items = parsePiDevPackagesHtml(sampleHtml);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, "test-plugin");
  assert.equal(items[0].category, "extension");
  assert.equal(items[0].description, "This is a test description for plugin");
  assert.equal(items[0].author, "authorName");
  assert.equal(items[0].downloads, "12.3K/mo");
  assert.equal(items[0].webUrl, "https://pi.dev/packages/test-plugin");
});

test("findPackageMetadata finds package description by source", () => {
  const meta = findPackageMetadata("npm:pi-mcp-adapter");
  assert.ok(meta);
  assert.equal(meta.name, "pi-mcp-adapter");
  assert.ok(meta.description?.includes("MCP"));
});

test("searchPiPackages returns deterministic results", async () => {
  const all = await searchPiPackages({ category: "all" });
  assert.ok(all.length >= 10);
  const skills = await searchPiPackages({ category: "skill" });
  assert.ok(skills.length > 0);
  for (const item of skills) {
    assert.equal(item.category, "skill");
  }
});
