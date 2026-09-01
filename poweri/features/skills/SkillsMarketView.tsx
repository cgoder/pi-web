"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useI18n } from "@/hooks/useI18n";
import { ConfigSwitch } from "@/components/SettingsUi";
import type { MarketSkillItem, SkillSubscription } from "@/poweri/lib/skill-subscriptions";
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
  const [search, setSearch] = useState("");
  const [newSubUrl, setNewSubUrl] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  const [subManageOpen, setSubManageOpen] = useState(false);
  const [togglingMap, setTogglingMap] = useState<Record<string, boolean>>({});
  const [selectedSkill, setSelectedSkill] = useState<MarketSkillItem | null>(null);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/poweri/api/skills/market?cwd=${encodeURIComponent(cwd || "")}`;
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
        body: JSON.stringify({ action: "add", url: newSubUrl.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Failed to add subscription");
      setNewSubUrl("");
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

  const filteredSkills = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [skills, search]);

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
          <div style={{ padding: 12, background: "var(--bg-panel)", borderRadius: 8, border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
            <form onSubmit={handleAddSubscription} style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder={tp(locale, "skills.inputPlaceholder")}
                value={newSubUrl}
                onChange={(e) => setNewSubUrl(e.target.value)}
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
                  padding: "6px 14px",
                  fontSize: 12,
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: addingSub || !newSubUrl.trim() ? "not-allowed" : "pointer",
                  opacity: addingSub ? 0.6 : 1,
                }}
              >
                {addingSub ? tp(locale, "skills.syncing") : tp(locale, "skills.addSource")}
              </button>
            </form>

            {subscriptions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {tp(locale, "skills.subscribedSources")}
                </span>
                {subscriptions.map((sub) => (
                  <div key={sub.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "var(--bg)", borderRadius: 4, border: "1px solid var(--border)", fontSize: 12 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>
                      <span style={{ color: "var(--text)", fontWeight: 500 }}>{sub.url}</span>
                      {sub.error && <span style={{ color: "#ef4444", marginLeft: 8, fontSize: 11 }}>({sub.error})</span>}
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

        {/* 搜索栏 */}
        <input
          type="search"
          placeholder={tp(locale, "skills.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            fontSize: 13,
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text)",
          }}
        />
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
                        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {skill.name}
                        </h3>
                        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {skill.sourceType === "git"
                            ? tp(locale, "skills.sourceGit")
                            : skill.sourceType === "manifest"
                              ? tp(locale, "skills.sourceManifest")
                              : tp(locale, "skills.sourceLocal")}
                        </span>
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
              <strong style={{ fontSize: 15, color: "var(--text)" }}>{selectedSkill.name}</strong>
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
