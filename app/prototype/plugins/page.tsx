// PowerI 插件管理系统 (Plugins/Packages) 原型探索
// 访问: http://localhost:9527/prototype/plugins?variant=a | b | c
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface MockPackage {
  name: string;
  version: string;
  latestVersion?: string;
  hasUpdate?: boolean;
  scope: "global" | "project";
  disabled: boolean;
  author: string;
  downloads: string;
  updated: string;
  category: "extension" | "skill" | "prompt" | "theme" | "package";
  description: string;
  resources: { kind: "extension" | "skill" | "prompt" | "theme"; name: string }[];
  repoUrl?: string;
  npmUrl?: string;
}

// 模拟官方 pi.dev/packages 热门生态包
const OFFICIAL_MARKET_PACKAGES: MockPackage[] = [
  {
    name: "pi-mcp-adapter",
    version: "2.31.0",
    scope: "global",
    disabled: false,
    author: "nicopreme",
    downloads: "761.4K/mo",
    updated: "3d ago",
    category: "extension",
    description: "MCP (Model Context Protocol) adapter extension for Pi coding agent. Connect standard MCP servers directly to your agent harness.",
    resources: [{ kind: "extension", name: "mcp-adapter" }],
    npmUrl: "https://www.npmjs.com/package/pi-mcp-adapter",
    repoUrl: "https://github.com/nicobailon/pi-mcp-adapter",
  },
  {
    name: "pi-web-access",
    version: "0.27.0",
    scope: "global",
    disabled: false,
    author: "nicopreme",
    downloads: "401.1K/mo",
    updated: "3d ago",
    category: "extension",
    description: "Web search, URL fetching, GitHub repo cloning, PDF extraction, YouTube transcript analysis for Pi.",
    resources: [
      { kind: "extension", name: "web-search" },
      { kind: "extension", name: "fetch-content" },
    ],
    npmUrl: "https://www.npmjs.com/package/pi-web-access",
    repoUrl: "https://github.com/nicobailon/pi-web-access",
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
    updated: "13h ago",
    category: "package",
    description: "Pi extension for single-agent delegation and scripted multi-agent workflows.",
    resources: [
      { kind: "extension", name: "subagents-engine" },
      { kind: "skill", name: "delegate-task" },
    ],
    npmUrl: "https://www.npmjs.com/package/pi-subagents",
    repoUrl: "https://github.com/nicobailon/pi-subagents",
  },
  {
    name: "@companion-ai/feynman",
    version: "0.3.47",
    scope: "project",
    disabled: true,
    author: "advaitpaliwal",
    downloads: "296.7K/mo",
    updated: "5d ago",
    category: "package",
    description: "Research-first CLI agent built on Pi and alphaXiv for academic paper deep dives.",
    resources: [
      { kind: "extension", name: "arxiv-fetcher" },
      { kind: "skill", name: "paper-synthesis" },
    ],
    npmUrl: "https://www.npmjs.com/package/@companion-ai/feynman",
    repoUrl: "https://github.com/companion-inc/feynman",
  },
  {
    name: "@juicesharp/rpiv-todo",
    version: "2.8.0",
    scope: "global",
    disabled: false,
    author: "juicesharp",
    downloads: "98.9K/mo",
    updated: "2d ago",
    category: "extension",
    description: "A todo list for the model, rendered as a live overlay that survives /reload and compaction.",
    resources: [{ kind: "extension", name: "todo-manager" }],
    npmUrl: "https://www.npmjs.com/package/@juicesharp/rpiv-todo",
    repoUrl: "https://github.com/juicesharp/rpiv-mono",
  },
  {
    name: "pi-lens",
    version: "4.1.3",
    scope: "project",
    disabled: false,
    author: "apmantza",
    downloads: "60.1K/mo",
    updated: "3d ago",
    category: "extension",
    description: "Real-time code feedback for pi — LSP, linters, formatters, type-checking & structural analysis.",
    resources: [{ kind: "extension", name: "lsp-lens" }],
    npmUrl: "https://www.npmjs.com/package/pi-lens",
    repoUrl: "https://github.com/apmantza/pi-lens",
  },
  {
    name: "context-mode",
    version: "1.0.169",
    scope: "global",
    disabled: false,
    author: "mksglu",
    downloads: "78.5K/mo",
    updated: "2mo ago",
    category: "package",
    description: "MCP plugin that saves 98% of your context window. Sandboxed code execution and FTS5 knowledge base.",
    resources: [{ kind: "extension", name: "context-mode-mcp" }],
    npmUrl: "https://www.npmjs.com/package/context-mode",
  },
  {
    name: "bigpowers",
    version: "2.87.8",
    scope: "global",
    disabled: false,
    author: "danielvm",
    downloads: "34.9K/mo",
    updated: "4h ago",
    category: "skill",
    description: "73 agent skills synthesizing 17 years of software engineering discipline into a prescriptive methodology.",
    resources: [{ kind: "skill", name: "bigpowers-suite" }],
    npmUrl: "https://www.npmjs.com/package/bigpowers",
  },
  {
    name: "@ff-labs/pi-fff",
    version: "0.10.6",
    scope: "global",
    disabled: false,
    author: "dmtr.kovalenko",
    downloads: "34.9K/mo",
    updated: "2d ago",
    category: "extension",
    description: "FFF-powered fuzzy file and ultra-fast content search tools for coding agents.",
    resources: [{ kind: "extension", name: "fff-search" }],
    npmUrl: "https://www.npmjs.com/package/@ff-labs/pi-fff",
  },
];

export default function PluginsPrototypePage() {
  const [variant, setVariant] = useState<"a" | "b" | "c">("a");
  const [installedList, setInstalledList] = useState<MockPackage[]>(OFFICIAL_MARKET_PACKAGES.slice(0, 4));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"installed" | "discover">("installed");
  const [reloading, setReloading] = useState(false);
  const [busyMap, setBusyMap] = useState<Record<string, string>>({});
  const [selectedPkgName, setSelectedPkgName] = useState<string>(OFFICIAL_MARKET_PACKAGES[0].name);

  // 模拟操作逻辑
  const handleToggle = (pkgName: string) => {
    setInstalledList((prev) =>
      prev.map((p) => (p.name === pkgName ? { ...p, disabled: !p.disabled } : p))
    );
  };

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
    }, 800);
  };

  const handleRemove = (pkgName: string) => {
    setBusyMap((prev) => ({ ...prev, [pkgName]: "removing" }));
    setTimeout(() => {
      setInstalledList((prev) => prev.filter((p) => p.name !== pkgName));
      setBusyMap((prev) => {
        const next = { ...prev };
        delete next[pkgName];
        return next;
      });
    }, 600);
  };

  const handleInstall = (pkg: MockPackage, scope: "global" | "project" = "global") => {
    setBusyMap((prev) => ({ ...prev, [pkg.name]: "installing" }));
    setTimeout(() => {
      setInstalledList((prev) => [...prev, { ...pkg, scope, disabled: false }]);
      setBusyMap((prev) => {
        const next = { ...prev };
        delete next[pkg.name];
        return next;
      });
    }, 800);
  };

  const handleReload = () => {
    setReloading(true);
    setTimeout(() => setReloading(false), 900);
  };

  // 搜索与过滤结果
  const marketSearchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return OFFICIAL_MARKET_PACKAGES.filter((p) => {
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q);
      const matchesCategory =
        selectedCategory === "all" || p.category === selectedCategory;
      return matchesQuery && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  const installedFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return installedList.filter((p) => {
      return (
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [installedList, searchQuery]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #0f1117)", color: "var(--text, #e2e8f0)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* 顶部原型变体切换导航 */}
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
            探索 pi.dev/packages 插件交互重构
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-dim, #718096)", marginRight: 4 }}>对比变体:</span>
          {(
            [
              ["a", "Variant A (搜索市场与已安装上下分层)"],
              ["b", "Variant B (已安装 vs 官方市场双 Tab)"],
              ["c", "Variant C (VS Code 式侧栏流 + 沉浸详情)"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              style={{
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: variant === v ? 600 : 400,
                background: variant === v ? "var(--accent, #38bdf8)" : "var(--bg, #0f1117)",
                color: variant === v ? "#0f1117" : "var(--text, #e2e8f0)",
                border: "1px solid var(--border, #2d3748)",
                borderRadius: 6,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* 原型主展示容器（模拟 Settings 弹窗内视口） */}
      <main style={{ maxWidth: 1080, margin: "24px auto", padding: "0 16px" }}>
        
        {/* ========================================================================= */}
        {/* VARIANT A: 搜索市场与已安装上下分层（统一搜索流 + 直观卡片墙）               */}
        {/* ========================================================================= */}
        {variant === "a" && (
          <div style={{ background: "var(--bg-panel, #1a202c)", border: "1px solid var(--border, #2d3748)", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}>
            {/* Top Toolbar */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border, #2d3748)", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim, #718096)" }}>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="搜索或输入 package 名称 (如 pi-mcp-adapter, @juicesharp/rpiv-todo, github:user/repo)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px 9px 36px", fontSize: 13, background: "var(--bg, #0f1117)", border: "1px solid var(--border, #2d3748)", borderRadius: 8, color: "var(--text, #e2e8f0)", outline: "none", boxSizing: "border-box" }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-dim, #718096)", cursor: "pointer", fontSize: 14 }}>✕</button>
                )}
              </div>

              {/* Reload Button */}
              <button
                onClick={handleReload}
                disabled={reloading}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 12, fontWeight: 500, background: "var(--bg, #0f1117)", border: "1px solid var(--border, #2d3748)", borderRadius: 8, color: "var(--text, #e2e8f0)", cursor: "pointer" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: reloading ? "rotate(360deg)" : "none", transition: "transform 0.8s ease" }}>
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>{reloading ? "正在重载..." : "重载会话 (Reload)"}</span>
              </button>
            </div>

            <div style={{ padding: 20 }}>
              {/* Section 1: 已安装 Packages */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text, #e2e8f0)" }}>
                      已安装的 Packages ({installedFiltered.length})
                    </span>
                    <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--bg-hover, #2d3748)", color: "var(--text-dim, #a0aec0)" }}>
                      ~/.pi/agent & .pi/
                    </span>
                  </div>
                </div>

                {installedFiltered.length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", border: "1px dashed var(--border, #2d3748)", borderRadius: 8, color: "var(--text-dim, #718096)", fontSize: 13 }}>
                    暂无匹配的已安装 Package
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                    {installedFiltered.map((pkg) => {
                      const isInstalled = true;
                      const isBusy = busyMap[pkg.name];

                      return (
                        <div
                          key={pkg.name}
                          style={{
                            padding: "14px 16px",
                            background: pkg.disabled ? "rgba(15, 17, 23, 0.4)" : "var(--bg, #0f1117)",
                            border: `1px solid ${pkg.disabled ? "var(--border, #2d3748)" : "var(--border, #3b4252)"}`,
                            borderRadius: 8,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 16,
                            opacity: pkg.disabled ? 0.75 : 1,
                            transition: "all 0.15s ease",
                          }}
                        >
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text, #e2e8f0)" }}>
                                {pkg.name}
                              </span>
                              <span style={{ fontSize: 11, padding: "1px 5px", borderRadius: 4, background: "var(--bg-hover, #2d3748)", color: "var(--accent, #38bdf8)" }}>
                                v{pkg.version}
                              </span>
                              <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, border: "1px solid var(--border, #4a5568)", color: "var(--text-dim, #a0aec0)" }}>
                                {pkg.scope === "global" ? "Global" : "Project"}
                              </span>
                              {pkg.hasUpdate && (
                                <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "#f59e0b", color: "#000", fontWeight: 600 }}>
                                  有更新 v{pkg.latestVersion}
                                </span>
                              )}
                              <span style={{ fontSize: 10, color: pkg.disabled ? "#ef4444" : "#10b981", marginLeft: 4 }}>
                                ● {pkg.disabled ? "已禁用" : "运行中 (Loaded)"}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-dim, #a0aec0)", lineHeight: 1.4 }}>
                              {pkg.description}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-dim, #718096)", marginTop: 6, display: "flex", gap: 12 }}>
                              <span>资源: {pkg.resources.map((r) => `${r.kind}:${r.name}`).join(", ")}</span>
                              <span>作者: {pkg.author}</span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            {/* Toggle Switch */}
                            <button
                              onClick={() => handleToggle(pkg.name)}
                              style={{
                                padding: "5px 10px",
                                fontSize: 11,
                                fontWeight: 500,
                                background: pkg.disabled ? "var(--bg-hover, #2d3748)" : "rgba(16, 185, 129, 0.15)",
                                border: `1px solid ${pkg.disabled ? "var(--border, #4a5568)" : "#10b981"}`,
                                color: pkg.disabled ? "var(--text-dim, #a0aec0)" : "#10b981",
                                borderRadius: 6,
                                cursor: "pointer",
                              }}
                            >
                              {pkg.disabled ? "启用" : "已启用"}
                            </button>

                            {/* Update Button */}
                            {pkg.hasUpdate && (
                              <button
                                onClick={() => handleUpdate(pkg.name)}
                                disabled={Boolean(isBusy)}
                                style={{
                                  padding: "5px 10px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: "#f59e0b",
                                  color: "#000",
                                  border: "none",
                                  borderRadius: 6,
                                  cursor: "pointer",
                                }}
                              >
                                {isBusy === "updating" ? "更新中..." : "更新"}
                              </button>
                            )}

                            {/* Remove Button */}
                            <button
                              onClick={() => handleRemove(pkg.name)}
                              disabled={Boolean(isBusy)}
                              style={{
                                padding: "5px 10px",
                                fontSize: 11,
                                background: "none",
                                border: "1px solid var(--border, #4a5568)",
                                color: "#f87171",
                                borderRadius: 6,
                                cursor: "pointer",
                              }}
                            >
                              {isBusy === "removing" ? "移除中..." : "移除"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 2: 探索与发现 (pi.dev/packages 官方生态) */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text, #e2e8f0)" }}>
                      探索官方市场 (pi.dev/packages)
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-dim, #718096)" }}>
                      共发现 {marketSearchResults.length} 个扩展
                    </span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 10 }}>
                  {marketSearchResults.map((pkg) => {
                    const isInstalled = installedList.some((p) => p.name === pkg.name);
                    const isBusy = busyMap[pkg.name];

                    return (
                      <div
                        key={pkg.name}
                        style={{
                          padding: "14px",
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
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text, #e2e8f0)", wordBreak: "break-all" }}>
                              {pkg.name}
                            </span>
                            <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "var(--bg-hover, #2d3748)", color: "var(--accent, #38bdf8)", flexShrink: 0 }}>
                              {pkg.category}
                            </span>
                          </div>
                          <p style={{ fontSize: 11, color: "var(--text-dim, #a0aec0)", lineHeight: 1.4, margin: "4px 0 8px 0" }}>
                            {pkg.description}
                          </p>
                          <div style={{ fontSize: 10, color: "var(--text-dim, #718096)", display: "flex", gap: 8 }}>
                            <span>📥 {pkg.downloads}</span>
                            <span>👤 {pkg.author}</span>
                            <span>🕒 {pkg.updated}</span>
                          </div>
                        </div>

                        <div style={{ borderTop: "1px solid var(--border, #2d3748)", paddingTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "var(--text-dim, #718096)" }}>v{pkg.version}</span>
                          {isInstalled ? (
                            <span style={{ fontSize: 11, color: "#10b981", fontWeight: 500 }}>✓ 已安装</span>
                          ) : (
                            <button
                              onClick={() => handleInstall(pkg)}
                              disabled={Boolean(isBusy)}
                              style={{
                                padding: "4px 10px",
                                fontSize: 11,
                                fontWeight: 500,
                                background: "var(--accent, #38bdf8)",
                                color: "#0f1117",
                                border: "none",
                                borderRadius: 5,
                                cursor: "pointer",
                              }}
                            >
                              {isBusy === "installing" ? "安装中..." : "+ 安装"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VARIANT B: 已安装 vs 官方市场双 Tab（胶囊分栏 + 深度管理模式）                 */}
        {/* ========================================================================= */}
        {variant === "b" && (
          <div style={{ background: "var(--bg-panel, #1a202c)", border: "1px solid var(--border, #2d3748)", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}>
            {/* Header with Search & Tabs */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border, #2d3748)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
              {/* Pill Tabs */}
              <div style={{ display: "flex", background: "var(--bg, #0f1117)", padding: 3, borderRadius: 8, border: "1px solid var(--border, #2d3748)" }}>
                <button
                  onClick={() => setActiveTab("installed")}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: activeTab === "installed" ? 600 : 400,
                    background: activeTab === "installed" ? "var(--bg-panel, #1a202c)" : "transparent",
                    color: activeTab === "installed" ? "var(--accent, #38bdf8)" : "var(--text-dim, #718096)",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>已安装 (Installed)</span>
                  <span style={{ fontSize: 10, background: "var(--bg-hover, #2d3748)", padding: "1px 5px", borderRadius: 10 }}>{installedList.length}</span>
                </button>
                <button
                  onClick={() => setActiveTab("discover")}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: activeTab === "discover" ? 600 : 400,
                    background: activeTab === "discover" ? "var(--bg-panel, #1a202c)" : "transparent",
                    color: activeTab === "discover" ? "var(--accent, #38bdf8)" : "var(--text-dim, #718096)",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>探索市场 (pi.dev)</span>
                  <span style={{ fontSize: 10, background: "rgba(56, 189, 248, 0.2)", color: "var(--accent, #38bdf8)", padding: "1px 5px", borderRadius: 10 }}>5.3k+</span>
                </button>
              </div>

              {/* Search Bar */}
              <div style={{ flex: 1, maxWidth: 360, position: "relative" }}>
                <input
                  type="text"
                  placeholder="过滤或搜索 package..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: "100%", padding: "7px 12px", fontSize: 12, background: "var(--bg, #0f1117)", border: "1px solid var(--border, #2d3748)", borderRadius: 6, color: "var(--text, #e2e8f0)", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* Reload Button */}
              <button
                onClick={handleReload}
                disabled={reloading}
                style={{ padding: "7px 12px", fontSize: 12, background: "var(--bg, #0f1117)", border: "1px solid var(--border, #2d3748)", borderRadius: 6, color: "var(--text, #e2e8f0)", cursor: "pointer" }}
              >
                {reloading ? "重载中..." : "🔄 重载会话"}
              </button>
            </div>

            {/* Tab Body */}
            <div style={{ padding: 20 }}>
              {activeTab === "installed" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                    {installedFiltered.map((pkg) => (
                      <div
                        key={pkg.name}
                        style={{
                          padding: 16,
                          background: "var(--bg, #0f1117)",
                          border: `1px solid ${pkg.disabled ? "var(--border, #2d3748)" : "var(--border, #4a5568)"}`,
                          borderRadius: 8,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text, #e2e8f0)" }}>{pkg.name}</span>
                            <span style={{ fontSize: 11, padding: "1px 5px", borderRadius: 4, background: "var(--bg-hover, #2d3748)", color: "var(--accent, #38bdf8)" }}>
                              v{pkg.version}
                            </span>
                          </div>
                          <p style={{ fontSize: 12, color: "var(--text-dim, #a0aec0)", lineHeight: 1.4, margin: 0 }}>
                            {pkg.description}
                          </p>
                        </div>

                        <div style={{ borderTop: "1px solid var(--border, #2d3748)", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button
                              onClick={() => handleToggle(pkg.name)}
                              style={{
                                padding: "4px 8px",
                                fontSize: 11,
                                background: pkg.disabled ? "var(--bg-hover, #2d3748)" : "rgba(16, 185, 129, 0.15)",
                                border: `1px solid ${pkg.disabled ? "var(--border, #4a5568)" : "#10b981"}`,
                                color: pkg.disabled ? "var(--text-dim, #a0aec0)" : "#10b981",
                                borderRadius: 5,
                                cursor: "pointer",
                              }}
                            >
                              {pkg.disabled ? "已禁用" : "已启用"}
                            </button>
                            {pkg.hasUpdate && (
                              <button
                                onClick={() => handleUpdate(pkg.name)}
                                style={{ padding: "4px 8px", fontSize: 11, background: "#f59e0b", color: "#000", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: 600 }}
                              >
                                更新 v{pkg.latestVersion}
                              </button>
                            )}
                          </div>

                          <button
                            onClick={() => handleRemove(pkg.name)}
                            style={{ padding: "4px 8px", fontSize: 11, background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                          >
                            卸载
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "discover" && (
                <div>
                  {/* Category Filter Pills */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                    {["all", "extension", "skill", "prompt", "theme", "package"].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        style={{
                          padding: "4px 10px",
                          fontSize: 11,
                          textTransform: "capitalize",
                          background: selectedCategory === cat ? "var(--accent, #38bdf8)" : "var(--bg, #0f1117)",
                          color: selectedCategory === cat ? "#0f1117" : "var(--text-dim, #a0aec0)",
                          border: "1px solid var(--border, #2d3748)",
                          borderRadius: 6,
                          cursor: "pointer",
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                    {marketSearchResults.map((pkg) => {
                      const isInstalled = installedList.some((p) => p.name === pkg.name);
                      return (
                        <div
                          key={pkg.name}
                          style={{
                            padding: 16,
                            background: "var(--bg, #0f1117)",
                            border: "1px solid var(--border, #2d3748)",
                            borderRadius: 8,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text, #e2e8f0)" }}>{pkg.name}</span>
                              <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "var(--bg-hover, #2d3748)", color: "var(--accent, #38bdf8)" }}>
                                {pkg.category}
                              </span>
                            </div>
                            <p style={{ fontSize: 12, color: "var(--text-dim, #a0aec0)", lineHeight: 1.4, margin: "0 0 8px 0" }}>
                              {pkg.description}
                            </p>
                            <div style={{ fontSize: 11, color: "var(--text-dim, #718096)", display: "flex", gap: 10 }}>
                              <span>📥 {pkg.downloads}</span>
                              <span>👤 {pkg.author}</span>
                            </div>
                          </div>

                          <div style={{ borderTop: "1px solid var(--border, #2d3748)", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 11, color: "var(--text-dim, #718096)" }}>v{pkg.version}</span>
                            {isInstalled ? (
                              <span style={{ fontSize: 11, color: "#10b981", fontWeight: 500 }}>✓ 已安装</span>
                            ) : (
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  onClick={() => handleInstall(pkg, "global")}
                                  style={{ padding: "4px 8px", fontSize: 11, background: "var(--accent, #38bdf8)", color: "#0f1117", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 500 }}
                                >
                                  + 全局安装
                                </button>
                                <button
                                  onClick={() => handleInstall(pkg, "project")}
                                  style={{ padding: "4px 8px", fontSize: 11, background: "var(--bg-hover, #2d3748)", color: "var(--text, #e2e8f0)", border: "1px solid var(--border, #4a5568)", borderRadius: 4, cursor: "pointer" }}
                                >
                                  项目专属
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VARIANT C: VS Code 式侧栏流 + 沉浸详情（左侧紧凑列表 + 右侧深度看板）       */}
        {/* ========================================================================= */}
        {variant === "c" && (
          <div style={{ background: "var(--bg-panel, #1a202c)", border: "1px solid var(--border, #2d3748)", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", display: "flex", height: 600 }}>
            {/* Left: Compact List & Search */}
            <div style={{ width: 340, borderRight: "1px solid var(--border, #2d3748)", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "12px", borderBottom: "1px solid var(--border, #2d3748)" }}>
                <input
                  type="text"
                  placeholder="搜索 packages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: "100%", padding: "6px 10px", fontSize: 12, background: "var(--bg, #0f1117)", border: "1px solid var(--border, #2d3748)", borderRadius: 6, color: "var(--text, #e2e8f0)", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-dim, #718096)", padding: "4px 8px" }}>
                  已安装 (INSTALLED)
                </div>
                {installedList.map((pkg) => (
                  <div
                    key={pkg.name}
                    onClick={() => setSelectedPkgName(pkg.name)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: selectedPkgName === pkg.name ? "var(--bg-hover, #2d3748)" : "transparent",
                      cursor: "pointer",
                      marginBottom: 2,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text, #e2e8f0)" }}>{pkg.name}</span>
                      <span style={{ fontSize: 10, color: "var(--text-dim, #718096)" }}>v{pkg.version}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-dim, #a0aec0)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                      {pkg.description}
                    </div>
                  </div>
                ))}

                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-dim, #718096)", padding: "12px 8px 4px" }}>
                  官方热门 (PI.DEV/PACKAGES)
                </div>
                {OFFICIAL_MARKET_PACKAGES.filter((p) => !installedList.some((i) => i.name === p.name)).map((pkg) => (
                  <div
                    key={pkg.name}
                    onClick={() => setSelectedPkgName(pkg.name)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: selectedPkgName === pkg.name ? "var(--bg-hover, #2d3748)" : "transparent",
                      cursor: "pointer",
                      marginBottom: 2,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text, #e2e8f0)" }}>{pkg.name}</span>
                      <span style={{ fontSize: 10, color: "var(--accent, #38bdf8)" }}>{pkg.category}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-dim, #a0aec0)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                      {pkg.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Immersive Detail */}
            {(() => {
              const currentPkg = OFFICIAL_MARKET_PACKAGES.find((p) => p.name === selectedPkgName) || installedList[0];
              const isInstalled = installedList.some((p) => p.name === currentPkg.name);
              const installedRecord = installedList.find((p) => p.name === currentPkg.name);

              return (
                <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text, #e2e8f0)", margin: "0 0 4px 0" }}>{currentPkg.name}</h2>
                      <div style={{ fontSize: 12, color: "var(--text-dim, #718096)" }}>
                        由 <span style={{ color: "var(--text, #e2e8f0)" }}>{currentPkg.author}</span> 发布 · 月下载 {currentPkg.downloads} · 更新于 {currentPkg.updated}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      {isInstalled ? (
                        <>
                          <button
                            onClick={() => handleToggle(currentPkg.name)}
                            style={{
                              padding: "6px 12px",
                              fontSize: 12,
                              background: installedRecord?.disabled ? "var(--bg-hover, #2d3748)" : "rgba(16, 185, 129, 0.15)",
                              border: `1px solid ${installedRecord?.disabled ? "var(--border, #4a5568)" : "#10b981"}`,
                              color: installedRecord?.disabled ? "var(--text-dim, #a0aec0)" : "#10b981",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            {installedRecord?.disabled ? "启用扩展" : "已启用"}
                          </button>
                          <button
                            onClick={() => handleRemove(currentPkg.name)}
                            style={{ padding: "6px 12px", fontSize: 12, background: "none", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 6, cursor: "pointer" }}
                          >
                            卸载
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleInstall(currentPkg)}
                          style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, background: "var(--accent, #38bdf8)", color: "#0f1117", border: "none", borderRadius: 6, cursor: "pointer" }}
                        >
                          + 安装到环境
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: "var(--text, #cbd5e1)", lineHeight: 1.6, padding: "12px 0", borderTop: "1px solid var(--border, #2d3748)", borderBottom: "1px solid var(--border, #2d3748)" }}>
                    {currentPkg.description}
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--text-dim, #718096)", marginBottom: 8 }}>包含的 Agent 资源</h3>
                    <div style={{ display: "flex", gap: 8 }}>
                      {currentPkg.resources.map((r, i) => (
                        <span key={i} style={{ padding: "4px 10px", borderRadius: 6, background: "var(--bg, #0f1117)", border: "1px solid var(--border, #2d3748)", fontSize: 12, color: "var(--accent, #38bdf8)" }}>
                          📦 {r.kind}: {r.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}
