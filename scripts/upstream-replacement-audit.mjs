#!/usr/bin/env node
/**
 * 替换件上游同步审计脚本
 *
 * 背景：PowerI 用 poweri/ 下的替换组件/API 替代上游文件，上游后续改动不会自动流入
 * 替换件（分层架构 ADR-0002）。本脚本依据 docs/desktop/replacements.json 的
 * "替换件↔上游对照文件 + watermark" 登记表，把"上游新增了什么、替换件是否过账"
 * 从静默变成必答项。
 *
 * 用法：
 *   node scripts/upstream-replacement-audit.mjs list [--json]      # 人工审计报告
 *   node scripts/upstream-replacement-audit.mjs check              # CI 模式：有未过账上游提交则 exit 1
 *   node scripts/upstream-replacement-audit.mjs ack --entry <poweri路径> --watermark <commit>
 *        [--waive <commit> --reason "..."] [--unwaive <commit>]
 *        [--pending <commit> --reason "..."] [--done <commit>]      # 审查后更新登记表
 *
 * CI 前置：先 git fetch upstream（workflow 已包含）。
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_PATH = path.join(ROOT, "docs/desktop/replacements.json");

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (err) {
    if (allowFailure) return null;
    console.error(`git ${args.join(" ")} 失败：${err.message}`);
    process.exit(2);
  }
}

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    console.error(`登记表不存在：${REGISTRY_PATH}`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
}

function saveRegistry(registry) {
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n");
}

/** 登记表中的 commit 统一存 12 位短 hash；比较时双向前缀匹配以兼容 7/12/40 位 */
function sameCommit(a, b) {
  return a.startsWith(b) || b.startsWith(a);
}

/** 解析短 hash 为完整 hash（校验存在性），返回 {full, short} */
function resolveCommit(ref) {
  const full = git(["rev-parse", "--verify", `${ref}^{commit}`], { allowFailure: true });
  if (!full) {
    console.error(`无法解析提交：${ref}`);
    process.exit(2);
  }
  return { full, short: full.slice(0, 12) };
}

/** watermark..upstreamRef 之间触及上游对照文件的提交（旧→新） */
function upstreamCommitsSince(upstreamRef, watermark, upstreamPath) {
  const out = git(
    ["log", "--reverse", "--format=%H%x09%s", `${watermark}..${upstreamRef}`, "--", upstreamPath],
    { allowFailure: true },
  );
  if (!out) return [];
  return out.split("\n").filter(Boolean).map((line) => {
    const [hash, ...rest] = line.split("\t");
    return { hash, short: hash.slice(0, 12), title: rest.join("\t") };
  });
}

/** 检测 app/poweri/api 对上游 app/api 的同名遮蔽路由 */
function detectApiShadows(registry) {
  const out = git(["ls-files", "app/poweri/api"], { allowFailure: true });
  if (!out) return [];
  const shadows = [];
  for (const file of out.split("\n").filter((f) => f.endsWith("/route.ts"))) {
    const upstreamPath = file.replace("app/poweri/api/", "app/api/");
    const exists = git(["cat-file", "-e", `${registry.upstreamRef}:${upstreamPath}`], { allowFailure: true }) !== null;
    if (!exists) continue;
    const registered = registry.replacements.some((r) => r.poweri === file);
    shadows.push({ poweriRoute: file, upstreamRoute: upstreamPath, registered });
  }
  return shadows;
}

function auditEntry(entry, upstreamRef) {
  const commits = upstreamCommitsSince(upstreamRef, entry.watermark, entry.upstream);
  const waivedShorts = new Set((entry.waived ?? []).map((w) => w.commit));
  // watermark 之后的新提交不应与 waived/pending 重叠（它们应 ≤ watermark），
  // 若重叠说明登记不一致，提示人工修正。
  const inconsistent = commits.filter((c) => [...waivedShorts].some((w) => sameCommit(w, c.short)));
  return { ...entry, newCommits: commits, inconsistent };
}

function cmdList({ json }) {
  const registry = loadRegistry();
  const results = registry.replacements.map((entry) => auditEntry(entry, registry.upstreamRef));
  const shadows = detectApiShadows(registry);

  if (json) {
    console.log(JSON.stringify({ upstreamRef: registry.upstreamRef, results, shadows }, null, 2));
    return 0;
  }

  let hasNew = false;
  let hasPending = false;
  console.log(`上游 ref：${registry.upstreamRef}`);
  for (const r of results) {
    const lines = [];
    lines.push(`\n== ${r.poweri}`);
    lines.push(`   ↔ ${r.upstream}   watermark=${r.watermark}`);
    if (r.note) lines.push(`   备注：${r.note}`);
    if (r.inconsistent.length > 0) {
      lines.push(`   ⚠ 登记不一致：以下提交已过 watermark 却又在 waived 列表，请人工修正：`);
      for (const c of r.inconsistent) lines.push(`     - ${c.short} ${c.title}`);
    }
    if (r.newCommits.length > 0) {
      hasNew = true;
      lines.push(`   ✗ 有 ${r.newCommits.length} 个未过账的上游提交：`);
      for (const c of r.newCommits) lines.push(`     - ${c.short} ${c.title}`);
    } else {
      lines.push(`   ✓ 无未过账的上游提交`);
    }
    if ((r.pending ?? []).length > 0) {
      hasPending = true;
      lines.push(`   ◦ 已知待办 ${r.pending.length} 项：`);
      for (const p of r.pending) lines.push(`     - ${p.commit} ${p.reason}`);
    }
    if ((r.waived ?? []).length > 0) {
      lines.push(`   · 豁免 ${r.waived.length} 项（刻意不移植）`);
    }
    console.log(lines.join("\n"));
  }

  if (shadows.length > 0) {
    console.log(`\n== API 路由遮蔽（app/poweri/api ↔ app/api）`);
    for (const s of shadows) {
      console.log(`   ${s.registered ? "✓ 已登记" : "✗ 未登记"}：${s.poweriRoute} ↔ ${s.upstreamRoute}`);
      if (!s.registered) hasNew = true;
    }
  }

  console.log(`\n汇总：${hasNew ? "存在未过账上游改动（先审查，再 --ack 推进）" : "登记表与上游一致"}` +
    `${hasPending ? `；另有已知待办项（见上）` : ""}`);
  return hasNew ? 1 : 0;
}

function cmdCheck() {
  const registry = loadRegistry();
  let failed = false;

  for (const entry of registry.replacements) {
    const r = auditEntry(entry, registry.upstreamRef);
    if (r.inconsistent.length > 0) {
      failed = true;
      console.error(`✗ ${r.poweri}：登记不一致（waived 与新提交重叠）`);
    }
    if (r.newCommits.length > 0) {
      failed = true;
      console.error(`✗ ${r.poweri} ↔ ${r.upstream}：${r.newCommits.length} 个未过账上游提交`);
      for (const c of r.newCommits) console.error(`    ${c.short} ${c.title}`);
      console.error(`    → 人工审查后移植或豁免，再运行 ack 推进 watermark`);
    }
  }

  for (const s of detectApiShadows(registry)) {
    if (!s.registered) {
      failed = true;
      console.error(`✗ 新增 API 路由遮蔽未登记：${s.poweriRoute} ↔ ${s.upstreamRoute}`);
      console.error(`    → 在 replacements.json 登记对照关系，或重命名 poweri 路由`);
    }
  }

  // pending 是已知事项，不阻断 CI，但要在日志里可见。
  for (const entry of registry.replacements) {
    for (const p of entry.pending ?? []) {
      console.error(`◦ 待办：${entry.poweri} ← ${p.commit} ${p.reason}`);
    }
  }

  if (failed) {
    console.error(`\ncheck 未通过：替换件与上游存在未过账差异。`);
    return 1;
  }
  console.error(`check 通过：替换件登记表与 ${registry.upstreamRef} 一致。`);
  return 0;
}

function cmdAck(args) {
  const registry = loadRegistry();
  const entryPath = args.get("entry");
  if (!entryPath) {
    console.error("ack 需要 --entry <poweri路径>");
    process.exit(2);
  }
  const entry = registry.replacements.find((r) => r.poweri === entryPath);
  if (!entry) {
    console.error(`登记表中不存在：${entryPath}`);
    process.exit(2);
  }

  const watermark = args.get("watermark");
  if (watermark) {
    const { short, full } = resolveCommit(watermark);
    // 安全检查：新 watermark 必须包含旧 watermark（只前进不回退）
    const isAncestor = git(["merge-base", "--is-ancestor", entry.watermark, full], { allowFailure: true }) !== null;
    if (!isAncestor) {
      console.error(`拒绝：新 watermark ${short} 不包含旧 watermark ${entry.watermark}（只允许前进）`);
      process.exit(2);
    }
    const between = upstreamCommitsSince(registry.upstreamRef, entry.watermark, entry.upstream)
      .filter((c) => {
        // 水位推进区间内的提交必须已被移植（随水位过账）或显式豁免
        const waived = (entry.waived ?? []).some((w) => sameCommit(w.commit, c.short));
        const pending = (entry.pending ?? []).some((p) => sameCommit(p.commit, c.short));
        return !waived && !pending;
      });
    if (between.length > 0) {
      console.error(`拒绝：以下 ${entry.upstream} 提交未处置（移植或 --waive / --pending）即推进水位：`);
      for (const c of between) console.error(`  ${c.short} ${c.title}`);
      process.exit(2);
    }
    entry.watermark = short;
    // 水位推进后清空已覆盖的 pending
    entry.pending = (entry.pending ?? []).filter((p) => !sameCommit(p.commit, short));
    console.log(`✓ ${entryPath} watermark → ${short}`);
  }

  const waive = args.get("waive");
  if (waive) {
    const reason = args.get("reason");
    if (!reason) {
      console.error("--waive 必须搭配 --reason");
      process.exit(2);
    }
    const { short } = resolveCommit(waive);
    entry.waived = entry.waived ?? [];
    if (!entry.waived.some((w) => sameCommit(w.commit, short))) {
      entry.waived.push({ commit: short, reason });
      entry.pending = (entry.pending ?? []).filter((p) => !sameCommit(p.commit, short));
      console.log(`✓ ${entryPath} 豁免 ${short}：${reason}`);
    }
  }

  const unwaive = args.get("unwaive");
  if (unwaive) {
    const { short } = resolveCommit(unwaive);
    entry.waived = (entry.waived ?? []).filter((w) => !sameCommit(w.commit, short));
    console.log(`✓ ${entryPath} 取消豁免 ${short}`);
  }

  const pending = args.get("pending");
  if (pending) {
    const reason = args.get("reason") ?? "待审查";
    const { short } = resolveCommit(pending);
    entry.pending = entry.pending ?? [];
    if (!entry.pending.some((p) => sameCommit(p.commit, short))) {
      entry.pending.push({ commit: short, reason });
      console.log(`✓ ${entryPath} 待办 ${short}：${reason}`);
    }
  }

  const done = args.get("done");
  if (done) {
    const { short } = resolveCommit(done);
    const before = (entry.pending ?? []).length;
    entry.pending = (entry.pending ?? []).filter((p) => !sameCommit(p.commit, short));
    console.log(`✓ ${entryPath} 待办完成 ${short}（${before - (entry.pending ?? []).length} 项移除）`);
  }

  saveRegistry(registry);
  return 0;
}

function parseArgs(argv) {
  const map = new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        map.set(arg.slice(2), next);
        i++;
      } else {
        map.set(arg.slice(2), "");
      }
    }
  }
  return map;
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
let exitCode;
switch (command) {
  case "list":
    exitCode = cmdList({ json: args.has("json") });
    break;
  case "check":
    exitCode = cmdCheck();
    break;
  case "ack":
    exitCode = cmdAck(args);
    break;
  default:
    console.error("用法：upstream-replacement-audit.mjs <list|check|ack> [参数]（--help 见文件头注释）");
    exitCode = 2;
}
process.exit(exitCode);
