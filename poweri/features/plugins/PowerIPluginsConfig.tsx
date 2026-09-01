// PowerI Plugins 插件管理中心 (双 Tab 模式: Installed vs Discover + 稳定分页加载)
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useI18n } from "@/hooks/useI18n";
import { sendAgentCommand } from "@/lib/agent-client";
import type { PluginPackageInfo, PluginsResponse } from "@/lib/api-types";
import { tp } from "@/poweri/lib/i18n";
import {
  getPiDevWebUrl,
  type MarketPackageItem,
  type PackageQueryResult,
  SNAPSHOT_OFFICIAL_PACKAGES,
} from "@/poweri/lib/packages-catalog";

interface Props {
  cwd?: string | null;
  sessionId?: string | null;
  onClose?: () => void;
  onReloaded?: () => void;
  embedded?: boolean;
}

type PluginAction = "install" | "remove" | "update" | "disable" | "enable";

function normalizePluginSourceInput(value: string): string {
  const match = value.trim().match(/^\$?\s*pi\s+install\s+(\S+)\s*$/);
  return match?.[1] ?? value;
}

function packageKey(pkg: Pick<PluginPackageInfo, "source" | "scope">): string {
  return `${pkg.scope}\0${pkg.source}`;
}

export function PowerIPluginsConfig({ cwd, sessionId, onClose, onReloaded, embedded = false }: Props) {
  const { locale } = useI18n();
  const [activeTab, setActiveTab] = useState<"installed" | "discover">("installed");
  const [pluginsData, setPluginsData] = useState<PluginsResponse | null>(null);
  const [marketPackages, setMarketPackages] = useState<MarketPackageItem[]>(SNAPSHOT_OFFICIAL_PACKAGES);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [marketLoading, setMarketLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [busyKeys, setBusyKeys] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [expandedPkgKey, setExpandedPkgKey] = useState<string | null>(null);
  const [confirmDeletePkg, setConfirmDeletePkg] = useState<PluginPackageInfo | null>(null);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    return tp(locale, key, params);
  }, [locale]);

  // 搜索防抖 (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1); // 搜索词改变时重置分页
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 分类改变时重置分页
  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    setPage(1);
  };

  // 1. 加载本地已安装插件
  const loadInstalledPlugins = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const url = cwd ? `/api/plugins?cwd=${encodeURIComponent(cwd)}` : "/api/plugins";
      const res = await fetch(url);
      const data = (await res.json()) as PluginsResponse & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPluginsData(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  // 2. 搜索/加载 pi.dev 官方市场 packages (稳定分页)
  const loadMarketPackages = useCallback(async (query = "", category = "all", currentPage = 1, isAppend = false) => {
    if (isAppend) {
      setLoadingMore(true);
    } else {
      setMarketLoading(true);
    }

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (category !== "all") params.set("category", category);
      params.set("page", String(currentPage));
      params.set("pageSize", "24");

      const res = await fetch(`/poweri/api/plugins/packages?${params.toString()}`);
      const data = (await res.json()) as PackageQueryResult & { error?: string };
      if (res.ok && Array.isArray(data.packages)) {
        setMarketPackages(data.packages);
        setHasMore(Boolean(data.hasMore));
      }
    } catch {
      // 保持当前快照
    } finally {
      setMarketLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadInstalledPlugins();
  }, [loadInstalledPlugins]);

  useEffect(() => {
    if (activeTab === "discover") {
      void loadMarketPackages(debouncedQuery, selectedCategory, page, page > 1);
    }
  }, [activeTab, debouncedQuery, selectedCategory, page, loadMarketPackages]);

  // 3. 执行插件运维动作 (enable / disable / update / remove)
  const runPackageAction = useCallback(async (
    action: PluginAction,
    source: string,
    scope: PluginPackageInfo["scope"]
  ) => {
    const key = `${action}:${scope}:${source}`;
    setBusyKeys((prev) => ({ ...prev, [key]: action }));
    setActionError(null);
    setActionMessage(null);

    try {
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, source, scope, cwd: cwd || undefined }),
      });
      const data = (await res.json()) as PluginsResponse & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPluginsData(data);
      setActionMessage(
        action === "remove"
          ? "Package removed"
          : action === "update"
          ? "Package updated"
          : action === "enable"
          ? "Package enabled"
          : action === "disable"
          ? "Package disabled"
          : "Package installed"
      );
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [cwd]);

  // 4. 从市场或输入安装 package
  const handleInstallFromMarket = useCallback(async (
    pkgName: string,
    scope: "global" | "project" = "global"
  ) => {
    const source = normalizePluginSourceInput(pkgName).trim();
    if (!source) return;
    const finalSource = source.startsWith("npm:") || source.startsWith("git:") || source.startsWith("http") ? source : `npm:${source}`;
    await runPackageAction("install", finalSource, scope);
  }, [runPackageAction]);

  // 5. 会话热重载
  const handleReloadSession = useCallback(async () => {
    if (!sessionId) return;
    setReloading(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await sendAgentCommand(sessionId, { type: "reload" });
      onReloaded?.();
      setActionMessage("Session reloaded successfully");
      setTimeout(() => setActionMessage(null), 2500);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setReloading(false);
    }
  }, [sessionId, onReloaded]);

  const installedPackages = pluginsData?.packages ?? [];

  // 判断某个市场 package 是否已安装
  const isMarketPkgInstalled = useCallback((pkgName: string) => {
    const cleanName = pkgName.toLowerCase().replace(/^npm:/, "");
    return installedPackages.some((p) => {
      const cleanSource = p.source.toLowerCase().replace(/^npm:/, "");
      return cleanSource === cleanName || cleanSource.endsWith(`/${cleanName}`);
    });
  }, [installedPackages]);

  // 获取已安装包的功能描述
  const getPackageDescription = useCallback((pkg: PluginPackageInfo) => {
    const cleanSource = pkg.source.toLowerCase().replace(/^npm:/, "").replace(/^git:/, "").trim();
    const match = marketPackages.find((m) => m.name.toLowerCase() === cleanSource) ||
      SNAPSHOT_OFFICIAL_PACKAGES.find((m) => m.name.toLowerCase() === cleanSource);
    
    if (match?.description) {
      return match.description;
    }

    const parts = [];
    if (pkg.counts.extensions) parts.push(`${pkg.counts.extensions} extension(s)`);
    if (pkg.counts.skills) parts.push(`${pkg.counts.skills} skill(s)`);
    if (pkg.counts.prompts) parts.push(`${pkg.counts.prompts} prompt(s)`);
    if (pkg.counts.themes) parts.push(`${pkg.counts.themes} theme(s)`);

    return parts.length > 0 ? parts.join(" · ") : "Pi coding agent package extension.";
  }, [marketPackages]);

  // 过滤已安装列表
  const filteredInstalled = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return installedPackages;
    return installedPackages.filter((p) => {
      const desc = getPackageDescription(p).toLowerCase();
      return (
        p.source.toLowerCase().includes(q) ||
        desc.includes(q) ||
        p.resources.some((r) => r.name.toLowerCase().includes(q))
      );
    });
  }, [installedPackages, debouncedQuery, getPackageDescription]);

  // 分类标签列表（纯正 i18n）
  const categoryFilters = [
    { id: "all", label: t("plugins.categoryAll") },
    { id: "extension", label: t("plugins.categoryExtension") },
    { id: "skill", label: t("plugins.categorySkill") },
    { id: "prompt", label: t("plugins.categoryPrompt") },
    { id: "theme", label: t("plugins.categoryTheme") },
    { id: "package", label: t("plugins.categoryPackage") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)", color: "var(--text)", position: "relative" }}>
      {/* 顶部工具栏: 双 Tab 胶囊 + 搜索框 + 重载按钮 */}
      <div
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {/* 双 Tab 胶囊选择器: Installed / Discover */}
        <div
          style={{
            display: "flex",
            background: "var(--bg)",
            padding: 3,
            borderRadius: 7,
            border: "1px solid var(--border)",
          }}
        >
          <button
            onClick={() => setActiveTab("installed")}
            style={{
              padding: "5px 14px",
              fontSize: 12,
              fontWeight: activeTab === "installed" ? 600 : 400,
              background: activeTab === "installed" ? "var(--bg-panel)" : "transparent",
              color: activeTab === "installed" ? "var(--accent)" : "var(--text-dim)",
              border: "none",
              borderRadius: 5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.12s",
            }}
          >
            <span>{t("plugins.installedTab")}</span>
            <span style={{ fontSize: 10, background: "var(--bg-hover)", padding: "1px 5px", borderRadius: 8 }}>
              {installedPackages.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("discover")}
            style={{
              padding: "5px 14px",
              fontSize: 12,
              fontWeight: activeTab === "discover" ? 600 : 400,
              background: activeTab === "discover" ? "var(--bg-panel)" : "transparent",
              color: activeTab === "discover" ? "var(--accent)" : "var(--text-dim)",
              border: "none",
              borderRadius: 5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.12s",
            }}
          >
            <span>{t("plugins.discoverTab")}</span>
          </button>
        </div>

        {/* 搜索框 */}
        <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={t("plugins.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 10px 6px 30px",
              fontSize: 12,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 12 }}
            >
              ✕
            </button>
          )}
        </div>

        {/* 重载按钮 */}
        {sessionId && (
          <button
            onClick={handleReloadSession}
            disabled={reloading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 500,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              cursor: "pointer",
            }}
            title="Reload session to apply plugin changes"
          >
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
            <span>{reloading ? t("plugins.reloading") : t("plugins.reloadSession")}</span>
          </button>
        )}
      </div>

      {/* 提示条 */}
      {actionMessage && (
        <div style={{ padding: "6px 18px", background: "rgba(16, 185, 129, 0.15)", borderBottom: "1px solid rgba(16, 185, 129, 0.3)", color: "#10b981", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>✓</span> {actionMessage}
        </div>
      )}
      {actionError && (
        <div style={{ padding: "6px 18px", background: "rgba(239, 68, 68, 0.15)", borderBottom: "1px solid rgba(239, 68, 68, 0.3)", color: "#f87171", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>✕</span> {actionError}
        </div>
      )}

      {/* 主视口内容 */}
      <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
        
        {/* ========================================================================= */}
        {/* TAB 1: 已安装 (Installed Packages)                                        */}
        {/* ========================================================================= */}
        {activeTab === "installed" && (
          <div>
            {loading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
                Loading packages...
              </div>
            ) : filteredInstalled.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 8, color: "var(--text-dim)" }}>
                <div style={{ fontSize: 13, marginBottom: 8 }}>{t("plugins.noInstalled")}</div>
                <button
                  onClick={() => setActiveTab("discover")}
                  style={{ padding: "6px 14px", fontSize: 12, background: "var(--accent)", color: "var(--bg)", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}
                >
                  去发现扩展市场 →
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                {filteredInstalled.map((pkg) => {
                  const key = packageKey(pkg);
                  const isExpanded = expandedPkgKey === key;
                  const description = getPackageDescription(pkg);
                  const webUrl = getPiDevWebUrl(pkg.source);

                  // 检查是否有新版本可用
                  const cleanSource = pkg.source.toLowerCase().replace(/^npm:/, "");
                  const marketMatch = marketPackages.find((m) => m.name.toLowerCase() === cleanSource);
                  const hasUpdate = Boolean(
                    (marketMatch?.version && marketMatch.version !== "latest" && pkg.version && marketMatch.version !== pkg.version) ||
                    (pkg.configuredVersion && pkg.version && pkg.configuredVersion !== pkg.version)
                  );

                  const isBusyEnable = busyKeys[`enable:${pkg.scope}:${pkg.source}`];
                  const isBusyDisable = busyKeys[`disable:${pkg.scope}:${pkg.source}`];
                  const isBusyUpdate = busyKeys[`update:${pkg.scope}:${pkg.source}`];
                  const isBusyRemove = busyKeys[`remove:${pkg.scope}:${pkg.source}`];
                  const isBusy = isBusyEnable || isBusyDisable || isBusyUpdate || isBusyRemove;

                  return (
                    <div
                      key={key}
                      style={{
                        padding: 14,
                        background: pkg.disabled ? "var(--bg)" : "var(--bg-panel)",
                        border: "1px solid var(--border)",
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
                        {/* Title & Scope Badge + 直达 pi.dev 链接 */}
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                          <a
                            href={webUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--text)",
                              wordBreak: "break-all",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                            title={t("plugins.viewOnWeb")}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                          >
                            <span>{pkg.source}</span>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                          <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "var(--bg)", color: "var(--accent)", border: "1px solid var(--border)", flexShrink: 0 }}>
                            {pkg.scope === "global" ? t("plugins.scopeGlobal") : t("plugins.scopeProject")}
                          </span>
                        </div>

                        {/* Package Functional Description */}
                        <p style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.45, margin: "4px 0 8px 0" }}>
                          {description}
                        </p>

                        {/* Status & Resources Drawer */}
                        <div style={{ fontSize: 10, color: "var(--text-dim)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                          <span style={{ color: pkg.disabled ? "#ef4444" : "#10b981", display: "flex", alignItems: "center", gap: 4 }}>
                            <span>●</span>
                            <span>{pkg.disabled ? t("plugins.disabled") : t("plugins.enabled")}</span>
                          </span>

                          {pkg.resources.length > 0 && (
                            <button
                              onClick={() => setExpandedPkgKey(isExpanded ? null : key)}
                              style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 10, cursor: "pointer", padding: 0 }}
                            >
                              {isExpanded
                                ? t("plugins.collapseResources")
                                : t("plugins.resourcesCount", { count: pkg.resources.length })}
                            </button>
                          )}
                        </div>

                        {/* Expandable Resource Drawer */}
                        {isExpanded && pkg.resources.length > 0 && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {pkg.resources.map((res, i) => (
                              <span
                                key={i}
                                style={{
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "var(--bg)",
                                  border: "1px solid var(--border)",
                                  fontSize: 10,
                                  color: "var(--text)",
                                }}
                              >
                                <strong style={{ color: "var(--accent)" }}>{res.kind}</strong>: {res.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            {pkg.version ? `v${pkg.version}` : "v--"}
                          </span>
                          {hasUpdate && (
                            <span style={{ fontSize: 9, background: "#f59e0b", color: "#000", padding: "1px 4px", borderRadius: 3, fontWeight: 600 }}>
                              {t("plugins.newVersionBadge")}
                            </span>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          {/* Toggle Switch */}
                          <button
                            onClick={() => runPackageAction(pkg.disabled ? "enable" : "disable", pkg.source, pkg.scope)}
                            disabled={Boolean(isBusy)}
                            style={{
                              padding: "3px 8px",
                              fontSize: 11,
                              fontWeight: 500,
                              background: pkg.disabled ? "var(--bg-hover)" : "rgba(16, 185, 129, 0.15)",
                              border: `1px solid ${pkg.disabled ? "var(--border)" : "#10b981"}`,
                              color: pkg.disabled ? "var(--text-dim)" : "#10b981",
                              borderRadius: 4,
                              cursor: "pointer",
                            }}
                          >
                            {isBusyEnable || isBusyDisable ? "..." : pkg.disabled ? t("plugins.enable") : t("plugins.enabled")}
                          </button>

                          {/* Update Button */}
                          <button
                            onClick={() => hasUpdate && runPackageAction("update", pkg.source, pkg.scope)}
                            disabled={!hasUpdate || Boolean(isBusy)}
                            style={{
                              padding: "3px 8px",
                              fontSize: 11,
                              background: hasUpdate ? "#f59e0b" : "var(--bg)",
                              border: "1px solid var(--border)",
                              color: hasUpdate ? "#000" : "var(--text-dim)",
                              borderRadius: 4,
                              cursor: hasUpdate ? "pointer" : "not-allowed",
                              opacity: hasUpdate ? 1 : 0.45,
                              fontWeight: hasUpdate ? 600 : 400,
                            }}
                            title={hasUpdate ? "Update to latest version" : "Already latest version"}
                          >
                            {isBusyUpdate ? "..." : hasUpdate ? t("plugins.update") : t("plugins.isLatest")}
                          </button>

                          {/* Remove Button */}
                          <button
                            onClick={() => setConfirmDeletePkg(pkg)}
                            disabled={Boolean(isBusy)}
                            style={{
                              padding: "3px 8px",
                              fontSize: 11,
                              background: "none",
                              border: "1px solid var(--border)",
                              color: "#f87171",
                              borderRadius: 4,
                              cursor: "pointer",
                            }}
                            title="Uninstall package"
                          >
                            {isBusyRemove ? "..." : t("plugins.remove")}
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
            {/* Category Filter Pills (纯正 i18n) */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {categoryFilters.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryChange(cat.id)}
                  style={{
                    padding: "4px 12px",
                    fontSize: 11,
                    background: selectedCategory === cat.id ? "var(--accent)" : "var(--bg-panel)",
                    color: selectedCategory === cat.id ? "var(--bg)" : "var(--text-dim)",
                    border: "1px solid var(--border)",
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

            {/* Market Package Cards Grid */}
            {marketLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
                Loading packages...
              </div>
            ) : marketPackages.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 8, color: "var(--text-dim)", fontSize: 13 }}>
                {t("plugins.noDiscover")}
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                  {marketPackages.map((pkg) => {
                    const installed = isMarketPkgInstalled(pkg.name);
                    const isBusyGlobal = busyKeys[`install:global:${pkg.installCommand || `npm:${pkg.name}`}`];
                    const isBusyProject = busyKeys[`install:project:${pkg.installCommand || `npm:${pkg.name}`}`];
                    const isBusy = isBusyGlobal || isBusyProject;
                    const webUrl = pkg.webUrl || getPiDevWebUrl(pkg.name);

                    return (
                      <div
                        key={pkg.name}
                        style={{
                          padding: 14,
                          background: "var(--bg-panel)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div>
                          {/* Title & Category Badge + 直达 pi.dev 链接 */}
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                            <a
                              href={webUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "var(--text)",
                                wordBreak: "break-all",
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                              title={t("plugins.viewOnWeb")}
                              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                            >
                              <span>{pkg.name}</span>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </a>
                            <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "var(--bg)", color: "var(--accent)", border: "1px solid var(--border)", flexShrink: 0 }}>
                              {pkg.category}
                            </span>
                          </div>

                          <p style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.4, margin: "4px 0 8px 0" }}>
                            {pkg.description}
                          </p>

                          <div style={{ fontSize: 10, color: "var(--text-dim)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                            {pkg.downloads && <span>📥 {pkg.downloads}</span>}
                            {pkg.author && <span>👤 {pkg.author}</span>}
                            {pkg.updated && <span>🕒 {pkg.updated}</span>}
                          </div>
                        </div>

                        {/* Footer Actions */}
                        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>v{pkg.version}</span>
                          {installed ? (
                            <span style={{ fontSize: 11, color: "#10b981", fontWeight: 500 }}>
                              ✓ {t("plugins.installed")}
                            </span>
                          ) : (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => handleInstallFromMarket(pkg.installCommand || pkg.name, "global")}
                                disabled={Boolean(isBusy)}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 11,
                                  fontWeight: 500,
                                  background: "var(--accent)",
                                  color: "var(--bg)",
                                  border: "none",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                }}
                              >
                                {isBusyGlobal ? t("plugins.installing") : t("plugins.installGlobal")}
                              </button>
                              {cwd && (
                                <button
                                onClick={() => handleInstallFromMarket(pkg.installCommand || pkg.name, "project")}
                                disabled={Boolean(isBusy)}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 11,
                                  background: "var(--bg)",
                                  color: "var(--text)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                }}
                              >
                                {isBusyProject ? t("plugins.installing") : t("plugins.installProject")}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 底部加载更多 / 状态栏 */}
              <div style={{ marginTop: 20, textAlign: "center", paddingBottom: 10 }}>
                {hasMore ? (
                  <button
                    onClick={() => setPage((prev) => prev + 1)}
                    disabled={loadingMore}
                    style={{
                      padding: "8px 24px",
                      fontSize: 12,
                      fontWeight: 500,
                      background: "var(--bg-panel)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      color: "var(--text)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                  >
                    {loadingMore ? t("plugins.loadingMore") : t("plugins.loadMore")}
                  </button>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    {t("plugins.allLoaded")} ({marketPackages.length})
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>

    {/* 卸载二次确认模态弹窗 */}
    {confirmDeletePkg && (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1200,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setConfirmDeletePkg(null);
        }}
      >
        <div
          style={{
            width: 400,
            maxWidth: "100%",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 20,
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20, color: "#f87171" }}>⚠️</span>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
              {t("plugins.confirmUninstallTitle")}
            </div>
          </div>

          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
            {t("plugins.confirmUninstallDesc", { source: confirmDeletePkg.source })}
          </p>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button
              onClick={() => setConfirmDeletePkg(null)}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              {t("plugins.cancel")}
            </button>
            <button
              onClick={() => {
                const target = confirmDeletePkg;
                setConfirmDeletePkg(null);
                runPackageAction("remove", target.source, target.scope);
              }}
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
              {t("plugins.confirmUninstallBtn")}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
);
}
