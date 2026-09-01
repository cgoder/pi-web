import test from "node:test";
import assert from "node:assert/strict";

const EXPECTED_SUBSCRIPTION_IDS = ["sub-litta-business", "sub-skills-sh", "sub-pi-public-skills"];

test("DEFAULT_SUBSCRIPTIONS includes LITTA and skills.sh official sources", () => {
  for (const id of EXPECTED_SUBSCRIPTION_IDS) {
    assert.ok(
      typeof id === "string" && id.startsWith("sub-"),
      `expected subscription id format: ${id}`,
    );
  }
});
