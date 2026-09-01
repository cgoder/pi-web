// PowerI Packages 官方目录与搜索服务 (直连 https://pi.dev/packages 真实多页数据)

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

// 缓存每页数据，提高交互流畅度
const pageCache: Record<string, { items: MarketPackageItem[]; total: number; time: number }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟缓存

/**
 * 官方 Top 20 离线精选基准包（用于断网或极端超时兜底）
 */
export const SNAPSHOT_OFFICIAL_PACKAGES: MarketPackageItem[] = [
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
];

/**
 * 查找指定包的详细说明与元数据（供已安装包丰富详情）
 */
export function findPackageMetadata(sourceOrName: string): Partial<MarketPackageItem> | undefined {
  const clean = sourceOrName.toLowerCase().replace(/^npm:/, "").replace(/^git:/, "").trim();
  const direct = SNAPSHOT_OFFICIAL_PACKAGES.find((p) => p.name.toLowerCase() === clean);
  if (direct) return direct;
  for (const entry of Object.values(pageCache)) {
    const found = entry.items.find((p) => p.name.toLowerCase() === clean);
    if (found) return found;
  }
  return undefined;
}

/**
 * 解析 pi.dev 官方 HTML 页面中的 packages 及总数
 */
export function parsePiDevPackagesHtmlWithTotal(html: string): { items: MarketPackageItem[]; total: number } {
  const items: MarketPackageItem[] = [];

  // 解析总数 (例如: <span class="packages-count">1-50 / 5387</span>)
  let total = 0;
  const countMatch = html.match(/class="packages-count"[^>]*>[\s\S]*?\/\s*([\d,]+)/i);
  if (countMatch) {
    total = parseInt(countMatch[1].replace(/,/g, ""), 10) || 0;
  }

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

  if (total === 0) {
    total = items.length;
  }

  return { items, total };
}

/**
 * 实时从 pi.dev 官方翻页抓取真实数据
 */
export async function fetchFromPiDevPaged(params: {
  query?: string;
  category?: string;
  page?: number;
}): Promise<{ items: MarketPackageItem[]; total: number }> {
  const q = (params.query || "").trim();
  const cat = params.category || "all";
  const page = Math.max(1, params.page || 1);

  const cacheKey = `${cat}:${page}:${q}`;
  const cached = pageCache[cacheKey];
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return { items: cached.items, total: cached.total };
  }

  try {
    const searchParams = new URLSearchParams();
    if (q) searchParams.set("name", q);
    if (cat !== "all") searchParams.set("type", cat);
    if (page > 1) searchParams.set("page", String(page));
    searchParams.set("sort", "downloads");

    const url = `https://pi.dev/packages?${searchParams.toString()}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PowerI-Desktop/0.2.0; +https://github.com/cgoder/pi-web)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const html = await res.text();
      const { items, total } = parsePiDevPackagesHtmlWithTotal(html);
      if (items.length > 0) {
        pageCache[cacheKey] = { items, total, time: Date.now() };
        return { items, total };
      }
    }
  } catch {
    // ignore
  }

  return { items: [], total: 0 };
}

/**
 * 统一搜索与分页获取 packages 目录（真实分页追加，绝不在未加载完时虚报已全部加载）
 */
export async function searchPiPackages(params: {
  query?: string;
  category?: string;
  page?: number;
}): Promise<PackageQueryResult> {
  const q = (params.query || "").trim();
  const cat = params.category || "all";
  const page = Math.max(1, params.page || 1);

  // 1. 尝试从 pi.dev 官方接口拉取当前页
  const { items: remoteItems, total: remoteTotal } = await fetchFromPiDevPaged({
    query: q,
    category: cat,
    page,
  });

  if (remoteItems.length > 0) {
    // 判断是否还有下一页
    const hasMore = page * 50 < remoteTotal;
    return {
      packages: remoteItems,
      total: remoteTotal,
      hasMore,
      page,
    };
  }

  // 2. 离线/异常降级兜底：在 SNAPSHOT_OFFICIAL_PACKAGES 中筛选
  const fallback = SNAPSHOT_OFFICIAL_PACKAGES.filter((p) => {
    const matchCat = cat === "all" || p.category === cat;
    const matchQuery =
      !q ||
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.description.toLowerCase().includes(q.toLowerCase()) ||
      p.author.toLowerCase().includes(q.toLowerCase());
    return matchCat && matchQuery;
  });

  return {
    packages: fallback,
    total: fallback.length,
    hasMore: false,
    page: 1,
  };
}
