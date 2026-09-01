// PowerI 插件管理系统 (Plugins/Packages) 最佳实践高保真原型
// 访问: http://localhost:9527/prototype/plugins?variant=b (或直接访问)
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";

interface MockPackage {
  name: string;
  version: string;
  latestVersion?: string;
  hasUpdate?: boolean;
  scope: "global" | "project";
  disabled: boolean;
  author: string;
  downloads: string;
  downloadNum: number;
  updated: string;
  categories: ("extension" | "skill" | "prompt" | "theme" | "package")[];
  description: string;
  resources: { kind: "extension" | "skill" | "prompt" | "theme"; name: string }[];
  repoUrl?: string;
  npmUrl?: string;
  webUrl: string;
}

// 模拟官方 pi.dev/packages 完整多维生态包
const OFFICIAL_MARKET_PACKAGES: MockPackage[] = [
  {
    name: "pi-mcp-adapter",
    version: "2.31.0",
    scope: "global",
    disabled: false,
    author: "nicopreme",
    downloads: "761.4K/mo",
    downloadNum: 761400,
    updated: "3d ago",
    categories: ["extension"],
    description: "MCP (Model Context Protocol) adapter extension for Pi coding agent. Connect standard MCP servers directly to your harness.",
    resources: [{ kind: "extension", name: "mcp-adapter" }],
    npmUrl: "https://www.npmjs.com/package/pi-mcp-adapter",
    repoUrl: "https://github.com/nicobailon/pi-mcp-adapter",
    webUrl: "https://pi.dev/packages/pi-mcp-adapter",
  },
  {
    name: "pi-web-access",
    version: "0.27.0",
    scope: "global",
    disabled: false,
    author: "nicopreme",
    downloads: "401.1K/mo",
    downloadNum: 401100,
    updated: "3d ago",
    categories: ["extension"],
    description: "Web search, URL fetching, GitHub repo cloning, PDF extraction, YouTube transcript analysis for Pi.",
    resources: [
      { kind: "extension", name: "web-search" },
      { kind: "extension", name: "fetch-content" },
    ],
    npmUrl: "https://www.npmjs.com/package/pi-web-access",
    repoUrl: "https://github.com/nicobailon/pi-web-access",
    webUrl: "https://pi.dev/packages/pi-web-access",
  },
  {
    name: "pi-subagents",
    version: "0.61.0",
    latestVersion: "0.62.0",
    hasUpdate: true,
    scope: "global",
    disabled: false,
    author: "nicopreme",
    downloads: "362.5K/mo",
    downloadNum: 362500,
    updated: "13h ago",
    categories: ["extension", "skill"], // 复合多标签
    description: "Pi extension for single-agent delegation and scripted multi-agent workflows.",
    resources: [
      { kind: "extension", name: "subagents-engine" },
      { kind: "skill", name: "delegate-task" },
    ],
    npmUrl: "https://www.npmjs.com/package/pi-subagents",
    repoUrl: "https://github.com/nicobailon/pi-subagents",
    webUrl: "https://pi.dev/packages/pi-subagents",
  },
  {
    name: "@companion-ai/feynman",
    version: "0.3.47",
    scope: "project",
    disabled: true,
    author: "advaitpaliwal",
    downloads: "296.7K/mo",
    downloadNum: 296700,
    updated: "5d ago",
    categories: ["extension", "skill"],
    description: "Research-first CLI agent built on Pi and alphaXiv for academic paper deep dives.",
    resources: [
      { kind: "extension", name: "arxiv-fetcher" },
      { kind: "skill", name: "paper-synthesis" },
    ],
    npmUrl: "https://www.npmjs.com/package/@companion-ai/feynman",
    repoUrl: "https://github.com/companion-inc/feynman",
    webUrl: "https://pi.dev/packages/@companion-ai/feynman",
  },
  {
    name: "@juicesharp/rpiv-ask-user-question",
    version: "2.8.0",
    scope: "global",
    disabled: false,
    author: "juicesharp",
    downloads: "117.3K/mo",
    downloadNum: 117300,
    updated: "2d ago",
    categories: ["extension"],
    description: "A structured questionnaire the model can put to you when it would otherwise guess, with typed options instead of free-form replies.",
    resources: [{ kind: "extension", name: "ask-user-question" }],
    npmUrl: "https://www.npmjs.com/package/@juicesharp/rpiv-ask-user-question",
    repoUrl: "https://github.com/juicesharp/rpiv-mono",
    webUrl: "https://pi.dev/packages/@juicesharp/rpiv-ask-user-question",
  },
  {
    name: "pi-background-tasks",
    version: "2.4.2",
    scope: "global",
    disabled: false,
    author: "ismailsaleekh",
    downloads: "107.1K/mo",
    downloadNum: 107100,
    updated: "18d ago",
    categories: ["extension"],
    description: "Pi extension for durable background shell tasks, read-only delegated agents, and fixed-purpose Fusion workflows.",
    resources: [{ kind: "extension", name: "background-tasks" }],
    npmUrl: "https://www.npmjs.com/package/pi-background-tasks",
    repoUrl: "https://github.com/ismailsaleekh/pi-background-tasks",
    webUrl: "https://pi.dev/packages/pi-background-tasks",
  },
  {
    name: "@juicesharp/rpiv-todo",
    version: "2.8.0",
    scope: "global",
    disabled: false,
    author: "juicesharp",
    downloads: "98.9K/mo",
    downloadNum: 98900,
    updated: "2d ago",
    categories: ["extension"],
    description: "A todo list for the model, rendered as a live overlay that survives /reload and compaction.",
    resources: [{ kind: "extension", name: "todo-manager" }],
    npmUrl: "https://www.npmjs.com/package/@juicesharp/rpiv-todo",
    repoUrl: "https://github.com/juicesharp/rpiv-mono",
    webUrl: "https://pi.dev/packages/@juicesharp/rpiv-todo",
  },
  {
    name: "context-mode",
    version: "1.0.169",
    scope: "global",
    disabled: false,
    author: "mksglu",
    downloads: "78.5K/mo",
    downloadNum: 78500,
    updated: "2mo ago",
    categories: ["package", "extension"],
    description: "MCP plugin that saves 98% of your context window. Sandboxed code execution, FTS5 knowledge base, and intent-driven search.",
    resources: [{ kind: "extension", name: "context-mode-mcp" }],
    npmUrl: "https://www.npmjs.com/package/context-mode",
    webUrl: "https://pi.dev/packages/context-mode",
  },
  {
    name: "pi-lens",
    version: "4.1.3",
    scope: "project",
    disabled: false,
    author: "apmantza",
    downloads: "60.1K/mo",
    downloadNum: 60100,
    updated: "3d ago",
    categories: ["extension"],
    description: "Real-time code feedback for pi — LSP, linters, formatters, type-checking & structural analysis.",
    resources: [{ kind: "extension", name: "lsp-lens" }],
    npmUrl: "https://www.npmjs.com/package/pi-lens",
    repoUrl: "https://github.com/apmantza/pi-lens",
    webUrl: "https://pi.dev/packages/pi-lens",
  },
  {
    name: "@dietrichgebert/ponytail",
    version: "4.9.0",
    scope: "global",
    disabled: false,
    author: "dietrichgebert",
    downloads: "49.5K/mo",
    downloadNum: 49500,
    updated: "24d ago",
    categories: ["skill"],
    description: "Lazy senior dev mode for AI agents. The best code is the code you never wrote.",
    resources: [{ kind: "skill", name: "ponytail-skill" }],
    npmUrl: "https://www.npmjs.com/package/@dietrichgebert/ponytail",
    repoUrl: "https://github.com/DietrichGebert/ponytail",
    webUrl: "https://pi.dev/packages/@dietrichgebert/ponytail",
  },
  {
    name: "bigpowers",
    version: "2.87.8",
    scope: "global",
    disabled: false,
    author: "danielvm",
    downloads: "34.9K/mo",
    downloadNum: 34900,
    updated: "4h ago",
    categories: ["skill"],
    description: "73 agent skills synthesizing 17 years of software engineering discipline into a prescriptive methodology.",
    resources: [{ kind: "skill", name: "bigpowers-suite" }],
    npmUrl: "https://www.npmjs.com/package/bigpowers",
    webUrl: "https://pi.dev/packages/bigpowers",
  },
  {
    name: "@ff-labs/pi-fff",
    version: "0.10.6",
    scope: "global",
    disabled: false,
    author: "dmtr.kovalenko",
    downloads: "34.9K/mo",
    downloadNum: 34900,
    updated: "2d ago",
    categories: ["extension"],
    description: "FFF-powered fuzzy file and lightning-fast content search tools for coding agents.",
    resources: [{ kind: "extension", name: "fff-search" }],
    npmUrl: "https://www.npmjs.com/package/@ff-labs/pi-fff",
    webUrl: "https://pi.dev/packages/@ff-labs/pi-fff",
  },
  {
    name: "pi-prompt-template-model",
    version: "0.12.2",
    scope: "global",
    disabled: false,
    author: "nicopreme",
    downloads: "21.3K/mo",
    downloadNum: 21300,
    updated: "4d ago",
    categories: ["prompt", "extension"],
    description: "Prompt template model selector extension for pi coding agent.",
    resources: [{ kind: "prompt", name: "template-selector" }],
    npmUrl: "https://www.npmjs.com/package/pi-prompt-template-model",
    webUrl: "https://pi.dev/packages/pi-prompt-template-model",
  },
  {
    name: "catppuccin-pi-theme",
    version: "1.2.0",
    scope: "global",
    disabled: false,
    author: "catppuccin",
    downloads: "24.1K/mo",
    downloadNum: 24100,
    updated: "1w ago",
    categories: ["theme"],
    description: "Soothing pastel theme for Pi coding agent — Mocha, Macchiato, Frappé, and Latte variants.",
    resources: [{ kind: "theme", name: "catppuccin-palette" }],
    npmUrl: "https://www.npmjs.com/package/catppuccin-pi-theme",
    webUrl: "https://pi.dev/packages/catppuccin-pi-theme",
  },
  {
    name: "tokyo-night-pi",
    version: "1.0.5",
    scope: "global",
    disabled: false,
    author: "folke",
    downloads: "19.8K/mo",
    downloadNum: 19800,
    updated: "2w ago",
    categories: ["theme"],
    description: "A clean Dark Visual Studio Code & terminal theme celebrating the lights of Downtown Tokyo.",
    resources: [{ kind: "theme", name: "tokyo-night" }],
    npmUrl: "https://www.npmjs.com/package/tokyo-night-pi",
    webUrl: "https://pi.dev/packages/tokyo-night-pi",
  },
  {
    name: "pi-zentui",
    version: "0.21.0",
    scope: "global",
    disabled: false,
    author: "lmilojevicc",
    downloads: "9.9K/mo",
    downloadNum: 9911,
    updated: "6d ago",
    categories: ["extension", "theme"], // 复合标签
    description: "A Starship-inspired statusline and Opencode-style TUI for Pi coding agent.",
    resources: [
      { kind: "extension", name: "zentui-statusline" },
      { kind: "theme", name: "zentui-dark" },
    ],
    npmUrl: "https://www.npmjs.com/package/pi-zentui",
    webUrl: "https://pi.dev/packages/pi-zentui",
  },
];

export default function PluginsPrototypePage() {
  const [activeTab, setActiveTab] = useState<"installed" | "discover">("installed");
  const [installedList, setInstalledList] = useState<MockPackage[]>(OFFICIAL_MARKET_PACKAGES.slice(0, 4));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"downloads" | "recent" | "name">("downloads");
  
  // 变更与重载感知
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [busyMap, setBusyMap] = useState<Record<string, string>>({});
  
  // 交互状态
  const [expandedPkgKey, setExpandedPkgKey] = useState<string | null>(null);
  const [confirmDeletePkg, setConfirmDeletePkg] = useState<MockPackage | null>(null);
  const [page, setPage] = useState(1);

  // 快捷键支持: Esc 关闭弹窗, Enter 确认
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (confirmDeletePkg) {
        if (e.key === "Escape") {
          e.preventDefault();
          setConfirmDeletePkg(null);
        } else if (e.key === "Enter") {
          e.preventDefault();
          handleConfirmDelete();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDeletePkg]);

  // 1. 开关 Toggle
  const handleToggle = (pkgName: string) => {
    setInstalledList((prev) =>
      prev.map((p) => (p.name === pkgName ? { ...p, disabled: !p.disabled } : p))
    );
    setHasPendingChanges(true);
  };

  // 2. 更新 Update
  const handleUpdate = (pkgName: string) => {
    setBusyMap((prev) => ({ ...prev, [pkgName]: "updating" }));
    setTimeout(() => {
      setInstalledList((prev) =>
        prev.map((p) =>
          p.name === pkgName
            ? { ...p, version: p.latestVersion || p.version, hasUpdate: false }
            : p
        )
      );
      setBusyMap((prev) => {
        const next = { ...prev };
        delete next[pkgName];
        return next;
      });
      setHasPendingChanges(true);
    }, 800);
  };

  // 3. 卸载 Remove
  const handleConfirmDelete = () => {
    if (!confirmDeletePkg) return;
    const targetName = confirmDeletePkg.name;
    setConfirmDeletePkg(null);
    setBusyMap((prev) => ({ ...prev, [targetName]: "removing" }));
    setTimeout(() => {
      setInstalledList((prev) => prev.filter((p) => p.name !== targetName));
      setBusyMap((prev) => {
        const next = { ...prev };
        delete next[targetName];
        return next;
      });
      setHasPendingChanges(true);
    }, 600);
  };

  // 4. 安装 Install
  const handleInstall = (pkg: MockPackage, scope: "global" | "project" = "global") => {
    setBusyMap((prev) => ({ ...prev, [pkg.name]: "installing" }));
    setTimeout(() => {
      setInstalledList((prev) => [...prev, { ...pkg, scope, disabled: false }]);
      setBusyMap((prev) => {
        const next = { ...prev };
        delete next[pkg.name];
        return next;
      });
      setHasPendingChanges(true);
    }, 800);
  };

  // 5. 会话重载 Reload
  const handleReload = () => {
    setReloading(true);
    setTimeout(() => {
      setReloading(false);
      setHasPendingChanges(false);
    }, 900);
  };

  // 搜索、分类与排序管道
  const marketSearchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = OFFICIAL_MARKET_PACKAGES.filter((p) => {
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q);
      const matchesCategory =
        selectedCategory === "all" || p.categories.includes(selectedCategory as any);
      return matchesQuery && matchesCategory;
    });

    // 排序逻辑
    if (sortBy === "downloads") {
      list = [...list].sort((a, b) => b.downloadNum - a.downloadNum);
    } else if (sortBy === "recent") {
      list = [...list].reverse(); // 模拟按时间最新排在前面
    } else if (sortBy === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [searchQuery, selectedCategory, sortBy]);

  const installedFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return installedList.filter((p) => {
      return (
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q)
      );
    });
  }, [installedList, searchQuery]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #0f1117)", color: "var(--text, #e2e8f0)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* 顶部导航 */}
      <header
        style={{
          borderBottom: "1px solid var(--border, #2d3748)",
          background: "var(--bg-panel, #1a202c)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", color: "var(--accent, #38bdf8)" }}>
            POWERI PACKAGES PROTOTYPE
          </span>
          <span style={{ fontSize: 12, color: "var(--text-dim, #718096)" }}>
            5 项调研最佳实践验证版
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--text-dim, #a0aec0)" }}>
            ⚡ 支持: 多维排序 · 复合标签 · 100%镜像对称 · 待重载高亮 · 键盘Esc
          </span>
        </div>
      </header>

      {/* 原型主展示容器 */}
      <main style={{ maxWidth: 1080, margin: "24px auto", padding: "0 16px" }}>
        <div style={{ background: "var(--bg-panel, #1a202c)", border: "1px solid var(--border, #2d3748)", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}>
          
          {/* Top Toolbar: Tabs + Search + Sort + Reload (带待重载红点高亮) */}
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--border, #2d3748)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {/* 双 Tab 胶囊选择器: Installed vs Discover */}
            <div style={{ display: "flex", background: "var(--bg, #0f1117)", padding: 3, borderRadius: 7, border: "1px solid var(--border, #2d3748)" }}>
              <button
                onClick={() => setActiveTab("installed")}
                style={{
                  padding: "5px 14px",
                  fontSize: 12,
                  fontWeight: activeTab === "installed" ? 600 : 400,
                  background: activeTab === "installed" ? "var(--bg-panel, #1a202c)" : "transparent",
                  color: activeTab === "installed" ? "var(--accent, #38bdf8)" : "var(--text-dim, #718096)",
                  border: "none",
                  borderRadius: 5,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.12s",
                }}
              >
                <span>已安装</span>
                <span style={{ fontSize: 10, background: "var(--bg-hover, #2d3748)", padding: "1px 5px", borderRadius: 8 }}>
                  {installedList.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("discover")}
                style={{
                  padding: "5px 14px",
                  fontSize: 12,
                  fontWeight: activeTab === "discover" ? 600 : 400,
                  background: activeTab === "discover" ? "var(--bg-panel, #1a202c)" : "transparent",
                  color: activeTab === "discover" ? "var(--accent, #38bdf8)" : "var(--text-dim, #718096)",
                  border: "none",
                  borderRadius: 5,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.12s",
                }}
              >
                <span>发现</span>
              </button>
            </div>

            {/* 搜索框 */}
            <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim, #718096)" }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="搜索 package 名称、描述、作者..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px 6px 30px",
                  fontSize: 12,
                  background: "var(--bg, #0f1117)",
                  border: "1px solid var(--border, #2d3748)",
                  borderRadius: 6,
                  color: "var(--text, #e2e8f0)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-dim, #718096)", cursor: "pointer", fontSize: 12 }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* 排序选择器 (在 Discover 视图下可用) */}
            {activeTab === "discover" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-dim, #718096)" }}>排序:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  style={{
                    padding: "5px 8px",
                    fontSize: 11,
                    background: "var(--bg, #0f1117)",
                    border: "1px solid var(--border, #2d3748)",
                    borderRadius: 6,
                    color: "var(--text, #e2e8f0)",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="downloads">最多下载 (Most Downloads)</option>
                  <option value="recent">最新发布 (Recently Published)</option>
                  <option value="name">名称 (A-Z)</option>
                </select>
              </div>
            )}

            {/* 重载按钮 (带变更呼吸高亮灯) */}
            <button
              onClick={handleReload}
              disabled={reloading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: hasPendingChanges ? 600 : 500,
                background: hasPendingChanges ? "rgba(245, 158, 11, 0.15)" : "var(--bg, #0f1117)",
                border: `1px solid ${hasPendingChanges ? "#f59e0b" : "var(--border, #2d3748)"}`,
                borderRadius: 6,
                color: hasPendingChanges ? "#f59e0b" : "var(--text, #e2e8f0)",
                cursor: "pointer",
                position: "relative",
                transition: "all 0.2s",
              }}
              title={hasPendingChanges ? "有未生效的插件变更，点击立即重载" : "重载当前会话"}
            >
              {hasPendingChanges && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#f59e0b",
                    boxShadow: "0 0 6px #f59e0b",
                  }}
                />
              )}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ transform: reloading ? "rotate(360deg)" : "none", transition: "transform 0.8s ease" }}
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{reloading ? "正在重载..." : hasPendingChanges ? "重载生效" : "重载会话"}</span>
            </button>
          </div>

          {/* 待重载黄色提示条 */}
          {hasPendingChanges && (
            <div style={{ padding: "6px 18px", background: "rgba(245, 158, 11, 0.12)", borderBottom: "1px solid rgba(245, 158, 11, 0.25)", color: "#f59e0b", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>⚠️ 扩展配置已更改，点击右上角「重载生效」让底层 Agent 进程热生效。</span>
              <button onClick={handleReload} style={{ background: "none", border: "none", color: "#f59e0b", textDecoration: "underline", fontSize: 11, cursor: "pointer" }}>立即重载 →</button>
            </div>
          )}

          {/* 主视口内容 */}
          <div style={{ padding: 18 }}>
            
            {/* ========================================================================= */}
            {/* TAB 1: 已安装 (Installed Packages) — 100% 镜像对称 + 复合标签               */}
            {/* ========================================================================= */}
            {activeTab === "installed" && (
              <div>
                {installedFiltered.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", border: "1px dashed var(--border, #2d3748)", borderRadius: 8, color: "var(--text-dim, #718096)" }}>
                    <div style={{ fontSize: 13, marginBottom: 8 }}>暂无已安装的 Package</div>
                    <button
                      onClick={() => setActiveTab("discover")}
                      style={{ padding: "6px 14px", fontSize: 12, background: "var(--accent, #38bdf8)", color: "#0f1117", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}
                    >
                      去发现扩展市场 →
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                    {installedFiltered.map((pkg) => {
                      const isExpanded = expandedPkgKey === pkg.name;
                      const isBusy = busyMap[pkg.name];

                      return (
                        <div
                          key={pkg.name}
                          style={{
                            padding: 14,
                            background: pkg.disabled ? "var(--bg, #0f1117)" : "var(--bg-panel, #1a202c)",
                            border: `1px solid ${pkg.disabled ? "var(--border, #2d3748)" : "var(--border, #3b4252)"}`,
                            borderRadius: 8,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            gap: 10,
                            opacity: pkg.disabled ? 0.75 : 1,
                            transition: "all 0.12s",
                          }}
                        >
                          <div>
                            {/* Header: Name + Direct Link + Scope Badge + Multi Category Badges */}
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                              <a
                                href={pkg.webUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "var(--text, #e2e8f0)",
                                  wordBreak: "break-all",
                                  textDecoration: "none",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                                title="在 pi.dev 上查看"
                                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent, #38bdf8)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text, #e2e8f0)"; }}
                              >
                                <span>{pkg.name}</span>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                              </a>

                              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "var(--bg, #0f1117)", color: "var(--accent, #38bdf8)", border: "1px solid var(--border, #2d3748)" }}>
                                  {pkg.scope === "global" ? "全局" : "项目专属"}
                                </span>
                                {pkg.categories.map((cat, i) => (
                                  <span key={i} style={{ fontSize: 10, padding: "1px 4px", borderRadius: 4, background: "var(--bg-hover, #2d3748)", color: "var(--text-dim, #a0aec0)" }}>
                                    {cat}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Description */}
                            <p style={{ fontSize: 11, color: "var(--text-dim, #a0aec0)", lineHeight: 1.45, margin: "4px 0 8px 0" }}>
                              {pkg.description}
                            </p>

                            {/* Symmetric Metadata: Downloads + Author + Status + Resource Drawer */}
                            <div style={{ fontSize: 10, color: "var(--text-dim, #718096)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span>📥 {pkg.downloads}</span>
                                <span>👤 {pkg.author}</span>
                                <span style={{ color: pkg.disabled ? "#ef4444" : "#10b981", display: "inline-flex", alignItems: "center", gap: 3 }}>
                                  ● {pkg.disabled ? "已禁用" : "已启用"}
                                </span>
                              </div>

                              {pkg.resources.length > 0 && (
                                <button
                                  onClick={() => setExpandedPkgKey(isExpanded ? null : pkg.name)}
                                  style={{ background: "none", border: "none", color: "var(--accent, #38bdf8)", fontSize: 10, cursor: "pointer", padding: 0 }}
                                >
                                  {isExpanded ? "收起明细 ▲" : `资源 (${pkg.resources.length}) ▼`}
                                </button>
                              )}
                            </div>

                            {/* Resource Drawer */}
                            {isExpanded && pkg.resources.length > 0 && (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border, #2d3748)", display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {pkg.resources.map((res, i) => (
                                  <span
                                    key={i}
                                    style={{
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                      background: "var(--bg, #0f1117)",
                                      border: "1px solid var(--border, #2d3748)",
                                      fontSize: 10,
                                      color: "var(--text, #e2e8f0)",
                                    }}
                                  >
                                    <strong style={{ color: "var(--accent, #38bdf8)" }}>{res.kind}</strong>: {res.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Footer Actions */}
                          <div style={{ borderTop: "1px solid var(--border, #2d3748)", paddingTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 11, color: "var(--text-dim, #718096)" }}>
                                v{pkg.version}
                              </span>
                              {pkg.hasUpdate && (
                                <span style={{ fontSize: 9, background: "#f59e0b", color: "#000", padding: "1px 4px", borderRadius: 3, fontWeight: 600 }}>
                                  新版本 v{pkg.latestVersion}
                                </span>
                              )}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              {/* Toggle */}
                              <button
                                onClick={() => handleToggle(pkg.name)}
                                style={{
                                  padding: "3px 8px",
                                  fontSize: 11,
                                  fontWeight: 500,
                                  background: pkg.disabled ? "var(--bg-hover, #2d3748)" : "rgba(16, 185, 129, 0.15)",
                                  border: `1px solid ${pkg.disabled ? "var(--border, #4a5568)" : "#10b981"}`,
                                  color: pkg.disabled ? "var(--text-dim, #a0aec0)" : "#10b981",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                }}
                              >
                                {pkg.disabled ? "启用" : "已启用"}
                              </button>

                              {/* Update */}
                              <button
                                onClick={() => pkg.hasUpdate && handleUpdate(pkg.name)}
                                disabled={!pkg.hasUpdate || Boolean(isBusy)}
                                style={{
                                  padding: "3px 8px",
                                  fontSize: 11,
                                  background: pkg.hasUpdate ? "#f59e0b" : "var(--bg, #0f1117)",
                                  border: "1px solid var(--border, #2d3748)",
                                  color: pkg.hasUpdate ? "#000" : "var(--text-dim, #718096)",
                                  borderRadius: 4,
                                  cursor: pkg.hasUpdate ? "pointer" : "not-allowed",
                                  opacity: pkg.hasUpdate ? 1 : 0.45,
                                  fontWeight: pkg.hasUpdate ? 600 : 400,
                                }}
                                title={pkg.hasUpdate ? "更新到最新版" : "已是最新版本"}
                              >
                                {isBusy === "updating" ? "..." : pkg.hasUpdate ? "更新" : "最新"}
                              </button>

                              {/* Remove (触发二次确认弹窗) */}
                              <button
                                onClick={() => setConfirmDeletePkg(pkg)}
                                disabled={Boolean(isBusy)}
                                style={{
                                  padding: "3px 8px",
                                  fontSize: 11,
                                  background: "none",
                                  border: "1px solid var(--border, #4a5568)",
                                  color: "#f87171",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                }}
                                title="卸载 package"
                              >
                                {isBusy === "removing" ? "..." : "卸载"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: 发现市场 (Discover)                                                */}
            {/* ========================================================================= */}
            {activeTab === "discover" && (
              <div>
                {/* Category Filter Pills (纯正 i18n 无括号混杂) */}
                <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                  {[
                    { id: "all", label: "全部" },
                    { id: "extension", label: "扩展" },
                    { id: "skill", label: "技能" },
                    { id: "prompt", label: "提示词" },
                    { id: "theme", label: "主题" },
                    { id: "package", label: "安装包" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      style={{
                        padding: "4px 12px",
                        fontSize: 11,
                        background: selectedCategory === cat.id ? "var(--accent, #38bdf8)" : "var(--bg, #0f1117)",
                        color: selectedCategory === cat.id ? "#0f1117" : "var(--text-dim, #a0aec0)",
                        border: "1px solid var(--border, #2d3748)",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontWeight: selectedCategory === cat.id ? 600 : 400,
                        transition: "all 0.12s",
                      }}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Cards Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                  {marketSearchResults.map((pkg) => {
                    const installed = installedList.some((p) => p.name === pkg.name);
                    const isBusy = busyMap[pkg.name];

                    return (
                      <div
                        key={pkg.name}
                        style={{
                          padding: 14,
                          background: "var(--bg, #0f1117)",
                          border: "1px solid var(--border, #2d3748)",
                          borderRadius: 8,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div>
                          {/* Title & Multi-type Badges + Direct Web Link */}
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                            <a
                              href={pkg.webUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "var(--text, #e2e8f0)",
                                wordBreak: "break-all",
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                              title="在 pi.dev 上查看"
                              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent, #38bdf8)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text, #e2e8f0)"; }}
                            >
                              <span>{pkg.name}</span>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </a>

                            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                              {pkg.categories.map((cat, i) => (
                                <span key={i} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "var(--bg-panel, #1a202c)", color: "var(--accent, #38bdf8)", border: "1px solid var(--border, #2d3748)" }}>
                                  {cat}
                                </span>
                              ))}
                            </div>
                          </div>

                          <p style={{ fontSize: 11, color: "var(--text-dim, #a0aec0)", lineHeight: 1.45, margin: "4px 0 8px 0" }}>
                            {pkg.description}
                          </p>

                          <div style={{ fontSize: 10, color: "var(--text-dim, #718096)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <span>📥 {pkg.downloads}</span>
                            <span>👤 {pkg.author}</span>
                            <span>🕒 {pkg.updated}</span>
                          </div>
                        </div>

                        {/* Footer Actions */}
                        <div style={{ borderTop: "1px solid var(--border, #2d3748)", paddingTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "var(--text-dim, #718096)" }}>v{pkg.version}</span>
                          {installed ? (
                            <span style={{ fontSize: 11, color: "#10b981", fontWeight: 500 }}>
                              ✓ 已安装
                            </span>
                          ) : (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => handleInstall(pkg, "global")}
                                disabled={Boolean(isBusy)}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 11,
                                  fontWeight: 500,
                                  background: "var(--accent, #38bdf8)",
                                  color: "#0f1117",
                                  border: "none",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                }}
                              >
                                {isBusy === "installing" ? "安装中..." : "+ 全局安装"}
                              </button>
                              <button
                                onClick={() => handleInstall(pkg, "project")}
                                disabled={Boolean(isBusy)}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 11,
                                  background: "var(--bg-panel, #1a202c)",
                                  color: "var(--text, #e2e8f0)",
                                  border: "1px solid var(--border, #4a5568)",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                }}
                              >
                                + 项目专属
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 底部加载更多 */}
                <div style={{ marginTop: 20, textAlign: "center", paddingBottom: 10 }}>
                  <button
                    onClick={() => setPage((prev) => prev + 1)}
                    style={{
                      padding: "8px 24px",
                      fontSize: 12,
                      fontWeight: 500,
                      background: "var(--bg-panel, #1a202c)",
                      border: "1px solid var(--border, #2d3748)",
                      borderRadius: 6,
                      color: "var(--text, #e2e8f0)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent, #38bdf8)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border, #2d3748)"; }}
                  >
                    加载更多 Package ({marketSearchResults.length} 已展示)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 卸载二次确认模态弹窗 (支持 Esc 关闭、Enter 确认) */}
      {confirmDeletePkg && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "rgba(0, 0, 0, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            backdropFilter: "blur(2px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDeletePkg(null);
          }}
        >
          <div
            style={{
              width: 420,
              maxWidth: "100%",
              background: "var(--bg, #0f1117)",
              border: "1px solid var(--border, #2d3748)",
              borderRadius: 10,
              padding: 20,
              boxShadow: "0 12px 36px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20, color: "#f87171" }}>⚠️</span>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text, #e2e8f0)" }}>
                确认卸载 Package？
              </div>
            </div>

            <p style={{ fontSize: 13, color: "var(--text-dim, #a0aec0)", lineHeight: 1.5, margin: 0 }}>
              您确定要卸载 <strong style={{ color: "var(--text, #e2e8f0)" }}>{confirmDeletePkg.name}</strong> 吗？
              卸载后该包提供的所有扩展、技能与命令将从环境中移除。
            </p>

            <div style={{ fontSize: 11, color: "var(--text-dim, #718096)", background: "var(--bg-panel, #1a202c)", padding: "6px 10px", borderRadius: 5 }}>
              ⌨️ 提示: 按 <kbd style={{ background: "var(--bg, #0f1117)", padding: "1px 4px", borderRadius: 3, border: "1px solid var(--border, #2d3748)" }}>Enter</kbd> 确认卸载，按 <kbd style={{ background: "var(--bg, #0f1117)", padding: "1px 4px", borderRadius: 3, border: "1px solid var(--border, #2d3748)" }}>Esc</kbd> 取消
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                onClick={() => setConfirmDeletePkg(null)}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  background: "var(--bg-panel, #1a202c)",
                  border: "1px solid var(--border, #2d3748)",
                  borderRadius: 6,
                  color: "var(--text, #e2e8f0)",
                  cursor: "pointer",
                }}
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: "#ef4444",
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                确认卸载
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
