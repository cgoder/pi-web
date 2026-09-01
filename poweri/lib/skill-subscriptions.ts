import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { setDisableModelInvocation } from "@/lib/skill-frontmatter";
import { parseFrontmatter } from "@/lib/frontmatter";
import { loadSkillsWithInstallInfo } from "@/lib/skills-service";

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
  sourceType: "git" | "manifest" | "builtin" | "local" | "skills.sh";
  installed: boolean;
  enabled: boolean;
  localPath?: string;
  rawContent?: string;
  installs?: string;
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

export const DEFAULT_SUBSCRIPTIONS: SkillSubscription[] = [
  {
    id: "sub-litta-business",
    url: "https://gitlab.litta.cn/litta/litta-skills.git",
    name: "LITTA 团队源",
    category: "business",
    type: "git",
    addedAt: 1700000000000,
    isDefault: true,
  },
  {
    id: "sub-skills-sh",
    url: "https://github.com/vercel-labs/skills.git",
    name: "skills.sh 官方源",
    category: "public",
    type: "git",
    addedAt: 1700000000000,
    isDefault: true,
  },
  {
    id: "sub-pi-public-skills",
    url: "https://github.com/earendil-works/pi-skills.git",
    name: "Pi 精选源",
    category: "public",
    type: "git",
    addedAt: 1700000000000,
    isDefault: true,
  },
];

/**
 * skills.sh 与社区高频精选技能快照（供 Discover 市场快速检索与首屏渲染）
 */
export const SKILLS_SH_POPULAR_SKILLS: MarketSkillItem[] = [
  {
    id: "skills-sh-git-commit-helper",
    name: "git-commit-helper",
    description: "Generates clean, conventional git commit messages based on diffs and project commit history.",
    author: "vercel-labs",
    tags: ["git", "workflow", "productivity"],
    version: "1.2.0",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "142K",
  },
  {
    id: "skills-sh-browser-tools",
    name: "browser-tools",
    description: "Automate browser interactions, DOM inspection, screenshot capture, and visual testing.",
    author: "steven-gonsalvez",
    tags: ["browser", "testing", "crawler"],
    version: "2.1.0",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "98K",
  },
  {
    id: "skills-sh-tdd-workflow",
    name: "tdd",
    description: "Test-Driven Development harness. Write failing test first, make it pass, then refactor.",
    author: "mattpocock",
    tags: ["test", "tdd", "quality"],
    version: "1.0.4",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "84K",
  },
  {
    id: "skills-sh-code-review",
    name: "code-review",
    description: "Two-axis code review (Standards + Spec) running parallel sub-agents to critique diffs.",
    author: "mattpocock",
    tags: ["review", "audit", "standards"],
    version: "1.3.1",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "79K",
  },
  {
    id: "skills-sh-domain-modeling",
    name: "domain-modeling",
    description: "Domain-Driven Design (DDD) modeling skill to structure state machines, schemas, and bounded contexts.",
    author: "advaitpaliwal",
    tags: ["architecture", "domain", "schema"],
    version: "1.1.0",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "65K",
  },
  {
    id: "skills-sh-writing-for-agents",
    name: "writing-for-agents",
    description: "Draft clean, structured documentation and guidelines optimized for AI coding agents to read.",
    author: "nicopreme",
    tags: ["docs", "prompt", "guidelines"],
    version: "1.0.2",
    category: "public",
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: "https://skills.sh",
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: "51K",
  },
  {
    id: "skills-sh-lark-cli",
    name: "lark-cli",
    description: "Feishu / Lark workspace integration. Send robot cards, query spreadsheets, and automate alerts.",
    author: "litta-team",
    tags: ["feishu", "lark", "im"],
    version: "1.5.0",
    category: "business",
    sourceLabel: "LITTA 团队源",
    subscriptionId: "sub-litta-business",
    subscriptionUrl: "https://gitlab.litta.cn/litta/litta-skills.git",
    sourceType: "git",
    installed: false,
    enabled: false,
    installs: "32K",
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
    return Array.isArray(data) ? data : DEFAULT_SUBSCRIPTIONS;
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

export function generateSubscriptionId(url?: string): string {
  if (url) {
    const clean = url.replace(/[^a-zA-Z0-9]/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
    if (clean) return `sub-${clean}-${Date.now().toString(36)}`;
  }
  return `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function detectSubscriptionType(url: string): "git" | "manifest" | "url" {
  const trimmed = url.trim();
  if (trimmed.endsWith(".json")) return "manifest";
  if (trimmed.endsWith(".git") || trimmed.includes("github.com") || trimmed.includes("gitlab")) return "git";
  return "url";
}

export function addSubscription(sub: Omit<SkillSubscription, "id" | "addedAt">): SkillSubscription {
  const subs = readSubscriptions();
  const id = generateSubscriptionId();
  const newSub: SkillSubscription = {
    ...sub,
    id,
    addedAt: Date.now(),
  };
  subs.push(newSub);
  writeSubscriptions(subs);
  return newSub;
}

export function updateSubscription(id: string, updates: Partial<SkillSubscription>): SkillSubscription | null {
  const subs = readSubscriptions();
  const index = subs.findIndex((s) => s.id === id);
  if (index === -1) return null;
  subs[index] = { ...subs[index], ...updates };
  writeSubscriptions(subs);
  return subs[index];
}

export function removeSubscription(id: string): boolean {
  const subs = readSubscriptions();
  const next = subs.filter((s) => s.id !== id);
  if (next.length === subs.length) return false;
  writeSubscriptions(next);
  return true;
}

function parseSkillFile(filePath: string): {
  name: string;
  description: string;
  tags?: string[];
  disabled?: boolean;
} {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = parseFrontmatter(raw);
    const meta = (parsed.data || {}) as Record<string, any>;
    return {
      name: String(meta.name || ""),
      description: String(meta.description || ""),
      tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
      disabled: Boolean(meta["disable-model-invocation"]),
    };
  } catch {
    return { name: "", description: "", tags: [], disabled: false };
  }
}

function findSkillFilesRecursively(dir: string, depth = 0, maxDepth = 4): string[] {
  if (depth > maxDepth || !fs.existsSync(dir)) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const directSkill = path.join(full, "SKILL.md");
        if (fs.existsSync(directSkill)) {
          results.push(directSkill);
        } else {
          results.push(...findSkillFilesRecursively(full, depth + 1, maxDepth));
        }
      } else if (ent.isFile() && ent.name === "SKILL.md") {
        results.push(full);
      }
    }
  } catch {
    // ignore
  }
  return results;
}

async function syncGitSubscription(sub: SkillSubscription): Promise<MarketSkillItem[]> {
  const cacheBase = getSubscriptionsCacheDir();
  const repoDirName = sub.id;
  const targetDir = path.join(cacheBase, repoDirName);

  let authenticatedUrl = sub.url;
  if (sub.token && sub.url.startsWith("http")) {
    try {
      const u = new URL(sub.url);
      u.username = "oauth2";
      u.password = sub.token;
      authenticatedUrl = u.toString();
    } catch {
      // ignore
    }
  }

  if (fs.existsSync(targetDir) && fs.existsSync(path.join(targetDir, ".git"))) {
    try {
      await execFileAsync("git", ["fetch", "--depth=1", "origin"], {
        cwd: targetDir,
        timeout: 25000,
      });
      await execFileAsync("git", ["reset", "--hard", "origin/HEAD"], {
        cwd: targetDir,
        timeout: 10000,
      });
    } catch {
      try {
        await execFileAsync("git", ["pull", "--ff-only"], {
          cwd: targetDir,
          timeout: 25000,
        });
      } catch (err) {
        throw new Error(`Git update failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    try {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      await execFileAsync("git", ["clone", "--depth=1", authenticatedUrl, targetDir], {
        timeout: 45000,
      });
    } catch (err) {
      throw new Error(`Git clone failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const skillFiles = findSkillFilesRecursively(targetDir);
  const items: MarketSkillItem[] = [];
  const userSkillsDir = getUserSkillsDir();

  for (const skillFile of skillFiles) {
    const skillDir = path.dirname(skillFile);
    const skillFolderName = path.basename(skillDir);
    const { name, description, tags } = parseSkillFile(skillFile);

    const userSkillTarget = path.join(userSkillsDir, skillFolderName);
    const isInstalled = fs.existsSync(userSkillTarget);
    let isEnabled = true;
    if (isInstalled) {
      const localFile = path.join(userSkillTarget, "SKILL.md");
      if (fs.existsSync(localFile)) {
        const localMeta = parseSkillFile(localFile);
        isEnabled = !localMeta.disabled;
      }
    }

    const skillId = `${sub.id}-${skillFolderName}`;
    items.push({
      id: skillId,
      name: name || skillFolderName,
      description: description || (sub.category === "business" ? "来自团队业务订阅源的技能" : "来自公共精选源的技能"),
      tags,
      category: sub.category,
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
 * 获取所有市场技能与已安装技能列表
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

  // 2. 注入 skills.sh 精选社区技能快照
  for (const popular of SKILLS_SH_POPULAR_SKILLS) {
    if (!marketSkills.some((m) => m.name.toLowerCase() === popular.name.toLowerCase())) {
      marketSkills.push({ ...popular });
    }
  }

  // 3. 加载本地与环境自带的已装 Skills，合并与精准归类
  try {
    const localRes = await loadSkillsWithInstallInfo(cwd);
    const localSkills = localRes.skills || [];

    for (const ls of localSkills) {
      const existing = marketSkills.find(
        (m) =>
          m.name.toLowerCase() === ls.name.toLowerCase() ||
          (m.localPath &&
            ls.filePath &&
            path.basename(path.dirname(m.localPath)) === path.basename(path.dirname(ls.filePath))),
      );

      if (existing) {
        existing.installed = true;
        existing.enabled = !ls.disableModelInvocation;
        existing.localPath = ls.filePath;
      } else {
        // 没有匹配到任何订阅源的本地技能，严格归入 "local"
        const isBusiness = ls.filePath?.includes("business") || ls.filePath?.includes("litta");
        marketSkills.push({
          id: `local-${ls.name}`,
          name: ls.name,
          description: ls.description || "本地创建的 Agent 技能",
          category: isBusiness ? "business" : "public",
          sourceLabel: "Local",
          subscriptionId: "local",
          subscriptionUrl: "local",
          sourceType: "local",
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
    : target.id.replace(/^sub-[^-]+-/, "").replace(/^skills-sh-/, "");
  const destDir = path.join(userSkillsDir, folderName);
  const destSkillFile = path.join(destDir, "SKILL.md");

  try {
    if (enabled) {
      if (!fs.existsSync(destSkillFile)) {
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        if (target.localPath && fs.existsSync(target.localPath)) {
          const srcDir = path.dirname(target.localPath);
          fs.cpSync(srcDir, destDir, { recursive: true });
        } else if (target.rawContent) {
          fs.writeFileSync(destSkillFile, target.rawContent, "utf8");
        } else {
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

      if (fs.existsSync(destSkillFile)) {
        const raw = fs.readFileSync(destSkillFile, "utf8");
        const updated = setDisableModelInvocation(raw, false);
        fs.writeFileSync(destSkillFile, updated, "utf8");
      }
    } else {
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
