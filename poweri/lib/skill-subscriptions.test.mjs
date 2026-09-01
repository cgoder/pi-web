import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": rootDir,
  },
});

const {
  generateSubscriptionId,
  detectSubscriptionType,
  readSubscriptions,
  writeSubscriptions,
} = await jiti.import("./skill-subscriptions.ts");

test("detectSubscriptionType recognizes Git URLs", () => {
  assert.equal(detectSubscriptionType("https://gitlab.litta.cn/litta/litta-skills.git"), "git");
  assert.equal(detectSubscriptionType("git@github.com:org/skills.git"), "git");
  assert.equal(detectSubscriptionType("https://github.com/someone/my-skill-repo"), "git");
});

test("detectSubscriptionType recognizes Manifest JSON/YAML URLs", () => {
  assert.equal(detectSubscriptionType("https://cdn.example.com/skills-manifest.json"), "manifest");
  assert.equal(detectSubscriptionType("https://company.internal/manifest.yaml"), "manifest");
});

test("generateSubscriptionId creates stable prefixed IDs", () => {
  const id1 = generateSubscriptionId("https://gitlab.litta.cn/litta/litta-skills.git");
  const id2 = generateSubscriptionId("https://gitlab.litta.cn/litta/litta-skills.git");
  const id3 = generateSubscriptionId("https://other.domain/repo.git");

  assert.match(id1, /^sub-[a-z0-9]+$/);
  assert.equal(id1, id2);
  assert.notEqual(id1, id3);
});

test("readSubscriptions and writeSubscriptions roundtrip with category", () => {
  const initial = readSubscriptions();
  const testSub = {
    id: "sub-test-roundtrip",
    url: "https://test.example.com/repo.git",
    name: "测试订阅源",
    category: "business",
    type: "git",
    addedAt: Date.now(),
  };

  writeSubscriptions([...initial, testSub]);
  const loaded = readSubscriptions();
  const found = loaded.find((s) => s.id === "sub-test-roundtrip");
  assert.ok(found);
  assert.equal(found.category, "business");

  // Clean up
  writeSubscriptions(initial);
  const restored = readSubscriptions();
  assert.equal(restored.some((s) => s.id === "sub-test-roundtrip"), false);
});
