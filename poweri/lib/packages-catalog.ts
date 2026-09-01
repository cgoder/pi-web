// PowerI Packages 官方目录与搜索服务 (稳定确定性分批、pi.dev 解析与 npm 官方生态检索)

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

// 内存稳定全量缓存
let cachedOfficialPackages: MarketPackageItem[] = [];
let lastFetchedTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 分钟稳定缓存

/**
 * 官方 Top 50 高频权威包快照（保证离线或首屏加载时的恒定数量与极致速度）
 */
export const SNAPSHOT_OFFICIAL_PACKAGES: MarketPackageItem[] = [
  {
    name: "pi-mcp-adapter",
    version: "2.31.0",
    category: "extension",
    description: "MCP (Model Context Protocol) adapter extension for Pi coding agent. Connect standard MCP servers directly to your agent harness.",
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
    name: "@tintinweb/pi-subagents",
    version: "0.19.0",
    category: "extension",
    description: "A pi extension that brings Claude Code-like sub-agents and workflow orchestration to pi.",
    author: "tintinweb",
    downloads: "48.4K/mo",
    updated: "4d ago",
    npmUrl: "https://www.npmjs.com/package/@tintinweb/pi-subagents",
    repoUrl: "https://github.com/tintinweb/pi-subagents",
    webUrl: "https://pi.dev/packages/@tintinweb/pi-subagents",
    installCommand: "npm:@tintinweb/pi-subagents",
  },
  {
    name: "pi-simplify",
    version: "0.2.3",
    category: "extension",
    description: "A Pi extension that reviews recently changed code for clarity, consistency, and maintainability.",
    author: "mdevy",
    downloads: "42.9K/mo",
    updated: "1mo ago",
    npmUrl: "https://www.npmjs.com/package/pi-simplify",
    repoUrl: "https://github.com/MattDevy/pi-extensions",
    webUrl: "https://pi.dev/packages/pi-simplify",
    installCommand: "npm:pi-simplify",
  },
  {
    name: "pi-memory",
    version: "0.4.2",
    category: "package",
    description: "Pi coding agent extension for memory with qmd-powered semantic search across logs and scratchpad.",
    author: "jayzeng",
    downloads: "38.7K/mo",
    updated: "21d ago",
    npmUrl: "https://www.npmjs.com/package/pi-memory",
    repoUrl: "https://github.com/jayzeng/pi-memory",
    webUrl: "https://pi.dev/packages/pi-memory",
    installCommand: "npm:pi-memory",
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
 * 实时从 pi.dev 抓取
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
        if (!query && category === "all") {
          cachedOfficialPackages = items;
          lastFetchedTime = Date.now();
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
  return cachedOfficialPackages.find((p) => p.name.toLowerCase() === clean);
}

/**
 * 统一搜索与获取 packages 目录（稳定确定性分批返回，杜绝数量随机浮动）
 */
export async function searchPiPackages(params: {
  query?: string;
  category?: string;
  limit?: number;
}): Promise<MarketPackageItem[]> {
  const q = (params.query || "").trim().toLowerCase();
  const cat = params.category || "all";
  const limit = params.limit || 50;

  // 1. 若无搜索词且分类为 all，优先返回稳定快照基准或长效缓存
  let workingList: MarketPackageItem[] = [];

  if (!q && cat === "all") {
    if (cachedOfficialPackages.length > 0 && Date.now() - lastFetchedTime < CACHE_TTL_MS) {
      workingList = cachedOfficialPackages;
    } else {
      workingList = SNAPSHOT_OFFICIAL_PACKAGES;
      // 异步在后台静默刷新远程最新数据，不阻塞当前响应
      void fetchFromPiDev("", "all");
    }
  } else {
    // 2. 有搜索词或指定分类时，先在完整已知库中做精准匹配
    const combinedBase = [...cachedOfficialPackages, ...SNAPSHOT_OFFICIAL_PACKAGES];
    const uniqueBase = Array.from(new Map(combinedBase.map((p) => [p.name, p])).values());

    workingList = uniqueBase.filter((p) => {
      const matchCat = cat === "all" || p.category === cat;
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });

    // 如果本地匹配结果不足 10 条，且有网络搜索词，则尝试向 pi.dev 发起远端检索扩充
    if (workingList.length < 10 && q) {
      const remote = await fetchFromPiDev(q, cat);
      if (remote.length > 0) {
        const set = new Set(workingList.map((p) => p.name));
        for (const item of remote) {
          if (!set.has(item.name)) {
            set.add(item.name);
            workingList.push(item);
          }
        }
      }
    }
  }

  // 稳定截取指定数量
  return workingList.slice(0, limit);
}
