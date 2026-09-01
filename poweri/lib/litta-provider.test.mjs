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
  LITTA_DEFAULT_BASE_URL,
  LITTA_PROVIDER_ID,
  getLittaConfig,
  saveLittaConfig,
  enrichModelMetadata,
} = await jiti.import("./litta-provider.ts");

test("LITTA provider defaults", () => {
  assert.equal(LITTA_DEFAULT_BASE_URL, "https://llms.litta.cn/");
  assert.equal(LITTA_PROVIDER_ID, "litta");
});

test("enrichModelMetadata adds appropriate context and reasoning flags", () => {
  const claude = enrichModelMetadata({ id: "claude-3-7-sonnet" });
  assert.equal(claude.name, "Claude 3.7 Sonnet");
  assert.equal(claude.contextWindow, 200000);
  assert.equal(claude.reasoning, true);

  const deepseek = enrichModelMetadata({ id: "deepseek-r1" });
  assert.equal(deepseek.name, "DeepSeek R1 (Reasoning)");
  assert.equal(deepseek.reasoning, true);

  const generic = enrichModelMetadata({ id: "custom-model" });
  assert.equal(generic.name, "custom-model");
  assert.equal(generic.enabled, true);
});

test("saveLittaConfig and getLittaConfig roundtrip", () => {
  const prevConfig = getLittaConfig();

  saveLittaConfig({
    apiKey: "sk-test-litta-key-12345",
    baseUrl: "https://llms.litta.cn/",
    api: "openai-completions",
    models: [
      { id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet", enabled: true },
    ],
  });

  const updated = getLittaConfig();
  assert.equal(updated.apiKey, "sk-test-litta-key-12345");
  assert.equal(updated.configured, true);
  assert.equal(updated.baseUrl, "https://llms.litta.cn/");
  assert.equal(updated.models.length, 1);
  assert.equal(updated.models[0].id, "claude-3-7-sonnet");

  // Restore
  saveLittaConfig(prevConfig);
});
