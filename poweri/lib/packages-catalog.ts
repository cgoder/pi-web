// PowerI Packages 官方目录与搜索服务 (支持全类别稳定输出、滚动分页加载与确定性缓存)

export interface MarketPackageItem {
  name: string;
  version: string;
  category: "extension" | "skill" | "prompt" | "theme" | "package";
  description: string;
  author: string;
  downloads?: string;
  updated?: string;
  npmUrl?: string;
  repoUrl?: string;
  webUrl: string; // 直达 pi.dev/packages/<name> 的官方页面链接
  installCommand: string;
}

export interface PackageQueryResult {
  packages: MarketPackageItem[];
  total: number;
  hasMore: boolean;
  page: number;
}

/**
 * 将任意包名规整为在 pi.dev 上展示的标准 Web URL
 */
export function getPiDevWebUrl(sourceOrName: string): string {
  const clean = sourceOrName
    .replace(/^\$?pi\s+install\s+/, "")
    .replace(/^npm:/, "")
    .replace(/^git:/, "")
    .trim();
  return `https://pi.dev/packages/${clean}`;
}

// 内存稳定全量缓存 (按类别分别缓存)
const cachedPackagesByCategory: Record<string, MarketPackageItem[]> = {};
const lastFetchedTimeByCategory: Record<string, number> = {};
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 分钟稳定缓存

/**
 * 官方全类别精选基准包（覆盖 Extension, Skill, Prompt, Theme, Package 所有类别，确保任何分类下秒级稳定呈现）
 */
export const SNAPSHOT_OFFICIAL_PACKAGES: MarketPackageItem[] = [
  // ── Extensions ─────────────────────────────────────────────────────────────
  {
    name: "pi-mcp-adapter",
    version: "2.31.0",
    category: "extension",
    description: "MCP (Model Context Protocol) adapter extension for Pi coding agent. Connect standard MCP servers directly to your harness.",
    author: "nicopreme",
    downloads: "761.4K/mo",
    updated: "3d ago",
    npmUrl: "https://www.npmjs.com/package/pi-mcp-adapter",
    repoUrl: "https://github.com/nicobailon/pi-mcp-adapter",
    webUrl: "https://pi.dev/packages/pi-mcp-adapter",
    installCommand: "npm:pi-mcp-adapter",
  },
  {
    name: "pi-web-access",
    version: "0.27.0",
    category: "extension",
    description: "Web search, URL fetching, GitHub repo cloning, PDF extraction, YouTube transcript analysis for Pi.",
    author: "nicopreme",
    downloads: "401.1K/mo",
    updated: "3d ago",
    npmUrl: "https://www.npmjs.com/package/pi-web-access",
    repoUrl: "https://github.com/nicobailon/pi-web-access",
    webUrl: "https://pi.dev/packages/pi-web-access",
    installCommand: "npm:pi-web-access",
  },
  {
    name: "@juicesharp/rpiv-ask-user-question",
    version: "2.8.0",
    category: "extension",
    description: "A structured questionnaire the model can put to you when it would otherwise guess, with typed options instead of free-form replies.",
    author: "juicesharp",
    downloads: "117.3K/mo",
    updated: "2d ago",
    npmUrl: "https://www.npmjs.com/package/@juicesharp/rpiv-ask-user-question",
    repoUrl: "https://github.com/juicesharp/rpiv-mono",
    webUrl: "https://pi.dev/packages/@juicesharp/rpiv-ask-user-question",
    installCommand: "npm:@juicesharp/rpiv-ask-user-question",
  },
  {
    name: "pi-background-tasks",
    version: "2.4.2",
    category: "extension",
    description: "Pi extension for durable background shell tasks, read-only delegated agents, and fixed-purpose Fusion workflows.",
    author: "ismailsaleekh",
    downloads: "107.1K/mo",
    updated: "18d ago",
    npmUrl: "https://www.npmjs.com/package/pi-background-tasks",
    repoUrl: "https://github.com/ismailsaleekh/pi-background-tasks",
    webUrl: "https://pi.dev/packages/pi-background-tasks",
    installCommand: "npm:pi-background-tasks",
  },
  {
    name: "@juicesharp/rpiv-todo",
    version: "2.8.0",
    category: "extension",
    description: "A todo list for the model, rendered as a live overlay that survives /reload and conversation compaction.",
    author: "juicesharp",
    downloads: "98.9K/mo",
    updated: "2d ago",
    npmUrl: "https://www.npmjs.com/package/@juicesharp/rpiv-todo",
    repoUrl: "https://github.com/juicesharp/rpiv-mono",
    webUrl: "https://pi.dev/packages/@juicesharp/rpiv-todo",
    installCommand: "npm:@juicesharp/rpiv-todo",
  },
  {
    name: "pi-lens",
    version: "4.1.3",
    category: "extension",
    description: "Real-time code feedback for pi — LSP, linters, formatters, type-checking, structural analysis.",
    author: "apmantza",
    downloads: "60.1K/mo",
    updated: "3d ago",
    npmUrl: "https://www.npmjs.com/package/pi-lens",
    repoUrl: "https://github.com/apmantza/pi-lens",
    webUrl: "https://pi.dev/packages/pi-lens",
    installCommand: "npm:pi-lens",
  },
  {
    name: "@narumitw/pi-goal",
    version: "0.54.4",
    category: "extension",
    description: "Pi extension for autonomous single-objective /goal completion.",
    author: "narumitw",
    downloads: "49.9K/mo",
    updated: "1d ago",
    npmUrl: "https://www.npmjs.com/package/@narumitw/pi-goal",
    repoUrl: "https://github.com/narumiruna/pi-extensions",
    webUrl: "https://pi.dev/packages/@narumitw/pi-goal",
    installCommand: "npm:@narumitw/pi-goal",
  },
  {
    name: "@ff-labs/pi-fff",
    version: "0.10.6",
    category: "extension",
    description: "FFF-powered fuzzy file and lightning-fast content search tools for coding agents.",
    author: "dmtr.kovalenko",
    downloads: "34.9K/mo",
    updated: "2d ago",
    npmUrl: "https://www.npmjs.com/package/@ff-labs/pi-fff",
    repoUrl: "https://github.com/dmtrKovalenko/fff",
    webUrl: "https://pi.dev/packages/@ff-labs/pi-fff",
    installCommand: "npm:@ff-labs/pi-fff",
  },
  {
    name: "pi-powerline-footer",
    version: "0.16.0",
    category: "extension",
    description: "Powerline-style status bar extension for pi coding agent.",
    author: "nicopreme",
    downloads: "29.7K/mo",
    updated: "6d ago",
    npmUrl: "https://www.npmjs.com/package/pi-powerline-footer",
    repoUrl: "https://github.com/nicobailon/pi-powerline-footer",
    webUrl: "https://pi.dev/packages/pi-powerline-footer",
    installCommand: "npm:pi-powerline-footer",
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    name: "@dietrichgebert/ponytail",
    version: "4.9.0",
    category: "skill",
    description: "Lazy senior dev mode for AI agents. The best code is the code you never wrote.",
    author: "dietrichgebert",
    downloads: "49.5K/mo",
    updated: "24d ago",
    npmUrl: "https://www.npmjs.com/package/@dietrichgebert/ponytail",
    repoUrl: "https://github.com/DietrichGebert/ponytail",
    webUrl: "https://pi.dev/packages/@dietrichgebert/ponytail",
    installCommand: "npm:@dietrichgebert/ponytail",
  },
  {
    name: "bigpowers",
    version: "2.87.8",
    category: "skill",
    description: "73 agent skills synthesizing 17 years of software engineering discipline into a prescriptive methodology.",
    author: "danielvm",
    downloads: "34.9K/mo",
    updated: "4h ago",
    npmUrl: "https://www.npmjs.com/package/bigpowers",
    webUrl: "https://pi.dev/packages/bigpowers",
    installCommand: "npm:bigpowers",
  },
  {
    name: "@reddb-io/red-skills-dev",
    version: "4.4.1",
    category: "skill",
    description: "reddb.io engineering skills for coding agents (autonomous /afk loop, /go dispatch, triage, tdd, diagnose).",
    author: "fforattini",
    downloads: "26K/mo",
    updated: "6d ago",
    npmUrl: "https://www.npmjs.com/package/@reddb-io/red-skills-dev",
    repoUrl: "https://github.com/reddb-io/red-skills",
    webUrl: "https://pi.dev/packages/@reddb-io/red-skills-dev",
    installCommand: "npm:@reddb-io/red-skills-dev",
  },
  {
    name: "@reddb-io/red-skills-memory",
    version: "4.4.1",
    category: "skill",
    description: "Governed operational memory for coding agents on top of dev: markdown notes, RedDB graph memory, zero-token recall.",
    author: "fforattini",
    downloads: "25.6K/mo",
    updated: "6d ago",
    npmUrl: "https://www.npmjs.com/package/@reddb-io/red-skills-memory",
    repoUrl: "https://github.com/reddb-io/red-skills",
    webUrl: "https://pi.dev/packages/@reddb-io/red-skills-memory",
    installCommand: "npm:@reddb-io/red-skills-memory",
  },
  {
    name: "@reddb-io/red-skills-brain",
    version: "4.4.1",
    category: "skill",
    description: "Project-local RedDB knowledge repository for freeform captures and graph connections.",
    author: "fforattini",
    downloads: "25K/mo",
    updated: "6d ago",
    npmUrl: "https://www.npmjs.com/package/@reddb-io/red-skills-brain",
    webUrl: "https://pi.dev/packages/@reddb-io/red-skills-brain",
    installCommand: "npm:@reddb-io/red-skills-brain",
  },

  // ── Prompts ───────────────────────────────────────────────────────────────
  {
    name: "pi-prompt-template-model",
    version: "0.12.2",
    category: "prompt",
    description: "Prompt template and system prompt model selector extension for pi coding agent.",
    author: "nicopreme",
    downloads: "21.3K/mo",
    updated: "4d ago",
    npmUrl: "https://www.npmjs.com/package/pi-prompt-template-model",
    repoUrl: "https://github.com/nicobailon/pi-prompt-template-model",
    webUrl: "https://pi.dev/packages/pi-prompt-template-model",
    installCommand: "npm:pi-prompt-template-model",
  },
  {
    name: "pi-prompts-developer-pack",
    version: "1.4.0",
    category: "prompt",
    description: "Curated prompt templates for refactoring, clean architecture, TDD, and security audits.",
    author: "pi-community",
    downloads: "18.5K/mo",
    updated: "1w ago",
    npmUrl: "https://www.npmjs.com/package/pi-prompts-developer-pack",
    webUrl: "https://pi.dev/packages/pi-prompts-developer-pack",
    installCommand: "npm:pi-prompts-developer-pack",
  },
  {
    name: "@juicesharp/rpiv-code-review-prompts",
    version: "2.1.0",
    category: "prompt",
    description: "Structured code review and architecture analysis prompt templates for collaborative turns.",
    author: "juicesharp",
    downloads: "16.2K/mo",
    updated: "2w ago",
    npmUrl: "https://www.npmjs.com/package/@juicesharp/rpiv-code-review-prompts",
    webUrl: "https://pi.dev/packages/@juicesharp/rpiv-code-review-prompts",
    installCommand: "npm:@juicesharp/rpiv-code-review-prompts",
  },

  // ── Themes ────────────────────────────────────────────────────────────────
  {
    name: "catppuccin-pi-theme",
    version: "1.2.0",
    category: "theme",
    description: "Soothing pastel theme for Pi coding agent — Mocha, Macchiato, Frappé, and Latte variants.",
    author: "catppuccin",
    downloads: "24.1K/mo",
    updated: "1w ago",
    npmUrl: "https://www.npmjs.com/package/catppuccin-pi-theme",
    webUrl: "https://pi.dev/packages/catppuccin-pi-theme",
    installCommand: "npm:catppuccin-pi-theme",
  },
  {
    name: "tokyo-night-pi",
    version: "1.0.5",
    category: "theme",
    description: "A clean Dark Visual Studio Code & terminal theme celebrating the lights of Downtown Tokyo.",
    author: "folke",
    downloads: "19.8K/mo",
    updated: "2w ago",
    npmUrl: "https://www.npmjs.com/package/tokyo-night-pi",
    webUrl: "https://pi.dev/packages/tokyo-night-pi",
    installCommand: "npm:tokyo-night-pi",
  },
  {
    name: "nord-pi-theme",
    version: "1.1.2",
    category: "theme",
    description: "An arctic, north-bluish clean color palette theme for Pi agent interfaces.",
    author: "arcticicestudio",
    downloads: "15.4K/mo",
    updated: "3w ago",
    npmUrl: "https://www.npmjs.com/package/nord-pi-theme",
    webUrl: "https://pi.dev/packages/nord-pi-theme",
    installCommand: "npm:nord-pi-theme",
  },

  // ── Packages (Bundles) ────────────────────────────────────────────────────
  {
    name: "pi-subagents",
    version: "0.62.0",
    category: "package",
    description: "Pi extension for single-agent delegation and scripted multi-agent workflows.",
    author: "nicopreme",
    downloads: "362.5K/mo",
    updated: "13h ago",
    npmUrl: "https://www.npmjs.com/package/pi-subagents",
    repoUrl: "https://github.com/nicobailon/pi-subagents",
    webUrl: "https://pi.dev/packages/pi-subagents",
    installCommand: "npm:pi-subagents",
  },
  {
    name: "@companion-ai/feynman",
    version: "0.3.47",
    category: "package",
    description: "Research-first CLI agent built on Pi and alphaXiv for academic paper deep dives.",
    author: "advaitpaliwal",
    downloads: "296.7K/mo",
    updated: "5d ago",
    npmUrl: "https://www.npmjs.com/package/@companion-ai/feynman",
    repoUrl: "https://github.com/companion-inc/feynman",
    webUrl: "https://pi.dev/packages/@companion-ai/feynman",
    installCommand: "npm:@companion-ai/feynman",
  },
  {
    name: "context-mode",
    version: "1.0.169",
    category: "package",
    description: "MCP plugin that saves 98% of your context window. Sandboxed code execution, FTS5 knowledge base, and intent-driven search.",
    author: "mksglu",
    downloads: "78.5K/mo",
    updated: "2mo ago",
    npmUrl: "https://www.npmjs.com/package/context-mode",
    repoUrl: "https://github.com/mksglu/context-mode",
    webUrl: "https://pi.dev/packages/context-mode",
    installCommand: "npm:context-mode",
  },
  {
    name: "@plannotator/pi-extension",
    version: "0.27.10",
    category: "package",
    description: "Plannotator Pi extension - interactive plan review with annotations, annotate agent messages, and review code/PRs.",
    author: "backnotprop",
    downloads: "52.7K/mo",
    updated: "9h ago",
    npmUrl: "https://www.npmjs.com/package/@plannotator/pi-extension",
    repoUrl: "https://github.com/backnotprop/plannotator",
    webUrl: "https://pi.dev/packages/@plannotator/pi-extension",
    installCommand: "npm:@plannotator/pi-extension",
  },
  {
    name: "confluence-cli",
    version: "2.22.0",
    category: "package",
    description: "A command-line interface for Atlassian Confluence with page creation and editing capabilities.",
    author: "pchuri",
    downloads: "32.1K/mo",
    updated: "3d ago",
    npmUrl: "https://www.npmjs.com/package/confluence-cli",
    repoUrl: "https://github.com/pchuri/confluence-cli",
    webUrl: "https://pi.dev/packages/confluence-cli",
    installCommand: "npm:confluence-cli",
  },
  {
    name: "pi-intercom",
    version: "0.12.1",
    category: "package",
    description: "Multi-agent communication and workspace broadcast extension for pi.",
    author: "nicopreme",
    downloads: "28.8K/mo",
    updated: "3d ago",
    npmUrl: "https://www.npmjs.com/package/pi-intercom",
    webUrl: "https://pi.dev/packages/pi-intercom",
    installCommand: "npm:pi-intercom",
  },
];

/**
 * 解析 pi.dev 官方 HTML 页面中的 packages
 */
export function parsePiDevPackagesHtml(html: string): MarketPackageItem[] {
  const items: MarketPackageItem[] = [];
  const articleRegex = /<article([^>]*)>([\s\S]*?)<\/article>/gi;
  let match: RegExpExecArray | null;

  while ((match = articleRegex.exec(html)) !== null) {
    const attrs = match[1];
    const body = match[2];

    if (!attrs.includes('data-package-card="true"')) continue;

    const nameMatch = attrs.match(/data-package-name="([^"]+)"/) ||
      body.match(/<h3[^>]*class="packages-name"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    const name = nameMatch?.[1]?.trim();
    if (!name) continue;

    const typeMatch = attrs.match(/data-package-types="([^"]*)"/) ||
      body.match(/data-package-types="([^"]*)"/) ||
      body.match(/<span[^>]*class="[^"]*packages-badge"[^>]*>([^<]+)<\/span>/i);
    let category: MarketPackageItem["category"] = "package";
    const rawType = typeMatch?.[1]?.toLowerCase() || "";
    if (rawType.includes("extension")) category = "extension";
    else if (rawType.includes("skill")) category = "skill";
    else if (rawType.includes("prompt")) category = "prompt";
    else if (rawType.includes("theme")) category = "theme";

    const descMatch = body.match(/<p[^>]*class="packages-desc"[^>]*>([\s\S]*?)<\/p>/i);
    const description = descMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || "No description provided.";

    const metaMatch = body.match(/<div[^>]*class="packages-meta"[^>]*>([\s\S]*?)<\/div>/i);
    let author = "";
    let downloads = "";
    let updated = "";
    if (metaMatch) {
      const spans = [...metaMatch[1].matchAll(/<span[^>]*>([^<]+)<\/span>/gi)].map((m) => m[1].trim());
      author = spans[0] || "";
      downloads = spans[1] || "";
      updated = spans[2] || "";
    }

    const npmMatch = body.match(/href="(https:\/\/www\.npmjs\.com\/package\/[^"]+)"/i);
    const repoMatch = body.match(/href="(https:\/\/github\.com\/[^"]+)"/i);

    items.push({
      name,
      version: "latest",
      category,
      description,
      author,
      downloads,
      updated,
      npmUrl: npmMatch?.[1] || `https://www.npmjs.com/package/${name}`,
      repoUrl: repoMatch?.[1],
      webUrl: `https://pi.dev/packages/${name}`,
      installCommand: `npm:${name}`,
    });
  }

  return items;
}

/**
 * 实时从 pi.dev 抓取指定分类
 */
export async function fetchFromPiDev(query = "", category = "all"): Promise<MarketPackageItem[]> {
  try {
    const params = new URLSearchParams();
    if (query.trim()) params.set("name", query.trim());
    if (category !== "all") params.set("type", category);
    params.set("sort", "downloads");

    const url = `https://pi.dev/packages?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PowerI-Desktop/0.2.0; +https://github.com/cgoder/pi-web)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const html = await res.text();
      const items = parsePiDevPackagesHtml(html);
      if (items.length > 0) {
        if (!query) {
          cachedPackagesByCategory[category] = items;
          lastFetchedTimeByCategory[category] = Date.now();
        }
        return category === "all" ? items : items.filter((item) => item.category === category);
      }
    }
  } catch {
    // ignore
  }

  return [];
}

/**
 * 查找指定包的详细说明与元数据（供已安装包丰富详情）
 */
export function findPackageMetadata(sourceOrName: string): Partial<MarketPackageItem> | undefined {
  const clean = sourceOrName.toLowerCase().replace(/^npm:/, "").replace(/^git:/, "").trim();
  const direct = SNAPSHOT_OFFICIAL_PACKAGES.find((p) => p.name.toLowerCase() === clean);
  if (direct) return direct;
  for (const list of Object.values(cachedPackagesByCategory)) {
    const found = list.find((p) => p.name.toLowerCase() === clean);
    if (found) return found;
  }
  return undefined;
}

/**
 * 统一搜索与分页获取 packages 目录（支持所有分类稳定输出与 Load More）
 */
export async function searchPiPackages(params: {
  query?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}): Promise<PackageQueryResult> {
  const q = (params.query || "").trim().toLowerCase();
  const cat = params.category || "all";
  const page = Math.max(1, params.page || 1);
  const pageSize = params.pageSize || 30;

  // 1. 获取当前分类的基准全量候选集
  const categorySnapshot = SNAPSHOT_OFFICIAL_PACKAGES.filter((p) => cat === "all" || p.category === cat);
  const cachedList = cachedPackagesByCategory[cat] || [];

  // 合并去重基准
  const combinedMap = new Map<string, MarketPackageItem>();
  for (const item of categorySnapshot) combinedMap.set(item.name, item);
  for (const item of cachedList) combinedMap.set(item.name, item);

  let candidateList = Array.from(combinedMap.values());

  // 2. 如果带有搜索词，在候选集中进行全文匹配
  if (q) {
    candidateList = candidateList.filter((p) => {
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q)
      );
    });

    // 若本地结果偏少，尝试远端实时补齐
    if (candidateList.length < 10) {
      const remote = await fetchFromPiDev(q, cat);
      if (remote.length > 0) {
        for (const item of remote) {
          if (!combinedMap.has(item.name)) {
            combinedMap.set(item.name, item);
            candidateList.push(item);
          }
        }
      }
    }
  } else {
    // 若无搜索词且缓存过期，异步触发一次远端刷新
    const lastTime = lastFetchedTimeByCategory[cat] || 0;
    if (Date.now() - lastTime > CACHE_TTL_MS) {
      void fetchFromPiDev("", cat);
    }
  }

  // 3. 确定性分页截取
  const total = candidateList.length;
  const start = (page - 1) * pageSize;
  const end = page * pageSize;
  const pagedItems = candidateList.slice(0, end); // 累积分页，支持滚动列表追加
  const hasMore = end < total;

  return {
    packages: pagedItems,
    total,
    hasMore,
    page,
  };
}
