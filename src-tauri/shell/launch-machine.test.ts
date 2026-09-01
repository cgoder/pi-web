/**
 * Launch FSM upgrade-flow tests. Run with:
 *   node --experimental-strip-types --test shell/launch-machine.test.ts
 * (Node ≥ 22.6; the shell has no npm test script of its own.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLaunchMachine } from "./launch-machine.ts";

function booted() {
  const m = createLaunchMachine(30141);
  m.event({ type: "boot" });
  m.event({ type: "spawned" });
  m.event({ type: "ready" });
  return m;
}

test("upgrade: ready → upgrading shows the wizard with step 2 busy", () => {
  const m = booted();
  m.event({ type: "upgrade-start" });
  const v = m.view();
  assert.equal(v.state, "upgrading");
  assert.equal(v.expanded, true);
  assert.deepEqual(v.steps, ["done", "busy", "todo"]);
  assert.equal(v.title, "正在升级 PowerI");
  assert.equal(v.activeStep, 2);
});

test("upgrade: npm fetch lines drive the download progress", () => {
  const m = booted();
  m.event({ type: "upgrade-start" });
  m.event({ type: "npm-fetch-line" });
  m.event({ type: "npm-fetch-line" });
  m.event({ type: "npm-fetch-line" });
  const v = m.view();
  assert.equal(v.fetchCount, 3);
  assert.match(v.detail, /已下载 3 个包/);
});

test("upgrade: done → starting shows the restart wording, ready completes", () => {
  const m = booted();
  m.event({ type: "upgrade-start" });
  m.event({ type: "upgrade-done", version: "9.9.9" });
  let v = m.view();
  assert.equal(v.state, "starting");
  assert.equal(v.title, "正在重启 PowerI");
  assert.deepEqual(v.steps, ["done", "done", "busy"]);
  m.event({ type: "ready" });
  v = m.view();
  assert.equal(v.state, "ready");
  assert.deepEqual(v.steps, ["done", "done", "done"]);
});

test("upgrade: finished (foreign server) returns to ready", () => {
  const m = booted();
  m.event({ type: "upgrade-start" });
  m.event({ type: "upgrade-finished", version: "9.9.9" });
  const v = m.view();
  assert.equal(v.state, "ready");
  assert.equal(v.installedVersion, "9.9.9");
});

test("upgrade: failure enters error-upgradeFailed, retry re-enters upgrading", () => {
  const m = booted();
  m.event({ type: "upgrade-start" });
  m.event({ type: "upgrade-failed", message: "npm 超时" });
  let v = m.view();
  assert.equal(v.state, "error-upgradeFailed");
  assert.equal(v.expanded, true);
  assert.deepEqual(v.steps, ["done", "fail", "todo"]);
  assert.equal(v.error?.title, "升级失败");
  assert.equal(v.error?.retryLabel, "重试升级");
  m.event({ type: "retry" });
  v = m.view();
  assert.equal(v.state, "upgrading");
});

test("upgrade: stop/exited during upgrading are ignored (old server teardown)", () => {
  const m = booted();
  m.event({ type: "upgrade-start" });
  m.event({ type: "stop" });
  m.event({ type: "exited" });
  assert.equal(m.view().state, "upgrading");
});

test("upgrade: start from stopped state also works", () => {
  const m = booted();
  m.event({ type: "stop" });
  assert.equal(m.view().state, "stopped");
  m.event({ type: "upgrade-start" });
  assert.equal(m.view().state, "upgrading");
});

test("upgrade: retry resets the fetch counter", () => {
  const m = booted();
  m.event({ type: "upgrade-start" });
  m.event({ type: "npm-fetch-line" });
  m.event({ type: "npm-fetch-line" });
  m.event({ type: "upgrade-failed", message: "网络中断" });
  m.event({ type: "retry" });
  assert.equal(m.view().fetchCount, 0);
});

test("launch: plain start path is unaffected by the new states", () => {
  const m = createLaunchMachine(30141);
  m.event({ type: "boot" });
  m.event({ type: "install-start" });
  m.event({ type: "installed", version: "1.2.3" });
  m.event({ type: "ready" });
  const v = m.view();
  assert.equal(v.state, "ready");
  assert.deepEqual(v.steps, ["done", "done", "done"]);
  assert.equal(v.title, "");
});
