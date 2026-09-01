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

const { mergeRemoteProviders } = await jiti.import("./model-subscriptions.ts");
const { readModelsConfig, writeModelsConfig } = await jiti.import("../../lib/models-config-store.ts");

test("mergeRemoteProviders correctly inserts and updates models in models.json", () => {
  const original = readModelsConfig();

  try {
    const testProviders = [
      {
        id: "test-litta-gw",
        name: "Test Litta Gateway",
        baseUrl: "https://test.litta.cn/v1",
        models: [
          {
            id: "test-model-1",
            name: "Test Model 1",
            contextWindow: 128000,
            cost: { input: 1.5, output: 6.0, cacheRead: 0.15, cacheWrite: 1.8 },
          },
        ],
      },
    ];

    const result = mergeRemoteProviders(testProviders);
    assert.ok(result.addedCount > 0 || result.updatedCount > 0);

    const updated = readModelsConfig();
    const providers = updated.providers;
    assert.ok(providers && typeof providers === "object");
    assert.ok("test-litta-gw" in providers);
  } finally {
    // 恢复现场
    writeModelsConfig(original);
  }
});
