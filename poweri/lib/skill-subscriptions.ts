import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { setDisableModelInvocation } from "../../lib/skill-frontmatter";
import { parseFrontmatter } from "../../lib/frontmatter";
import { loadSkillsWithInstallInfo } from "../../lib/skills-service";

const execFileAsync = promisify(execFile);

export type SkillCategory = "public" | "business";

export interface SkillSubscription {
  id: string;
  url: string;
  name?: string;
  category: SkillCategory;
  type: "git" | "manifest" | "url";
  authType?: "none" | "token";
  token?: string;
  addedAt: number;
  lastSyncedAt?: number;
  error?: string;
  isDefault?: boolean;
}

export interface MarketSkillItem {
  id: string;
  name: string;
  description: string;
  version?: string;
  tags?: string[];
  author?: string;
  category: SkillCategory;
  sourceLabel?: string;
  subscriptionId: string;
  subscriptionUrl: string;
  sourceType: "git" | "manifest" | "builtin" | "local";
  installed: boolean;
  enabled: boolean;
  localPath?: string;
  rawContent?: string;
}

export interface MarketManifest {
  name?: string;
  description?: string;
  version?: string;
  category?: SkillCategory;
  skills: Array<{
    id: string;
    name: string;
    description: string;
    version?: string;
    tags?: string[];
    author?: string;
    category?: SkillCategory;
    source?: string;
    path?: string;
    content?: string;
  }>;
}

const DEFAULT_SUBSCRIPTIONS: SkillSubscription[] = [
  {
    id: "sub-litta-business",
    url: "https://gitlab.litta.cn/litta/litta-skills.git",
    name: "LITTA 团队业务技能源",
    category: "business",
    type: "git",
    addedAt: 1700000000000,
    isDefault: true,
  },
  {
    id: "sub-pi-public-skills",
    url: "https://github.com/earendil-works/pi-skills.git",
    name: "Pi 官方公共精选技能",
    category: "public",
    type: "git",
    addedAt: 1700000000000,
    isDefault: true,
  },
];

function getSubscriptionsFilePath(): string {
  const dir = getAgentDir();
  return path.join(dir, "poweri-subscriptions.json");
}

function getSubscriptionsCacheDir(): string {
  const dir = path.join(getAgentDir(), "git-subscriptions");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getUserSkillsDir(): string {
  const dir = path.join(getAgentDir(), "skills");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function readSubscriptions(): SkillSubscription[] {
  const file = getSubscriptionsFilePath();
  if (!fs.existsSync(file)) {
    // 首次自动写入默认预设源
    try {
      writeSubscriptions(DEFAULT_SUBSCRIPTIONS);
    } catch {
      // ignore
    }
    return DEFAULT_SUBSCRIPTIONS;
  }
  try {
    const raw = fs.readFileSync(file, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return DEFAULT_SUBSCRIPTIONS;
    // 确保每个订阅都有 category
    return data.map((sub: SkillSubscription) => ({
      ...sub,
      category: sub.category || (sub.url.includes("gitlab.") ? "business" : "public"),
    }));
  } catch {
    return DEFAULT_SUBSCRIPTIONS;
  }
}

export function writeSubscriptions(subs: SkillSubscription[]): void {
  const file = getSubscriptionsFilePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(file, JSON.stringify(subs, null, 2), "utf8");
}

export function generateSubscriptionId(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return `sub-${Math.abs(hash).toString(36)}`;
}

export function detectSubscriptionType(url: string): "git" | "manifest" | "url" {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.endsWith(".git") || trimmed.startsWith("git@") || trimmed.startsWith("git://") || trimmed.includes("gitlab.") || trimmed.includes("github.com/")) {
    return "git";
  }
  if (trimmed.endsWith(".json") || trimmed.endsWith(".yaml") || trimmed.endsWith(".yml")) {
    return "manifest";
  }
  return "url";
}

/**
 * 递归查找目录下的所有 SKILL.md 文件
 */
function findSkillFiles(dir: string, results: string[] = [], depth = 0): string[] {
  if (depth > 5 || !fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findSkillFiles(fullPath, results, depth + 1);
    } else if (entry.isFile() && (entry.name === "SKILL.md" || entry.name.endsWith(".skill.md"))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * 解析单个 SKILL.md 文件内容并提取元数据
 */
function parseSkillFile(filePath: string): { name: string; description: string; disabled: boolean; category?: SkillCategory } {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const { data, rest } = parseFrontmatter(raw);
    const name = (typeof data?.name === "string" ? data.name : null)
      ?? (typeof data?.title === "string" ? data.title : null)
      ?? path.basename(path.dirname(filePath));
    const description = (typeof data?.description === "string" ? data.description : null)
      ?? rest.slice(0, 160).trim();
    const disabled = data?.["disable-model-invocation"] === true;
    const category = (data?.category === "business" || data?.category === "public") ? data.category : undefined;
    return { name, description, disabled, category };
  } catch {
    const folder = path.basename(path.dirname(filePath));
    return { name: folder, description: "", disabled: false };
  }
}

/**
 * 同步一个 Git 仓库订阅源
 */
async function syncGitSubscription(sub: SkillSubscription): Promise<MarketSkillItem[]> {
  const cacheDir = getSubscriptionsCacheDir();
  const repoDirName = sub.id;
  const targetDir = path.join(cacheDir, repoDirName);

  let cloneUrl = sub.url;
  if (sub.token && cloneUrl.startsWith("https://")) {
    // 注入 Token 用于私有 GitLab / GitHub 鉴权
    const withoutHttps = cloneUrl.replace(/^https:\/\//, "");
    cloneUrl = `https://oauth2:${encodeURIComponent(sub.token)}@${withoutHttps}`;
  }

  if (!fs.existsSync(targetDir)) {
    // 首次 Clone
    await execFileAsync("git", ["clone", "--depth", "1", cloneUrl, targetDir], { timeout: 30000 });
  } else {
    // 拉取最新
    try {
      await execFileAsync("git", ["pull", "--ff-only"], { cwd: targetDir, timeout: 20000 });
    } catch {
      // 容错：如果 pull 失败，重新克隆
      fs.rmSync(targetDir, { recursive: true, force: true });
      await execFileAsync("git", ["clone", "--depth", "1", cloneUrl, targetDir], { timeout: 30000 });
    }
  }

  const skillFiles = findSkillFiles(targetDir);
  const items: MarketSkillItem[] = [];

  for (const skillFile of skillFiles) {
    const { name, description, disabled, category } = parseSkillFile(skillFile);
    const skillFolderName = path.basename(path.dirname(skillFile));
    const skillId = `${sub.id}-${skillFolderName}`;

    // 检查本地 user skills 目录是否已安装该 skill
    const userSkillTarget = path.join(getUserSkillsDir(), skillFolderName);
    const isInstalled = fs.existsSync(userSkillTarget);
    let isEnabled = !disabled;
    if (isInstalled) {
      const localFile = path.join(userSkillTarget, "SKILL.md");
      if (fs.existsSync(localFile)) {
        const localMeta = parseSkillFile(localFile);
        isEnabled = !localMeta.disabled;
      }
    }

    items.push({
      id: skillId,
      name: name || skillFolderName,
      description: description || (sub.category === "business" ? "来自团队业务订阅源的技能" : "来自公共精选源的技能"),
      category: category || sub.category,
      sourceLabel: sub.name || (sub.category === "business" ? "业务源" : "公共源"),
      subscriptionId: sub.id,
      subscriptionUrl: sub.url,
      sourceType: "git",
      installed: isInstalled,
      enabled: isInstalled && isEnabled,
      localPath: skillFile,
    });
  }

  return items;
}

/**
 * 同步 Manifest 订阅源 (HTTP JSON)
 */
async function syncManifestSubscription(sub: SkillSubscription): Promise<MarketSkillItem[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (sub.token) {
    headers["Authorization"] = `Bearer ${sub.token}`;
  }
  const res = await fetch(sub.url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const manifest = (await res.json()) as MarketManifest;
  if (!Array.isArray(manifest.skills)) {
    return [];
  }

  const items: MarketSkillItem[] = [];
  const userSkillsDir = getUserSkillsDir();

  for (const skill of manifest.skills) {
    const userSkillTarget = path.join(userSkillsDir, skill.id);
    const isInstalled = fs.existsSync(userSkillTarget);
    let isEnabled = true;
    if (isInstalled) {
      const localFile = path.join(userSkillTarget, "SKILL.md");
      if (fs.existsSync(localFile)) {
        const localMeta = parseSkillFile(localFile);
        isEnabled = !localMeta.disabled;
      }
    }

    items.push({
      id: skill.id,
      name: skill.name || skill.id,
      description: skill.description || "",
      version: skill.version,
      tags: skill.tags,
      author: skill.author,
      category: skill.category || manifest.category || sub.category,
      sourceLabel: sub.name || (sub.category === "business" ? "业务清单" : "公共清单"),
      subscriptionId: sub.id,
      subscriptionUrl: sub.url,
      sourceType: "manifest",
      installed: isInstalled,
      enabled: isInstalled && isEnabled,
      rawContent: skill.content,
    });
  }

  return items;
}

/**
 * 获取所有市场技能（结合已安装的本地 Skills 与所有订阅源，可指定分类）
 */
export async function getMarketSkills(
  cwd: string,
  categoryFilter?: SkillCategory | "all",
): Promise<{
  skills: MarketSkillItem[];
  subscriptions: SkillSubscription[];
}> {
  const subscriptions = readSubscriptions();
  const marketSkills: MarketSkillItem[] = [];

  // 1. 同步并解析各订阅源
  for (const sub of subscriptions) {
    try {
      if (sub.type === "git") {
        const items = await syncGitSubscription(sub);
        marketSkills.push(...items);
      } else if (sub.type === "manifest") {
        const items = await syncManifestSubscription(sub);
        marketSkills.push(...items);
      }
      sub.lastSyncedAt = Date.now();
      sub.error = undefined;
    } catch (err) {
      sub.error = err instanceof Error ? err.message : String(err);
    }
  }
  writeSubscriptions(subscriptions);

  // 2. 加载本地与环境自带的已装 Skills，合并补充
  try {
    const localRes = await loadSkillsWithInstallInfo(cwd);
    const localSkills = localRes.skills || [];

    for (const ls of localSkills) {
      const existing = marketSkills.find(
        (m) =>
          m.name === ls.name ||
          (m.localPath &&
            ls.filePath &&
            path.basename(path.dirname(m.localPath)) === path.basename(path.dirname(ls.filePath))),
      );
      if (existing) {
        existing.installed = true;
        existing.enabled = !ls.disableModelInvocation;
        existing.localPath = ls.filePath;
      } else {
        const isBusiness = ls.filePath?.includes("business") || ls.filePath?.includes("litta");
        marketSkills.push({
          id: `local-${ls.name}`,
          name: ls.name,
          description: ls.description || "",
          category: isBusiness ? "business" : "public",
          sourceLabel: ls.sourceInfo?.source === "user" ? "本地自定义" : "内置技能",
          subscriptionId: "local",
          subscriptionUrl: "local",
          sourceType: ls.sourceInfo?.source === "user" ? "local" : "builtin",
          installed: true,
          enabled: !ls.disableModelInvocation,
          localPath: ls.filePath,
        });
      }
    }
  } catch (err) {
    console.error("[getMarketSkills] failed to load local skills:", err);
  }

  const filteredSkills = categoryFilter && categoryFilter !== "all"
    ? marketSkills.filter((s) => s.category === categoryFilter)
    : marketSkills;

  return { skills: filteredSkills, subscriptions };
}

/**
 * 切换技能开关：开启 (启用/安装) 或 关闭 (休眠)
 */
export async function toggleSkillState(params: {
  skillId: string;
  enabled: boolean;
  cwd: string;
}): Promise<{ success: boolean; error?: string }> {
  const { skillId, enabled, cwd } = params;
  const { skills } = await getMarketSkills(cwd, "all");
  const target = skills.find((s) => s.id === skillId);

  if (!target) {
    return { success: false, error: "未找到目标技能" };
  }

  const userSkillsDir = getUserSkillsDir();
  const folderName = target.localPath
    ? path.basename(path.dirname(target.localPath))
    : target.id.replace(/^sub-[^-]+-/, "");
  const destDir = path.join(userSkillsDir, folderName);
  const destSkillFile = path.join(destDir, "SKILL.md");

  try {
    if (enabled) {
      // 开启：如果本地未安装，先安装/复制
      if (!fs.existsSync(destSkillFile)) {
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        if (target.localPath && fs.existsSync(target.localPath)) {
          // 从 Git 缓存目录拷贝整个 skill 文件夹
          const srcDir = path.dirname(target.localPath);
          fs.cpSync(srcDir, destDir, { recursive: true });
        } else if (target.rawContent) {
          fs.writeFileSync(destSkillFile, target.rawContent, "utf8");
        } else {
          // 创建基础 SKILL.md
          const content = `---
name: ${target.name}
description: ${target.description}
category: ${target.category}
---

# ${target.name}

${target.description}
`;
          fs.writeFileSync(destSkillFile, content, "utf8");
        }
      }

      // 确保 disable-model-invocation 为 false (移除标记)
      if (fs.existsSync(destSkillFile)) {
        const raw = fs.readFileSync(destSkillFile, "utf8");
        const updated = setDisableModelInvocation(raw, false);
        fs.writeFileSync(destSkillFile, updated, "utf8");
      }
    } else {
      // 关闭：置为 disable-model-invocation: true
      if (fs.existsSync(destSkillFile)) {
        const raw = fs.readFileSync(destSkillFile, "utf8");
        const updated = setDisableModelInvocation(raw, true);
        fs.writeFileSync(destSkillFile, updated, "utf8");
      } else if (target.localPath && fs.existsSync(target.localPath)) {
        const raw = fs.readFileSync(target.localPath, "utf8");
        const updated = setDisableModelInvocation(raw, true);
        fs.writeFileSync(target.localPath, updated, "utf8");
      }
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
