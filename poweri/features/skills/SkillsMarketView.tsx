// PowerI 技能市场 — 变体 A (顶部仓库源胶囊栏 + 统一卡片流 + 全局能力开关)
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
  if (lower.includes("cost") || lower.includes("aliyun") || lower.includes("bill") || lower.includes("账单")) return "📦";
  if (lower.includes("git") || lower.includes("repo") || lower.includes("code") || lower.includes("pr")) return "🐙";
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
  const [selectedSourceId, setSelectedSourceId] = useState<string | "all">("all");
  const [search, setSearch] = useState("");

  // 模态框状态
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<SkillSubscription | null>(null);

  // 添加/编辑表单字段
  const [subUrl, setSubUrl] = useState("");
  const [subName, setSubName] = useState("");
  const [subToken, setSubToken] = useState("");
  const [savingSub, setSavingSub] = useState(false);

  const [togglingMap, setTogglingMap] = useState<Record<string, boolean>>({});

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

  // 打开添加模态框
  const handleOpenAdd = () => {
    setSubUrl("");
    setSubName("");
    setSubToken("");
    setAddModalOpen(true);
  };

  // 打开编辑模态框
  const handleOpenEdit = (sub: SkillSubscription, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSub(sub);
    setSubUrl(sub.url);
    setSubName(sub.name || "");
    setSubToken(sub.token || "");
  };

  // 保存新增源
  const handleSaveNewSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subUrl.trim() || savingSub) return;
    setSavingSub(true);
    try {
      const res = await fetch("/poweri/api/skills/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          url: subUrl.trim(),
          name: subName.trim() || undefined,
          token: subToken.trim() || undefined,
          category: "business",
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Failed to add source");
      setAddModalOpen(false);
      await fetchSkills();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSub(false);
    }
  };

  // 保存编辑源
  const handleSaveEditSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub || !subUrl.trim() || savingSub) return;
    setSavingSub(true);
    try {
      const res = await fetch("/poweri/api/skills/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingSub.id,
          url: subUrl.trim(),
          name: subName.trim() || undefined,
          token: subToken.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Failed to update source");
      setEditingSub(null);
      await fetchSkills();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSub(false);
    }
  };

  // 删除源
  const handleDeleteSub = async (id: string) => {
    if (!confirm("Are you sure you want to delete this repository source? / 确定删除该仓库源吗？")) return;
    setSavingSub(true);
    try {
      const res = await fetch("/poweri/api/skills/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Failed to delete source");
      if (selectedSourceId === id) setSelectedSourceId("all");
      setEditingSub(null);
      await fetchSkills();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSub(false);
    }
  };

  // 切换能力开关 (全局生效)
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

  // 过滤后的技能列表
  const filteredSkills = useMemo(() => {
    let list = skills;
    if (selectedSourceId !== "all") {
      list = list.filter((s) => s.subscriptionId === selectedSourceId);
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
  }, [skills, selectedSourceId, search]);

  // 每个源对应的技能数量
  const sourceCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of skills) {
      map[s.subscriptionId] = (map[s.subscriptionId] || 0) + 1;
    }
    return map;
  }, [skills]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg)" }}>
      {/* 顶部标题与控制栏 */}
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
            onClick={handleOpenAdd}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 500,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>{tp(locale, "skills.addSource")}</span>
          </button>
        </div>

        {/* 顶部仓库源胶囊栏 (Capsule Bar) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
          {/* 全部胶囊 */}
          <button
            type="button"
            onClick={() => setSelectedSourceId("all")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 20,
              border: "1px solid",
              borderColor: selectedSourceId === "all" ? "var(--accent)" : "var(--border)",
              background: selectedSourceId === "all" ? "var(--bg-selected)" : "var(--bg-panel)",
              color: selectedSourceId === "all" ? "var(--text)" : "var(--text-muted)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <span>{tp(locale, "skills.allCapsule")}</span>
            <span style={{ fontSize: 11, opacity: 0.75 }}>({skills.length})</span>
          </button>

          {/* 各订阅源胶囊 */}
          {subscriptions.map((sub) => {
            const isSelected = selectedSourceId === sub.id;
            const count = sourceCountMap[sub.id] || 0;
            return (
              <div
                key={sub.id}
                onClick={() => setSelectedSourceId(sub.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px 4px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 20,
                  border: "1px solid",
                  borderColor: isSelected ? "var(--accent)" : "var(--border)",
                  background: isSelected ? "var(--bg-selected)" : "var(--bg-panel)",
                  color: isSelected ? "var(--text)" : "var(--text-muted)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <span>📦 {sub.name || "Repository"}</span>
                <span style={{ fontSize: 11, opacity: 0.75 }}>({count})</span>
                <button
                  type="button"
                  title="Configure source / 配置源"
                  onClick={(e) => handleOpenEdit(sub, e)}
                  style={{
                    padding: "2px 4px",
                    background: "none",
                    border: "none",
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        {/* 搜索框 */}
        <div style={{ position: "relative" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={tp(locale, "skills.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "7px 12px 7px 32px",
              fontSize: 12,
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* 技能卡片列表 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "var(--text-dim)" }}>
            {tp(locale, "skills.loading")}
          </div>
        ) : error ? (
          <div style={{ padding: "30px 20px", textAlign: "center", color: "#f87171", fontSize: 13 }}>
            {error}
          </div>
        ) : filteredSkills.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
            {tp(locale, "skills.empty")}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
            {filteredSkills.map((skill) => {
              const icon = getSkillIcon(skill.name);
              const isToggling = Boolean(togglingMap[skill.id]);

              return (
                <div
                  key={skill.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: 14,
                    background: "var(--bg-panel)",
                    border: "1px solid",
                    borderColor: skill.enabled ? "var(--accent)" : "var(--border)",
                    borderRadius: 8,
                    gap: 10,
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--bg-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                      {icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                          {skill.name}
                        </span>
                        {skill.sourceLabel && (
                          <span style={{ fontSize: 10, color: "var(--text-dim)", background: "var(--bg)", padding: "1px 6px", borderRadius: 4, border: "1px solid var(--border)" }}>
                            {skill.sourceLabel}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {skill.description}
                      </div>
                    </div>
                  </div>

                  {/* 底部：Tags 与 开关 */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 6, borderTop: "1px dashed var(--border)" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
                      {skill.tags?.slice(0, 3).map((t, idx) => (
                        <span key={idx} style={{ fontSize: 10, color: "var(--text-dim)", background: "var(--bg-hover)", padding: "1px 5px", borderRadius: 3 }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: skill.enabled ? "var(--accent)" : "var(--text-dim)", fontWeight: 500 }}>
                        {skill.enabled ? tp(locale, "skills.statusEnabled") : tp(locale, "skills.statusDisabled")}
                      </span>
                      <ConfigSwitch
                        checked={skill.enabled}
                        loading={isToggling}
                        onChange={(next) => void handleToggle(skill, next)}
                        label={skill.name}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 模态框：添加仓库源 */}
      {addModalOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setAddModalOpen(false); }}
        >
          <div style={{ width: 460, maxWidth: "calc(100vw - 32px)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: "0 0 14px" }}>
              {tp(locale, "skills.addSourceTitle")}
            </h3>
            <form onSubmit={handleSaveNewSub} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
                  {tp(locale, "skills.sourceUrlLabel")}
                </label>
                <input
                  type="text"
                  placeholder="https://gitlab.litta.cn/.../skills.git"
                  value={subUrl}
                  onChange={(e) => setSubUrl(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
                  {tp(locale, "skills.sourceAliasLabel")}
                </label>
                <input
                  type="text"
                  placeholder="e.g. LITTA 团队技能库"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
                  {tp(locale, "skills.sourceTokenLabel")} (Optional)
                </label>
                <input
                  type="password"
                  placeholder="glpat-..."
                  value={subToken}
                  onChange={(e) => setSubToken(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  style={{ padding: "6px 14px", fontSize: 12, background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", cursor: "pointer" }}
                >
                  {tp(locale, "skills.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={savingSub || !subUrl.trim()}
                  style={{ padding: "6px 14px", fontSize: 12, fontWeight: 500, background: "var(--accent)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer" }}
                >
                  {savingSub ? tp(locale, "skills.saving") : tp(locale, "skills.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 模态框：编辑仓库源 */}
      {editingSub && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingSub(null); }}
        >
          <div style={{ width: 460, maxWidth: "calc(100vw - 32px)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: 0 }}>
                {tp(locale, "skills.editSourceTitle")}
              </h3>
              {!editingSub.isDefault && (
                <button
                  type="button"
                  onClick={() => void handleDeleteSub(editingSub.id)}
                  style={{ padding: "4px 8px", fontSize: 12, color: "#f87171", background: "none", border: "none", cursor: "pointer" }}
                >
                  {tp(locale, "skills.deleteSource")}
                </button>
              )}
            </div>

            <form onSubmit={handleSaveEditSub} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
                  {tp(locale, "skills.sourceUrlLabel")}
                </label>
                <input
                  type="text"
                  value={subUrl}
                  onChange={(e) => setSubUrl(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 12, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
                  {tp(locale, "skills.sourceAliasLabel")}
                </label>
                <input
                  type="text"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
                  {tp(locale, "skills.sourceTokenLabel")} (Optional)
                </label>
                <input
                  type="password"
                  placeholder="glpat-..."
                  value={subToken}
                  onChange={(e) => setSubToken(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setEditingSub(null)}
                  style={{ padding: "6px 14px", fontSize: 12, background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", cursor: "pointer" }}
                >
                  {tp(locale, "skills.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={savingSub || !subUrl.trim()}
                  style={{ padding: "6px 14px", fontSize: 12, fontWeight: 500, background: "var(--accent)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer" }}
                >
                  {savingSub ? tp(locale, "skills.saving") : tp(locale, "skills.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
