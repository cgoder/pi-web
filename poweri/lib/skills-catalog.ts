// PowerI Skills 市场目录 — 实时请求 skills.sh 官方 API
// 无任何硬编码技能数据；所有结果来自网络请求，失败时返回空列表并抛出错误供调用方处理。

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

// skills.sh 要求 query 至少 2 字符；用于"浏览所有"的兜底关键词列表
// （API 不支持空查询，用高频短词覆盖热门技能）
const BROWSE_QUERIES = ["code", "test", "git", "doc", "ai", "debug", "re"];

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
    description: "",          // skills.sh search API 不返回描述，detail 页才有
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
async function fetchSkillsShSearch(query: string, limit = 30): Promise<SkillsShResult[]> {
  const url = `${SKILLS_SH_API}?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "PowerI/0.2.0" },
    signal: AbortSignal.timeout(8000),
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
  _localSkills: MarketSkillItem[],   // 保持函数签名兼容，本函数不使用本地快照
  query = "",
  categoryFilter: SkillCategory | "all" = "all",
): Promise<MarketSkillItem[]> {
  const q = query.trim();

  let rawResults: SkillsShResult[];

  if (q.length >= 2) {
    // 有查询词：直接搜索
    rawResults = await fetchSkillsShSearch(q, 50);
  } else {
    // 浏览模式：并发请求多个短词，合并去重
    const results = await Promise.allSettled(
      BROWSE_QUERIES.map((kw) => fetchSkillsShSearch(kw, 20)),
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

  let items = rawResults.map(toMarketSkillItem);

  // skills.sh 目前不区分 business/public，所有结果均为 public
  // 如果 categoryFilter 为 business，返回空（business 技能来自私有订阅源）
  if (categoryFilter === "business") {
    items = [];
  }

  return items;
}
