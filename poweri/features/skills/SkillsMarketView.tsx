"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useI18n } from "@/hooks/useI18n";
import { ConfigSwitch } from "@/components/SettingsUi";
import type { MarketSkillItem, SkillCategory, SkillSubscription } from "@/poweri/lib/skill-subscriptions";
import { tp } from "@/poweri/lib/i18n";

interface Props {
  cwd: string | null;
  onClose?: () => void;
}

function getSkillIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("cost") || lower.includes("aliyun") || lower.includes("bill") || lower.includes("账单")) return "💰";
  if (lower.includes("git") || lower.includes("repo") || lower.includes("code")) return "🐙";
  if (lower.includes("deploy") || lower.includes("k8s") || lower.includes("litta") || lower.includes("发布")) return "🚀";
  if (lower.includes("review") || lower.includes("audit") || lower.includes("审查")) return "🔍";
  if (lower.includes("doc") || lower.includes("write") || lower.includes("writing")) return "📝";
  if (lower.includes("database") || lower.includes("sql") || lower.includes("db")) return "🗄️";
  if (lower.includes("browser") || lower.includes("web") || lower.includes("crawl")) return "🌐";
  if (lower.includes("test") || lower.includes("tdd")) return "🧪";
  return "⚡";
}

export function SkillsMarketView({ cwd }: Props) {
  const { locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<MarketSkillItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<SkillSubscription[]>([]);
  const [activeCategory, setActiveCategory] = useState<SkillCategory | "all">("business");
  const [search, setSearch] = useState("");

  // 添加订阅源表单状态
  const [newSubUrl, setNewSubUrl] = useState("");
  const [newSubName, setNewSubName] = useState("");
  const [newSubToken, setNewSubToken] = useState("");
  const [newSubCategory, setNewSubCategory] = useState<SkillCategory>("business");
  const [addingSub, setAddingSub] = useState(false);
  const [subManageOpen, setSubManageOpen] = useState(false);

  const [togglingMap, setTogglingMap] = useState<Record<string, boolean>>({});
  const [selectedSkill, setSelectedSkill] = useState<MarketSkillItem | null>(null);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/poweri/api/skills/market?cwd=${encodeURIComponent(cwd || "")}&category=all`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        skills?: MarketSkillItem[];
        subscriptions?: SkillSubscription[];
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSkills(data.skills || []);
      setSubscriptions(data.subscriptions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    void fetchSkills();
  }, [fetchSkills]);

  const handleAddSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubUrl.trim() || addingSub) return;
    setAddingSub(true);
    try {
      const res = await fetch("/poweri/api/skills/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          url: newSubUrl.trim(),
          name: newSubName.trim() || undefined,
          token: newSubToken.trim() || undefined,
          category: newSubCategory,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Failed to add subscription");
      setNewSubUrl("");
      setNewSubName("");
      setNewSubToken("");
      await fetchSkills();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingSub(false);
    }
  };

  const handleRemoveSubscription = async (id: string) => {
    if (!confirm("Are you sure you want to remove this source? / 确定移除该订阅源吗？")) return;
    try {
      const res = await fetch("/poweri/api/skills/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Failed to remove source");
      await fetchSkills();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggle = async (skill: MarketSkillItem, nextEnabled: boolean) => {
    setTogglingMap((prev) => ({ ...prev, [skill.id]: true }));
    try {
      const res = await fetch("/poweri/api/skills/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId: skill.id,
          enabled: nextEnabled,
          cwd: cwd || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Failed to toggle skill");

      setSkills((prev) =>
        prev.map((s) =>
          s.id === skill.id
            ? { ...s, enabled: nextEnabled, installed: true }
            : s,
        ),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setTogglingMap((prev) => ({ ...prev, [skill.id]: false }));
    }
  };

  const businessCount = useMemo(() => skills.filter((s) => s.category === "business").length, [skills]);
  const publicCount = useMemo(() => skills.filter((s) => s.category === "public").length, [skills]);

  const filteredSkills = useMemo(() => {
    let list = skills;
    if (activeCategory !== "all") {
      list = list.filter((s) => s.category === activeCategory);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags?.some((t) => t.toLowerCase().includes(q)) ||
        s.sourceLabel?.toLowerCase().includes(q),
    );
  }, [skills, activeCategory, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg)" }}>
      {/* 顶部控制栏 */}
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", margin: 0 }}>
              {tp(locale, "skills.title")}
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "4px 0 0" }}>
              {tp(locale, "skills.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSubManageOpen((v) => !v)}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              background: subManageOpen ? "var(--bg-selected)" : "transparent",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {subManageOpen
              ? tp(locale, "skills.collapseSubscriptions")
              : tp(locale, "skills.manageSubscriptions", { count: subscriptions.length })}
          </button>
        </div>

        {/* 订阅源管理区域 (展开时显示) */}
        {subManageOpen && (
          <div style={{ padding: 14, background: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 12 }}>
            <form onSubmit={handleAddSubscription} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder={tp(locale, "skills.inputPlaceholder")}
                  value={newSubUrl}
                  onChange={(e) => setNewSubUrl(e.target.value)}
                  style={{
                    flex: "2 1 200px",
                    padding: "6px 10px",
                    fontSize: 12,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                  }}
                />
                <input
                  type="text"
                  placeholder={tp(locale, "skills.namePlaceholder")}
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  style={{
                    flex: "1 1 120px",
                    padding: "6px 10px",
                    fontSize: 12,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                  }}
                />
                <select
                  value={newSubCategory}
                  onChange={(e) => setNewSubCategory(e.target.value as SkillCategory)}
                  style={{
                    padding: "6px 10px",
                    fontSize: 12,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  <option value="business">{tp(locale, "skills.categoryBusiness")}</option>
                  <option value="public">{tp(locale, "skills.categoryPublic")}</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="password"
                  placeholder={tp(locale, "skills.tokenPlaceholder")}
                  value={newSubToken}
                  onChange={(e) => setNewSubToken(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    fontSize: 12,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                  }}
                />
                <button
                  type="submit"
                  disabled={addingSub || !newSubUrl.trim()}
                  style={{
                    padding: "6px 16px",
                    fontSize: 12,
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    cursor: addingSub || !newSubUrl.trim() ? "not-allowed" : "pointer",
                    opacity: addingSub ? 0.6 : 1,
                    fontWeight: 500,
                  }}
                >
                  {addingSub ? tp(locale, "skills.syncing") : tp(locale, "skills.addSource")}
                </button>
              </div>
            </form>

            {subscriptions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 500 }}>
                  {tp(locale, "skills.subscribedSources")}
                </span>
                {subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      background: "var(--bg)",
                      borderRadius: 4,
                      border: "1px solid var(--border)",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 5px",
                          borderRadius: 3,
                          background: sub.category === "business" ? "rgba(168,85,247,0.15)" : "rgba(6,182,212,0.15)",
                          color: sub.category === "business" ? "#a855f7" : "#06b6d4",
                          fontWeight: 600,
                        }}
                      >
                        {sub.category === "business" ? tp(locale, "skills.badgeBusiness") : tp(locale, "skills.badgePublic")}
                      </span>
                      <span style={{ color: "var(--text)", fontWeight: 500 }}>{sub.name || sub.url}</span>
                      {sub.name && <span style={{ color: "var(--text-dim)", fontSize: 11 }}>({sub.url})</span>}
                      {sub.error && <span style={{ color: "#ef4444", fontSize: 11 }}>({sub.error})</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRemoveSubscription(sub.id)}
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 11, flexShrink: 0 }}
                    >
                      {tp(locale, "skills.remove")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 分类过滤 Tab 与 搜索栏 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          {/* 分段按钮 */}
          <div style={{ display: "flex", background: "var(--bg-panel)", padding: 3, borderRadius: 6, border: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => setActiveCategory("business")}
              style={{
                padding: "5px 12px",
                fontSize: 12,
                borderRadius: 4,
                border: "none",
                background: activeCategory === "business" ? "var(--bg-selected)" : "transparent",
                color: activeCategory === "business" ? "var(--text)" : "var(--text-muted)",
                fontWeight: activeCategory === "business" ? 600 : 400,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>🏢 {tp(locale, "skills.tabBusiness")}</span>
              <span style={{ fontSize: 10, background: "rgba(168,85,247,0.2)", color: "#a855f7", padding: "1px 5px", borderRadius: 10 }}>
                {businessCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("public")}
              style={{
                padding: "5px 12px",
                fontSize: 12,
                borderRadius: 4,
                border: "none",
                background: activeCategory === "public" ? "var(--bg-selected)" : "transparent",
                color: activeCategory === "public" ? "var(--text)" : "var(--text-muted)",
                fontWeight: activeCategory === "public" ? 600 : 400,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>🌐 {tp(locale, "skills.tabPublic")}</span>
              <span style={{ fontSize: 10, background: "rgba(6,182,212,0.2)", color: "#06b6d4", padding: "1px 5px", borderRadius: 10 }}>
                {publicCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              style={{
                padding: "5px 12px",
                fontSize: 12,
                borderRadius: 4,
                border: "none",
                background: activeCategory === "all" ? "var(--bg-selected)" : "transparent",
                color: activeCategory === "all" ? "var(--text)" : "var(--text-muted)",
                fontWeight: activeCategory === "all" ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {tp(locale, "skills.tabAll")} ({skills.length})
            </button>
          </div>

          {/* 搜索框 */}
          <input
            type="search"
            placeholder={tp(locale, "skills.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: "1 1 200px",
              maxWidth: 320,
              padding: "6px 12px",
              fontSize: 12,
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
            }}
          />
        </div>
      </div>

      {/* 主体卡片列表 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
            {tp(locale, "skills.loading")}
          </div>
        ) : error ? (
          <div style={{ padding: 24, textAlign: "center", color: "#ef4444", fontSize: 13 }}>
            {tp(locale, "skills.loadFailed", { error })}
          </div>
        ) : filteredSkills.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
            {search ? tp(locale, "skills.noMatch") : tp(locale, "skills.empty")}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 14,
            }}
          >
            {filteredSkills.map((skill) => {
              const icon = getSkillIcon(skill.name);
              const toggling = togglingMap[skill.id] === true;

              return (
                <div
                  key={skill.id}
                  style={{
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 12,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    transition: "border-color 0.12s, box-shadow 0.12s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span style={{ fontSize: 24, flexShrink: 0 }}>{icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {skill.name}
                          </h3>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                          <span
                            style={{
                              fontSize: 10,
                              padding: "1px 5px",
                              borderRadius: 3,
                              background: skill.category === "business" ? "rgba(168,85,247,0.15)" : "rgba(6,182,212,0.15)",
                              color: skill.category === "business" ? "#a855f7" : "#06b6d4",
                              fontWeight: 600,
                            }}
                          >
                            {skill.category === "business" ? tp(locale, "skills.badgeBusiness") : tp(locale, "skills.badgePublic")}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            {skill.sourceLabel || (skill.sourceType === "git" ? tp(locale, "skills.sourceGit") : skill.sourceType === "manifest" ? tp(locale, "skills.sourceManifest") : tp(locale, "skills.sourceLocal"))}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                      <ConfigSwitch
                        checked={skill.enabled}
                        loading={toggling}
                        label={`Toggle ${skill.name}`}
                        onChange={(checked) => void handleToggle(skill, checked)}
                      />
                    </div>
                  </div>

                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      margin: 0,
                      lineHeight: 1.45,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {skill.description || tp(locale, "skills.noDescription")}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: skill.enabled ? "rgba(34,197,94,0.12)" : "var(--bg)",
                        color: skill.enabled ? "#16a34a" : "var(--text-dim)",
                        fontWeight: 500,
                      }}
                    >
                      {skill.enabled ? tp(locale, "skills.enabled") : tp(locale, "skills.disabled")}
                    </span>

                    <button
                      type="button"
                      onClick={() => setSelectedSkill(skill)}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: 11,
                        color: "var(--accent)",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {tp(locale, "skills.viewDocs")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 技能详情弹窗 (查看使用说明) */}
      {selectedSkill && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedSkill(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-panel)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              maxWidth: 520,
              width: "100%",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ fontSize: 15, color: "var(--text)" }}>{selectedSkill.name}</strong>
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: selectedSkill.category === "business" ? "rgba(168,85,247,0.15)" : "rgba(6,182,212,0.15)",
                    color: selectedSkill.category === "business" ? "#a855f7" : "#06b6d4",
                    fontWeight: 600,
                  }}
                >
                  {selectedSkill.category === "business" ? tp(locale, "skills.badgeBusiness") : tp(locale, "skills.badgePublic")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSkill(null)}
                style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 18, cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: 18, overflowY: "auto", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
                  {tp(locale, "skills.modalScenario")}
                </span>
                <div>{selectedSkill.description || tp(locale, "skills.noDescription")}</div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
                  {tp(locale, "skills.modalPath")}
                </span>
                <code style={{ fontSize: 11, background: "var(--bg)", padding: "2px 6px", borderRadius: 4, wordBreak: "break-all" }}>
                  {selectedSkill.localPath || selectedSkill.subscriptionUrl}
                </code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
