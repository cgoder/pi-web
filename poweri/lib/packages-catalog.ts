// PowerI Packages 官方目录与搜索服务
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
    installCommand: "npm:pi-intercom",
  },
];

/**
 * 搜索 pi.dev / npm packages 官方目录
 */
export async function searchPiPackages(params: {
  query?: string;
  category?: string;
}): Promise<MarketPackageItem[]> {
  const q = (params.query || "").trim().toLowerCase();
  const cat = params.category || "all";

  // 1. 本地精选与热门过滤
  let localResults = POPULAR_PI_PACKAGES.filter((p) => {
    const matchCat = cat === "all" || p.category === cat;
    const matchQuery =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.author.toLowerCase().includes(q);
    return matchCat && matchQuery;
  });

  // 2. 如果输入了具体搜索词，尝试从 npm search API 动态检索相关 package
  if (q && q.length >= 2) {
    try {
      const npmUrl = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q + " pi-")}&size=15`;
      const res = await fetch(npmUrl, { cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json() as { objects?: { package: { name: string; version: string; description?: string; publisher?: { username: string }; date: string; links?: { npm?: string; repository?: string } } }[] };
        const fetched: MarketPackageItem[] = (data.objects || []).map((obj) => {
          const p = obj.package;
          let category: MarketPackageItem["category"] = "package";
          if (p.name.includes("skill") || p.description?.includes("skill")) category = "skill";
          else if (p.name.includes("theme") || p.description?.includes("theme")) category = "theme";
          else if (p.name.includes("prompt") || p.description?.includes("prompt")) category = "prompt";
          else if (p.name.includes("extension") || p.name.startsWith("pi-")) category = "extension";

          return {
            name: p.name,
            version: p.version,
            category,
            description: p.description || "No description provided",
            author: p.publisher?.username || "npm",
            updated: "recently",
            npmUrl: p.links?.npm || `https://www.npmjs.com/package/${p.name}`,
            repoUrl: p.links?.repository,
            installCommand: `npm:${p.name}`,
          };
        });

        // 合并去重
        const existingNames = new Set(localResults.map((r) => r.name));
        for (const item of fetched) {
          if (!existingNames.has(item.name)) {
            existingNames.add(item.name);
            if (cat === "all" || item.category === cat) {
              localResults.push(item);
            }
          }
        }
      }
    } catch {
      // 网络错误时平滑降级使用 localResults
    }
  }

  return localResults;
}
