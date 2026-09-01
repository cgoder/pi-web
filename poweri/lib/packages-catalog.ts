// PowerI Packages 官方目录与搜索服务 (解析 https://pi.dev/packages 及 npm 官方 registry)

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
  installCommand?: string;
}

// 内存缓存，避免频繁抓取 pi.dev 官方页面
let cachedOfficialPackages: MarketPackageItem[] = [];
let lastFetchedTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟缓存

/**
 * 从 https://pi.dev/packages 的 HTML 中精准解析 packages 列表
 */
export function parsePiDevPackagesHtml(html: string): MarketPackageItem[] {
  const items: MarketPackageItem[] = [];
  
  // 匹配所有 <article class="surface-panel content-card" ...> ... </article>
  const articleRegex = /<article([^>]*)>([\s\S]*?)<\/article>/gi;
  let match: RegExpExecArray | null;

  while ((match = articleRegex.exec(html)) !== null) {
    const articleAttributes = match[1];
    const articleBody = match[2];

    if (!articleAttributes.includes('data-package-card="true"')) {
      continue;
    }

    // 包名
    const nameMatch = articleAttributes.match(/data-package-name="([^"]+)"/) ||
      articleBody.match(/<h3[^>]*class="packages-name"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    const name = nameMatch?.[1]?.trim();
    if (!name) continue;

    // 类别
    const typeMatch = articleAttributes.match(/data-package-types="([^"]*)"/) ||
      articleBody.match(/data-package-types="([^"]*)"/) ||
      articleBody.match(/<span[^>]*class="[^"]*packages-badge"[^>]*>([^<]+)<\/span>/i);
    let category: MarketPackageItem["category"] = "package";
    const rawType = typeMatch?.[1]?.toLowerCase() || "";
    if (rawType.includes("extension")) category = "extension";
    else if (rawType.includes("skill")) category = "skill";
    else if (rawType.includes("prompt")) category = "prompt";
    else if (rawType.includes("theme")) category = "theme";

    // 描述
    const descMatch = articleBody.match(/<p[^>]*class="packages-desc"[^>]*>([\s\S]*?)<\/p>/i);
    const description = descMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || "No description provided.";

    // Meta (author, downloads, updated)
    const metaMatch = articleBody.match(/<div[^>]*class="packages-meta"[^>]*>([\s\S]*?)<\/div>/i);
    let author = "";
    let downloads = "";
    let updated = "";
    if (metaMatch) {
      const spans = [...metaMatch[1].matchAll(/<span[^>]*>([^<]+)<\/span>/gi)].map((m) => m[1].trim());
      author = spans[0] || "";
      downloads = spans[1] || "";
      updated = spans[2] || "";
    }

    // 链接
    const npmMatch = articleBody.match(/href="(https:\/\/www\.npmjs\.com\/package\/[^"]+)"/i);
    const repoMatch = articleBody.match(/href="(https:\/\/github\.com\/[^"]+)"/i);

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
      installCommand: `npm:${name}`,
    });
  }

  return items;
}

/**
 * 从 pi.dev 官方页面实时抓取并解析数据
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
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const html = await res.text();
      const items = parsePiDevPackagesHtml(html);
      if (items.length > 0) {
        if (!query && category === "all") {
          cachedOfficialPackages = items;
          lastFetchedTime = Date.now();
        }
        return category === "all" ? items : items.filter((item) => item.category === category);
      }
    }
  } catch {
    // ignore network timeout
  }

  return [];
}

/**
 * NPM 官方 Registry 备用实时检索
 */
export async function fetchFromNpmRegistry(query: string, category = "all"): Promise<MarketPackageItem[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const q = encodeURIComponent(`${query.trim()} pi`);
    const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${q}&size=25`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      objects?: {
        package: {
          name: string;
          version: string;
          description?: string;
          publisher?: { username: string };
          date: string;
          links?: { npm?: string; repository?: string };
          keywords?: string[];
        };
      }[];
    };

    return (data.objects || []).map((obj) => {
      const p = obj.package;
      let cat: MarketPackageItem["category"] = "package";
      const kw = (p.keywords || []).join(" ").toLowerCase();
      const n = p.name.toLowerCase();
      const d = (p.description || "").toLowerCase();

      if (kw.includes("extension") || n.includes("extension") || d.includes("extension") || n.startsWith("pi-")) cat = "extension";
      else if (kw.includes("skill") || n.includes("skill") || d.includes("skill")) cat = "skill";
      else if (kw.includes("prompt") || n.includes("prompt")) cat = "prompt";
      else if (kw.includes("theme") || n.includes("theme")) cat = "theme";

      return {
        name: p.name,
        version: p.version,
        category: cat,
        description: p.description || "No description provided.",
        author: p.publisher?.username || "npm",
        updated: "recently",
        npmUrl: p.links?.npm || `https://www.npmjs.com/package/${p.name}`,
        repoUrl: p.links?.repository,
        installCommand: `npm:${p.name}`,
      };
    }).filter((item) => category === "all" || item.category === category);
  } catch {
    return [];
  }
}

// 内置官方 Top 20 精选包目录（离线或断网时的坚固基线）
export const POPULAR_PI_PACKAGES: MarketPackageItem[] = [
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
    installCommand: "npm:@juicesharp/rpiv-todo",
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
    installCommand: "npm:context-mode",
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
    installCommand: "npm:pi-lens",
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
    installCommand: "npm:@dietrichgebert/ponytail",
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
    installCommand: "npm:@ff-labs/pi-fff",
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
    installCommand: "npm:bigpowers",
  },
];

/**
 * 查找指定包的详细说明与元数据（供已安装包丰富详情）
 */
export function findPackageMetadata(sourceOrName: string): Partial<MarketPackageItem> | undefined {
  const clean = sourceOrName.toLowerCase().replace(/^npm:/, "").replace(/^git:/, "").trim();
  const direct = POPULAR_PI_PACKAGES.find((p) => p.name.toLowerCase() === clean);
  if (direct) return direct;
  return cachedOfficialPackages.find((p) => p.name.toLowerCase() === clean);
}

/**
 * 统一搜索与获取 packages 目录
 */
export async function searchPiPackages(params: {
  query?: string;
  category?: string;
}): Promise<MarketPackageItem[]> {
  const q = (params.query || "").trim();
  const cat = params.category || "all";

  // 1. 如果有缓存且无搜索词，直接返回缓存
  if (!q && cat === "all" && cachedOfficialPackages.length > 0 && Date.now() - lastFetchedTime < CACHE_TTL_MS) {
    return cachedOfficialPackages;
  }

  // 2. 尝试从 pi.dev 官方抓取
  const officialResults = await fetchFromPiDev(q, cat);
  if (officialResults.length > 0) {
    return officialResults;
  }

  // 3. 如果从 pi.dev 没抓到且有 query，尝试从 npm registry 搜索
  if (q) {
    const npmResults = await fetchFromNpmRegistry(q, cat);
    if (npmResults.length > 0) {
      return npmResults;
    }
  }

  // 4. 平滑降级：使用本地精选库做本地过滤
  return POPULAR_PI_PACKAGES.filter((p) => {
    const matchCat = cat === "all" || p.category === cat;
    const matchQuery =
      !q ||
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.description.toLowerCase().includes(q.toLowerCase()) ||
      p.author.toLowerCase().includes(q.toLowerCase());
    return matchCat && matchQuery;
  });
}
