import fs from "fs";
import path from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { parseFrontmatter } from "@/lib/frontmatter";
import { setDisableModelInvocation } from "@/lib/skill-frontmatter";
import { readSubscriptions, writeSubscriptions, syncGitSubscription, resolveUpdateState } from "./skill-subscriptions";
import {
  getInstall,
  upsertInstall,
  readRegistry,
  localDirHash,
  remoteTreeHash,
  resolveCacheDir,
  listRelativeFiles,
  stripDisableLine,
  type SkillInstallRecord,
} from "./skill-install-registry";

export interface UpdateCheckItem {
  folder: string;
  updateState?: "up-to-date" | "update-available" | "conflict" | "unknown-origin";
  installedVersion?: string;
  latestVersion?: string;
  /** update-available / conflict 时的文件级变更清单（用于展开区展示） */
  changedFiles?: Array<{ path: string; kind: "added" | "removed" | "modified" }>;
}

export interface UpdateApplyResult {
  folder: string;
  success: boolean;
  before?: string;
  after?: string;
  unchanged?: boolean;
  conflict?: boolean;
  localHash?: string;
  baselineHash?: string;
  remoteHash?: string;
  changedFiles?: Array<{ path: string; kind: "added" | "removed" | "modified" }>;
  mode?: "keep";
  error?: string;
}

/** 目录名白名单：仅允许安全字符，防路径穿越（folder 直接拼进文件系统路径）。 */
const FOLDER_NAME_SAFE = /^[A-Za-z0-9._-]+$/;

function getUserSkillsDir(): string {
  const dir = path.join(getAgentDir(), "skills");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** 快照：relpath → 内容（SKILL.md 经 stripDisableLine，休眠行不产生虚假 modified）。 */
function snapshotDir(dir: string): Map<string, string> {
  const snap = new Map<string, string>();
  for (const rel of listRelativeFiles(dir)) {
    const raw = fs.readFileSync(path.join(dir, ...rel.split("/")), "utf8");
    snap.set(rel, path.basename(rel) === "SKILL.md" ? stripDisableLine(raw) : raw);
  }
  return snap;
}

/** 文件级变更清单（浅克隆无历史，文件级比对是唯一零成本来源）。 */
function diffDirChanges(oldDir: string, newDir: string): UpdateApplyResult["changedFiles"] {
  const oldSnap = snapshotDir(oldDir);
  const newSnap = snapshotDir(newDir);
  const out: NonNullable<UpdateApplyResult["changedFiles"]> = [];
  for (const [rel, content] of newSnap) {
    if (!oldSnap.has(rel)) {
      out.push({ path: rel, kind: "added" });
    } else if (oldSnap.get(rel) !== content) {
      out.push({ path: rel, kind: "modified" });
    }
  }
  for (const rel of oldSnap.keys()) {
    if (!newSnap.has(rel)) out.push({ path: rel, kind: "removed" });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** force 同步单个 git 订阅（TTL 绕过），返回订阅对象。 */
async function syncSubscriptionForce(subscriptionId: string): Promise<{ id: string; url: string }> {
  const subs = readSubscriptions();
  const sub = subs.find((s) => s.id === subscriptionId);
  if (!sub) throw new Error(`订阅不存在: ${subscriptionId}`);
  if (sub.type !== "git") throw new Error(`订阅不是 git 源，无法更新: ${subscriptionId}`);
  await syncGitSubscription(sub, { force: true });
  writeSubscriptions(subs); // 持久化 lastSyncedAt / error
  return sub;
}

/** 检查更新：force 同步后按登记表汇总已安装技能状态。 */
export async function checkUpdates(subscriptionId?: string): Promise<{ updates: UpdateCheckItem[] }> {
  const subs = readSubscriptions();
  const targets = subscriptionId ? subs.filter((s) => s.id === subscriptionId) : subs;
  for (const sub of targets) {
    if (sub.type !== "git") continue;
    await syncGitSubscription(sub, { force: true });
  }
  writeSubscriptions(subs);

  const registry = readRegistry();
  const updates: UpdateCheckItem[] = [];
  const userSkillsDir = getUserSkillsDir();
  for (const [folder, record] of Object.entries(registry.installs)) {
    if (subscriptionId && record.subscriptionId !== subscriptionId) continue;
    const sub = subs.find((s) => s.id === record.subscriptionId);
    if (!sub || sub.type !== "git" || record.origin === "unknown" || !record.skillPath) continue;
    const destDir = path.join(userSkillsDir, folder);
    if (!fs.existsSync(path.join(destDir, "SKILL.md"))) continue;
    const state = await resolveUpdateState({
      folderName: folder,
      cacheDir: resolveCacheDir(sub.id),
      skillDir: path.join(resolveCacheDir(sub.id), ...record.skillPath.split("/")),
      destDir,
      sub,
    });
    let changedFiles: UpdateCheckItem["changedFiles"];
    if (state.updateState === "update-available" || state.updateState === "conflict") {
      const cacheSkillDir = path.join(resolveCacheDir(sub.id), ...record.skillPath.split("/"));
      try {
        changedFiles = diffDirChanges(destDir, cacheSkillDir);
      } catch {
        changedFiles = undefined;
      }
    }
    updates.push({
      folder,
      updateState: state.updateState,
      installedVersion: state.installedVersion,
      latestVersion: state.latestVersion,
      changedFiles,
    });
  }
  updates.sort((a, b) => a.folder.localeCompare(b.folder));
  return { updates };
}

/**
 * 应用单条技能更新。
 * @param opts.force 覆盖本地偏离（conflict）
 * @param opts.keep 放弃远程改动：把基线推进到当前本地状态，清空可更新标记
 */
export async function applySkillUpdate(
  folder: string,
  opts: { force?: boolean; keep?: boolean } = {},
): Promise<UpdateApplyResult> {
  if (!FOLDER_NAME_SAFE.test(folder)) {
    return { folder, success: false, error: `非法目录名: ${folder}` };
  }
  const record = getInstall(folder);
  if (!record || record.origin === "unknown") {
    return { folder, success: false, error: `无来源登记（unknown-origin），拒绝更新: ${folder}` };
  }
  if (!record.subscriptionId || !record.skillPath || !record.sourceTreeHash) {
    return { folder, success: false, error: `登记信息不完整，拒绝更新: ${folder}` };
  }

  const sub = await syncSubscriptionForce(record.subscriptionId);
  const cacheDir = resolveCacheDir(sub.id);
  const cacheSrc = path.join(cacheDir, ...record.skillPath.split("/"));
  const destDir = path.join(getUserSkillsDir(), folder);

  if (!fs.existsSync(path.join(cacheSrc, "SKILL.md"))) {
    return { folder, success: false, error: "缓存源目录缺失，无法更新" };
  }
  if (!fs.existsSync(path.join(destDir, "SKILL.md"))) {
    return { folder, success: false, error: "本地安装目录缺失，无法更新" };
  }

  let latest: string;
  try {
    latest = await remoteTreeHash(cacheDir, record.skillPath);
  } catch (err) {
    return { folder, success: false, error: `读取远端版本失败: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (latest === record.sourceTreeHash) {
    return { folder, success: true, unchanged: true, before: latest, after: latest };
  }

  let currentLocal: string;
  try {
    currentLocal = localDirHash(destDir);
  } catch (err) {
    return { folder, success: false, error: `读取本地摘要失败: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (opts.keep) {
    upsertInstall({ ...record, baselineLocalHash: currentLocal, updatedAt: Date.now() });
    return { folder, success: true, mode: "keep", before: record.sourceTreeHash, after: record.sourceTreeHash };
  }

  if (record.baselineLocalHash && currentLocal !== record.baselineLocalHash && !opts.force) {
    return {
      folder,
      success: false,
      conflict: true,
      localHash: currentLocal,
      baselineHash: record.baselineLocalHash,
      remoteHash: latest,
    };
  }

  const changedFiles = diffDirChanges(destDir, cacheSrc);
  const userSkillsDir = getUserSkillsDir();
  const newDir = path.join(userSkillsDir, `${folder}.new-${Date.now().toString(36)}`);
  const oldDir = path.join(userSkillsDir, `${folder}.old-${Date.now().toString(36)}`);
  const before = record.sourceTreeHash;
  let wasDisabled = false;

  try {
    fs.cpSync(cacheSrc, newDir, { recursive: true });
    // 开关回写：旧副本休眠 → 新副本同样休眠（顺序：复制后、rename 前）
    const oldRaw = fs.readFileSync(path.join(destDir, "SKILL.md"), "utf8");
    const oldMeta = parseFrontmatter(oldRaw).data || {};
    wasDisabled = oldMeta["disable-model-invocation"] === true;
    if (wasDisabled) {
      const newRaw = fs.readFileSync(path.join(newDir, "SKILL.md"), "utf8");
      fs.writeFileSync(path.join(newDir, "SKILL.md"), setDisableModelInvocation(newRaw, true), "utf8");
    }

    fs.renameSync(destDir, oldDir);
    try {
      fs.renameSync(newDir, destDir);
    } catch (err) {
      // 回滚：恢复旧目录，清掉新目录
      fs.renameSync(oldDir, destDir);
      throw err;
    }
    fs.rmSync(oldDir, { recursive: true, force: true });
  } catch (err) {
    if (fs.existsSync(newDir)) fs.rmSync(newDir, { recursive: true, force: true });
    if (fs.existsSync(oldDir)) fs.renameSync(oldDir, destDir);
    return { folder, success: false, error: err instanceof Error ? err.message : String(err) };
  }

  upsertInstall({
    ...record,
    sourceTreeHash: latest,
    baselineLocalHash: localDirHash(destDir),
    disabled: wasDisabled,
    updatedAt: Date.now(),
  });

  return { folder, success: true, before, after: latest, changedFiles };
}

/** 源级批量更新：逐条串行应用，单条失败不影响其余。 */
export async function applySourceUpdates(subscriptionId: string): Promise<{ results: UpdateApplyResult[] }> {
  const registry = readRegistry();
  const folders = Object.entries(registry.installs)
    .filter(([, rec]) => rec.subscriptionId === subscriptionId && rec.origin !== "unknown")
    .map(([folder]) => folder)
    .sort();
  const results: UpdateApplyResult[] = [];
  for (const folder of folders) {
    try {
      results.push(await applySkillUpdate(folder));
    } catch (err) {
      results.push({
        folder,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { results };
}

// 类型引用占位：确保 SkillInstallRecord 未成为未使用导入（登记表结构稳定）
export type { SkillInstallRecord };
