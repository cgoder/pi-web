// PowerI Skills 市场目录 — 实时请求 skills.sh 官方 API
// 无任何硬编码技能数据；所有结果来自网络请求，失败时返回空列表并抛出错误供调用方处理。

import { getAgentDir } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";
import type { MarketSkillItem, SkillCategory } from "./skill-subscriptions";

// ─── skills.sh API 响应类型 ──────────────────────────────────────────────────

interface SkillsShResult {
  id: string;        // e.g. "mattpocock/skills/tdd"
  skillId: string;   // e.g. "tdd"
  name: string;
  installs: number;
  source: string;    // e.g. "mattpocock/skills"
}

interface SkillsShSearchResponse {
  query: string;
  skills: SkillsShResult[];
  count: number;
  duration_ms: number;
}

// skills.sh 搜索 API base URL
const SKILLS_SH_API = "https://skills.sh/api/search";

/**
 * skills.sh 官方 API 限制 query 必须至少 2 个字符（否则返回 HTTP 400）。
 * 用于 Discover 市场在无搜索词（浏览模式）时并发查询的高频关键词集合，覆盖热门技能。
 */
export const SKILLS_SH_MIN_QUERY_LENGTH = 2;
export const BROWSE_DISCOVERY_KEYWORDS = ["code", "test", "git", "doc", "ai", "debug", "re"] as const;

// Discover 结果缓存：skills.sh 单请求波动 1~4s、浏览模式并发 7 请求可达 7s，
// 若每次打开面板都实时拉取会显著拖慢页面。两级缓存：
// 1) 内存 TTL（进程内反复打开秒回）；2) 磁盘持久化（重启应用后首次打开也命中，
//    放 ~/.pi/agent/poweri-discover-cache.json）。公共市场目录一天才变一次，30 分钟足够。
export const DISCOVER_TTL_MS = 30 * 60 * 1000;

const discoverCache = new Map<string, { items: MarketSkillItem[]; at: number }>();

function discoverCacheFilePath(): string {
  return path.join(getAgentDir(), "poweri-discover-cache.json");
}

/**
 * 从磁盘加载 discover 缓存：每次查询都读盘（文件小，~1ms），以磁盘为权威，
 * 避免跨进程/环境切换时内存状态失配。文件损坏或缺失视为无缓存，
 * 绝不让读盘失败影响查询。
 */
function loadDiskCache(): void {
  try {
    const file = discoverCacheFilePath();
    if (!fs.existsSync(file)) return;
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
      entries: Array<{ key: string; items: MarketSkillItem[]; at: number }>;
    };
    for (const e of data.entries ?? []) {
      discoverCache.set(e.key, { items: e.items, at: e.at });
    }
  } catch {
    // 损坏或版本不符：忽略，走网络拉取
  }
}

/** 将内存缓存回写磁盘（幂等，失败静默——缓存只是加速不是功能） */
function persistDiskCache(): void {
  try {
    const entries = [...discoverCache.entries()].map(([key, v]) => ({ key, items: v.items, at: v.at }));
    const file = discoverCacheFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 1, entries }));
  } catch {
    // 静默
  }
}

export function clearMarketSkillsCache(): void {
  discoverCache.clear();
  try {
    fs.rmSync(discoverCacheFilePath(), { force: true });
  } catch {
    // 静默
  }
}

/**
 * 统一技能模糊搜索与关键词匹配逻辑（支持 name, description, author, tags 多维匹配）
 */
export function matchesSkillQuery(
  skill: { name: string; description?: string; author?: string; tags?: string[]; sourceLabel?: string },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (skill.name.toLowerCase().includes(q)) return true;
  if (skill.description?.toLowerCase().includes(q)) return true;
  if (skill.author?.toLowerCase().includes(q)) return true;
  if (skill.sourceLabel?.toLowerCase().includes(q)) return true;
  if (skill.tags?.some((t) => t.toLowerCase().includes(q))) return true;
  return false;
}

/**
 * 将 skills.sh API 返回的条目规整为 MarketSkillItem
 */
function toMarketSkillItem(s: SkillsShResult): MarketSkillItem {
  // source 格式: "owner/repo" 或 "owner/repo/path"
  const parts = s.source.split("/");
  const author = parts[0] ?? "unknown";
  const repoUrl = `https://github.com/${parts[0]}/${parts[1] ?? ""}`;

  return {
    id: `skills-sh-${s.id.replace(/\//g, "-")}`,
    name: s.name,
    description: "",          // skills.sh search API 不返回描述，detail 弹窗直接查阅源码 SKILL.md
    author,
    tags: [],
    version: "",
    category: "public" as SkillCategory,
    sourceLabel: "skills.sh",
    subscriptionId: "sub-skills-sh",
    subscriptionUrl: repoUrl,
    sourceType: "skills.sh",
    installed: false,
    enabled: false,
    installs: formatInstalls(s.installs),
  };
}

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/**
 * 向 skills.sh API 发起单次搜索请求
 * @throws 网络错误或非 200 响应时抛出
 */
async function fetchSkillsShSearch(query: string, limit = 30, timeoutMs = 15000): Promise<SkillsShResult[]> {
  const url = `${SKILLS_SH_API}?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "PowerI/0.2.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`skills.sh API error ${res.status}: ${body}`);
  }
  const data = (await res.json()) as SkillsShSearchResponse;
  return data.skills ?? [];
}

/**
 * 实时搜索 skills.sh 市场技能
 *
 * - 有 query（≥2字符）：直接调用 API 搜索
 * - 无 query（浏览模式）：并发请求多个高频关键词，合并去重，按 installs 降序排列
 *
 * @throws 所有请求均失败时抛出，调用方应处理并向用户展示错误状态
 */
export async function queryMarketSkills(
  query = "",
  categoryFilter: SkillCategory | "all" = "all",
): Promise<MarketSkillItem[]> {
  const q = query.trim();
  const cacheKey = `${categoryFilter || "all"}|${q}`;
  // skills.sh 全部为 public，business 过滤恒为空且无需请求网络
  if (categoryFilter === "business") {
    return [];
  }
  loadDiskCache();
  const hit = discoverCache.get(cacheKey);
  if (hit && Date.now() - hit.at < DISCOVER_TTL_MS) {
    return hit.items;
  }

  let rawResults: SkillsShResult[];

  if (q.length >= SKILLS_SH_MIN_QUERY_LENGTH) {
    // 有查询词：直接搜索
    rawResults = await fetchSkillsShSearch(q, 50);
  } else {
    // 浏览模式：并发请求多个短词，合并去重；skills.sh 波动大，用更短的超时快速失败
    const results = await Promise.allSettled(
      BROWSE_DISCOVERY_KEYWORDS.map((kw) => fetchSkillsShSearch(kw, 20, 8000)),
    );

    const seen = new Set<string>();
    rawResults = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const item of r.value) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            rawResults.push(item);
          }
        }
      }
    }

    if (rawResults.length === 0) {
      throw new Error("无法连接 skills.sh，请检查网络连接后重试");
    }

    // 按安装量降序
    rawResults.sort((a, b) => b.installs - a.installs);
  }

  const items = rawResults.map(toMarketSkillItem);

  // TTL 内缓存本次结果（含空结果，网络恢复后最多延迟一个 TTL 生效）
  discoverCache.set(cacheKey, { items, at: Date.now() });
  persistDiskCache();
  return items;
}
