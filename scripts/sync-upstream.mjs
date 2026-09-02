#!/usr/bin/env node
/**
 * upstream 分支跟随上游脚本（分支模型见 docs/desktop/branch-model.md）
 *
 * upstream 分支是 agegr/pi-web 的纯净镜像：只 fast-forward，永不携带自有提交。
 * 本脚本完成镜像层的全部机械步骤：
 *   1. git fetch upstream main:upstream —— 非 ff 更新会被 git 拒绝（防镜像被污染）
 *   2. git push origin upstream         —— 同步镜像到 origin
 *
 * 不自动做 poweri / desktop 层的合并：何时同步、冲突如何消化、替换件如何
 * 过账（scripts/upstream-replacement-audit.mjs）都是人工决策点，见脚本末尾提示。
 *
 * 用法：node scripts/sync-upstream.mjs
 */

import { spawnSync } from "node:child_process";

function run(args) {
  const r = spawnSync("git", args, { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\n[sync-upstream] git ${args.join(" ")} 失败（exit ${r.status}），中止。`);
    process.exit(r.status ?? 1);
  }
}

// 1. ff-only 跟随上游：main:upstream 的 refspec 默认拒绝非快进更新，
//    一旦上游 force push（镜像会分叉），此处会失败并中止，镜像永不被改写。
run(["fetch", "upstream", "main:upstream"]);

// 2. 同步镜像到 origin
run(["push", "origin", "upstream"]);

console.log(`
[sync-upstream] upstream 分支已跟随到上游 HEAD 并推送 origin。
后续手动步骤（人工决策）：
  1. git checkout poweri && git merge upstream
     → node scripts/upstream-replacement-audit.mjs check   （替换件逐项移植或 ack --waive）
     → node scripts/upstream-replacement-audit.mjs ack --watermark && ... check
  2. git push origin poweri
  3. git checkout desktop && git merge poweri && git push origin desktop
`);
