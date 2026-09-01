// PowerI Packages 官方目录与搜索服务 (支持多维排序、复合类别标签、真实分页追加与确定性缓存)

export interface MarketPackageItem {
  name: string;
  version: string;
  category: "extension" | "skill" | "prompt" | "theme" | "package";
  categories: ("extension" | "skill" | "prompt" | "theme" | "package")[];
  description: string;
  author: string;
  downloads?: string;
  downloadNum?: number;
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
  sortBy: "downloads" | "recent" | "name";
}

/**
 * 规范化包名/源字符串（用于精确比对，严格区分 scope，如 pi-subagents vs @tintinweb/pi-subagents）
 */
export function normalizePackageSource(source: string): string {
  let s = source.trim().toLowerCase();
  s = s.replace(/^\$?pi\s+install\s+/, "");
  s = s.replace(/^npm:/, "");
  s = s.replace(/^git:/, "");
  // 如果以 https:// 或 git@ 开头，去除协议前缀和末尾 .git
  s = s.replace(/^https?:\/\//, "").replace(/^git@/, "").replace(/\.git$/, "");
  // 去除版本锁定后缀（如 @1.2.3 或 @v1.0.0），注意不要破坏 scoped package 开头的 @scope
  if (s.includes("@")) {
    const atIndex = s.lastIndexOf("@");
    if (atIndex > 0) {
      s = s.slice(0, atIndex);
    }
  }
  return s.trim();
}

/**
 * 精准判定两个包源是否为同一个包
 */
export function isSamePackage(sourceA: string, sourceB: string): boolean {
  if (!sourceA || !sourceB) return false;
  return normalizePackageSource(sourceA) === normalizePackageSource(sourceB);
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
 * 官方 Top 20 精选基准包（离线与快速首屏）
 */
export const SNAPSHOT_OFFICIAL_PACKAGES: MarketPackageItem[] = [
  {
    name: "pi-mcp-adapter",
    version: "2.31.0",
    category: "extension",
    categories: ["extension"],
    description: "MCP (Model Context Protocol) adapter extension for Pi coding agent. Connect standard MCP servers directly to your harness.",
    author: "nicopreme",
    downloads: "761.4K/mo",
    downloadNum: 761400,
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
    categories: ["extension"],
    description: "Web search, URL fetching, GitHub repo cloning, PDF extraction, YouTube transcript analysis for Pi.",
    author: "nicopreme",
    downloads: "401.1K/mo",
    downloadNum: 401100,
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
    categories: ["extension", "skill"],
    description: "Pi extension for single-agent delegation and scripted multi-agent workflows.",
    author: "nicopreme",
    downloads: "362.5K/mo",
    downloadNum: 362500,
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
    categories: ["extension", "skill"],
    description: "Research-first CLI agent built on Pi and alphaXiv for academic paper deep dives.",
    author: "advaitpaliwal",
    downloads: "296.7K/mo",
    downloadNum: 296700,
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
    categories: ["extension"],
    description: "A structured questionnaire the model can put to you when it would otherwise guess, with typed options instead of free-form replies.",
    author: "juicesharp",
    downloads: "117.3K/mo",
    downloadNum: 117300,
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
    categories: ["extension"],
    description: "Pi extension for durable background shell tasks, read-only delegated agents, and fixed-purpose Fusion workflows.",
    author: "ismailsaleekh",
    downloads: "107.1K/mo",
    downloadNum: 107100,
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
    categories: ["extension"],
    description: "A todo list for the model, rendered as a live overlay that survives /reload and conversation compaction.",
    author: "juicesharp",
    downloads: "98.9K/mo",
    downloadNum: 98900,
    updated: "2d ago",
    npmUrl: "https://www.npmjs.com/package/@juicesharp/rpiv-todo",
    repoUrl: "https://github.com/juicesharp/rpiv-mono",
    webUrl: "https://pi.dev/packages/@juicesharp/rpiv-todo",
    installCommand: "npm:@juicesharp/rpiv-todo",
  },
  {
    name: "context-mode",
    version: "1.0.169",
    category: "package",
    categories: ["package", "extension"],
    description: "MCP plugin that saves 98% of your context window. Sandboxed code execution, FTS5 knowledge base, and intent-driven search.",
    author: "mksglu",
    downloads: "78.5K/mo",
    downloadNum: 78500,
    updated: "2mo ago",
    npmUrl: "https://www.npmjs.com/package/context-mode",
    webUrl: "https://pi.dev/packages/context-mode",
    installCommand: "npm:context-mode",
  },
  {
    name: "pi-lens",
    version: "4.1.3",
    category: "extension",
    categories: ["extension"],
    description: "Real-time code feedback for pi — LSP, linters, formatters, type-checking, structural analysis.",
    author: "apmantza",
    downloads: "60.1K/mo",
    downloadNum: 60100,
    updated: "3d ago",
    npmUrl: "https://www.npmjs.com/package/pi-lens",
    repoUrl: "https://github.com/apmantza/pi-lens",
    webUrl: "https://pi.dev/packages/pi-lens",
    installCommand: "npm:pi-lens",
  },
  {
    name: "@dietrichgebert/ponytail",
    version: "4.9.0",
    category: "skill",
    categories: ["skill"],
    description: "Lazy senior dev mode for AI agents. The best code is the code you never wrote.",
    author: "dietrichgebert",
    downloads: "49.5K/mo",
    downloadNum: 49500,
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
    categories: ["skill"],
    description: "73 agent skills synthesizing 17 years of software engineering discipline into a prescriptive methodology.",
    author: "danielvm",
    downloads: "34.9K/mo",
    downloadNum: 34900,
    updated: "4h ago",
    npmUrl: "https://www.npmjs.com/package/bigpowers",
    webUrl: "https://pi.dev/packages/bigpowers",
    installCommand: "npm:bigpowers",
  },
  {
    name: "@ff-labs/pi-fff",
    version: "0.10.6",
    category: "extension",
    categories: ["extension"],
    description: "FFF-powered fuzzy file and lightning-fast content search tools for coding agents.",
    author: "dmtr.kovalenko",
    downloads: "34.9K/mo",
    downloadNum: 34900,
    updated: "2d ago",
    npmUrl: "https://www.npmjs.com/package/@ff-labs/pi-fff",
    webUrl: "https://pi.dev/packages/@ff-labs/pi-fff",
    installCommand: "npm:@ff-labs/pi-fff",
  },
  {
    name: "pi-prompt-template-model",
    version: "0.12.2",
    category: "prompt",
    categories: ["prompt", "extension"],
    description: "Prompt template and system prompt model selector extension for pi coding agent.",
    author: "nicopreme",
    downloads: "21.3K/mo",
    downloadNum: 21300,
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
    categories: ["theme"],
    description: "Soothing pastel theme for Pi coding agent — Mocha, Macchiato, Frappé, and Latte variants.",
    author: "catppuccin",
    downloads: "24.1K/mo",
    downloadNum: 24100,
    updated: "1w ago",
    npmUrl: "https://www.npmjs.com/package/catppuccin-pi-theme",
    webUrl: "https://pi.dev/packages/catppuccin-pi-theme",
    installCommand: "npm:catppuccin-pi-theme",
  },
  {
    name: "tokyo-night-pi",
    version: "1.0.5",
    category: "theme",
    categories: ["theme"],
    description: "A clean Dark Visual Studio Code & terminal theme celebrating the lights of Downtown Tokyo.",
    author: "folke",
    downloads: "19.8K/mo",
    downloadNum: 19800,
    updated: "2w ago",
    npmUrl: "https://www.npmjs.com/package/tokyo-night-pi",
    webUrl: "https://pi.dev/packages/tokyo-night-pi",
    installCommand: "npm:tokyo-night-pi",
  },
  {
    name: "pi-zentui",
    version: "0.21.0",
    category: "extension",
    categories: ["extension", "theme"],
    description: "A Starship-inspired statusline and Opencode-style TUI for Pi coding agent.",
    author: "lmilojevicc",
    downloads: "9.9K/mo",
    downloadNum: 9911,
    updated: "6d ago",
    npmUrl: "https://www.npmjs.com/package/pi-zentui",
    webUrl: "https://pi.dev/packages/pi-zentui",
    installCommand: "npm:pi-zentui",
  },
];

/**
 * 查找指定包的详细说明与元数据（供已安装包丰富详情）
 */
export function findPackageMetadata(sourceOrName: string): Partial<MarketPackageItem> | undefined {
  const direct = SNAPSHOT_OFFICIAL_PACKAGES.find((p) => isSamePackage(p.name, sourceOrName));
  if (direct) return direct;
  for (const entry of Object.values(pageCache)) {
    const found = entry.items.find((p) => isSamePackage(p.name, sourceOrName));
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
    
    const rawType = typeMatch?.[1]?.toLowerCase() || "";
    const categories: MarketPackageItem["categories"] = [];
    if (rawType.includes("extension")) categories.push("extension");
    if (rawType.includes("skill")) categories.push("skill");
    if (rawType.includes("prompt")) categories.push("prompt");
    if (rawType.includes("theme")) categories.push("theme");
    if (categories.length === 0) categories.push("package");

    const category = categories[0];

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

    // 解析下载数字
    const rawDownloads = attrs.match(/data-package-downloads="(\d+)"/);
    const downloadNum = rawDownloads ? parseInt(rawDownloads[1], 10) : 0;

    items.push({
      name,
      version: "latest",
      category,
      categories,
      description,
      author,
      downloads,
      downloadNum,
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
  sort?: "downloads" | "recent" | "name";
}): Promise<{ items: MarketPackageItem[]; total: number }> {
  const q = (params.query || "").trim();
  const cat = params.category || "all";
  const page = Math.max(1, params.page || 1);
  const sort = params.sort || "downloads";

  const cacheKey = `${cat}:${page}:${sort}:${q}`;
  const cached = pageCache[cacheKey];
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return { items: cached.items, total: cached.total };
  }

  try {
    const searchParams = new URLSearchParams();
    if (q) searchParams.set("name", q);
    if (cat !== "all") searchParams.set("type", cat);
    if (page > 1) searchParams.set("page", String(page));
    searchParams.set("sort", sort);

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
 * 统一搜索与分页获取 packages 目录（支持多维排序与真实分页）
 */
export async function searchPiPackages(params: {
  query?: string;
  category?: string;
  page?: number;
  sort?: "downloads" | "recent" | "name";
}): Promise<PackageQueryResult> {
  const q = (params.query || "").trim();
  const cat = params.category || "all";
  const page = Math.max(1, params.page || 1);
  const sort = params.sort || "downloads";

  // 1. 尝试从 pi.dev 官方接口拉取当前页
  const { items: remoteItems, total: remoteTotal } = await fetchFromPiDevPaged({
    query: q,
    category: cat,
    page,
    sort,
  });

  if (remoteItems.length > 0) {
    const hasMore = page * 50 < remoteTotal;
    return {
      packages: remoteItems,
      total: remoteTotal,
      hasMore,
      page,
      sortBy: sort,
    };
  }

  // 2. 离线/异常降级兜底：在 SNAPSHOT_OFFICIAL_PACKAGES 中筛选并排序
  let fallback = SNAPSHOT_OFFICIAL_PACKAGES.filter((p) => {
    const matchCat = cat === "all" || p.categories.includes(cat as any);
    const matchQuery =
      !q ||
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.description.toLowerCase().includes(q.toLowerCase()) ||
      p.author.toLowerCase().includes(q.toLowerCase());
    return matchCat && matchQuery;
  });

  if (sort === "downloads") {
    fallback = [...fallback].sort((a, b) => (b.downloadNum || 0) - (a.downloadNum || 0));
  } else if (sort === "recent") {
    fallback = [...fallback].reverse();
  } else if (sort === "name") {
    fallback = [...fallback].sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    packages: fallback,
    total: fallback.length,
    hasMore: false,
    page: 1,
    sortBy: sort,
  };
}
