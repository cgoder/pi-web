// PowerI 技能市场 — 变体 A (顶部仓库源胶囊栏 + 统一卡片流 + 全局能力开关)
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useI18n } from "@/hooks/useI18n";
import { ConfigSwitch } from "@/components/SettingsUi";
import type { MarketSkillItem, SkillSubscription } from "@/poweri/lib/skill-subscriptions";
import { tp, type Locale } from "@/poweri/lib/i18n";

interface Props {
  cwd: string | null;
  onClose?: () => void;
}

interface SubscriptionModalProps {
  isOpen: boolean;
  isEdit: boolean;
  initialUrl?: string;
  initialName?: string;
  initialToken?: string;
  isDefault?: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (form: { url: string; name: string; token: string }) => Promise<void>;
  onDelete?: () => Promise<void>;
  locale: Locale;
}

function getSkillIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("cost") || lower.includes("aliyun") || lower.includes("bill") || lower.includes("账单")) return "💰";
  if (lower.includes("git") || lower.includes("repo") || lower.includes("code") || lower.includes("pr")) return "📦";
  if (lower.includes("deploy") || lower.includes("k8s") || lower.includes("litta") || lower.includes("发布")) return "🚀";
  if (lower.includes("review") || lower.includes("audit") || lower.includes("审查")) return "🔍";
  if (lower.includes("doc") || lower.includes("write") || lower.includes("writing")) return "📝";
  if (lower.includes("database") || lower.includes("sql") || lower.includes("db")) return "🗄️";
  if (lower.includes("browser") || lower.includes("web") || lower.includes("crawl")) return "🌐";
  if (lower.includes("test") || lower.includes("tdd")) return "🧪";
  return "⚡";
}

/**
 * 统一的仓库源配置模态弹窗组件（新增 / 编辑）
 */
function SubscriptionFormModal({
  isOpen,
  isEdit,
  initialUrl = "",
  initialName = "",
  initialToken = "",
  isDefault = false,
  saving,
  onClose,
  onSave,
  onDelete,
  locale,
}: SubscriptionModalProps) {
  const [url, setUrl] = useState(initialUrl);
  const [name, setName] = useState(initialName);
  const [token, setToken] = useState(initialToken);

  useEffect(() => {
    setUrl(initialUrl);
    setName(initialName);
    setToken(initialToken);
  }, [initialUrl, initialName, initialToken, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || saving) return;
    void onSave({ url: url.trim(), name: name.trim(), token: token.trim() });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 460,
          maxWidth: "calc(100vw - 32px)",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 20,
          boxShadow: "0 12px 36px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: 0 }}>
            {tp(locale, isEdit ? "skills.editSourceTitle" : "skills.addSourceTitle")}
          </h3>
          {isEdit && !isDefault && onDelete && (
            <button
              type="button"
              onClick={() => void onDelete()}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                color: "#f87171",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              {tp(locale, "skills.deleteSource")}
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
              {tp(locale, "skills.sourceUrlLabel")}
            </label>
            <input
              type="text"
              placeholder="https://gitlab.litta.cn/.../skills.git"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px",
                fontSize: 13,
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text)",
                boxSizing: "border-box",
              }}
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px",
                fontSize: 13,
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text)",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
              {tp(locale, "skills.sourceTokenLabel")} ({tp(locale, "skills.optional")})
            </label>
            <input
              type="password"
              placeholder="glpat-..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px",
                fontSize: 13,
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text)",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              {tp(locale, "skills.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving || !url.trim()}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 500,
                background: "var(--accent)",
                border: "none",
                borderRadius: 6,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {saving ? tp(locale, "skills.saving") : tp(locale, "skills.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
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
  const [modalState, setModalState] = useState<{
    open: boolean;
    isEdit: boolean;
    sub?: SkillSubscription | null;
  }>({
    open: false,
    isEdit: false,
    sub: null,
  });

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
    setModalState({ open: true, isEdit: false, sub: null });
  };

  // 打开编辑模态框
  const handleOpenEdit = (sub: SkillSubscription, e: React.MouseEvent) => {
    e.stopPropagation();
    setModalState({ open: true, isEdit: true, sub });
  };

  // 保存源配置（统一处理新增与更新）
  const handleSaveSub = async (form: { url: string; name: string; token: string }) => {
    setSavingSub(true);
    try {
      const payload = modalState.isEdit && modalState.sub
        ? {
            action: "update",
            id: modalState.sub.id,
            url: form.url,
            name: form.name || undefined,
            token: form.token || undefined,
          }
        : {
            action: "add",
            url: form.url,
            name: form.name || undefined,
            token: form.token || undefined,
            category: "business",
          };

      const res = await fetch("/poweri/api/skills/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Failed to save source");

      setModalState({ open: false, isEdit: false, sub: null });
      await fetchSkills();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSub(false);
    }
  };

  // 删除源
  const handleDeleteSub = async () => {
    if (!modalState.sub) return;
    const confirmText = tp(locale, "skills.deleteSourceConfirm");
    if (!confirm(confirmText)) return;

    const id = modalState.sub.id;
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
      setModalState({ open: false, isEdit: false, sub: null });
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
                  padding: "4px 10px 4px 12px",
                  fontSize: 12,
                  borderRadius: 20,
                  border: "1px solid",
                  borderColor: isSelected ? "var(--accent)" : "var(--border)",
                  background: isSelected ? "var(--bg-selected)" : "var(--bg-panel)",
                  color: isSelected ? "var(--text)" : "var(--text-muted)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  transition: "all 0.12s",
                }}
              >
                <span style={{ fontWeight: isSelected ? 600 : 400 }}>{sub.name || sub.url}</span>
                <span style={{ fontSize: 10, opacity: 0.75, background: "var(--bg)", padding: "1px 5px", borderRadius: 10 }}>
                  {count}
                </span>

                {/* 编辑/设置源小齿轮 */}
                <button
                  type="button"
                  onClick={(e) => handleOpenEdit(sub, e)}
                  title={tp(locale, "skills.editSourceTitle")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "none",
                    border: "none",
                    padding: 2,
                    marginLeft: 2,
                    color: "inherit",
                    cursor: "pointer",
                    opacity: 0.7,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        {/* 搜索框 */}
        <div style={{ position: "relative" }}>
          <svg
            width="14"
            height="14"
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
            placeholder={tp(locale, "skills.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "7px 10px 7px 32px",
              fontSize: 12,
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* 技能卡片瀑布网格 */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
            {tp(locale, "skills.loading")}
          </div>
        ) : error ? (
          <div style={{ padding: 20, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
            {error}
          </div>
        ) : filteredSkills.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 8, color: "var(--text-dim)", fontSize: 13 }}>
            {tp(locale, "skills.noSkills")}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {filteredSkills.map((skill) => {
              const isToggling = togglingMap[skill.id] || false;
              const icon = getSkillIcon(skill.name);
              return (
                <div
                  key={skill.id}
                  style={{
                    padding: 16,
                    background: "var(--bg-panel)",
                    border: "1px solid",
                    borderColor: skill.enabled ? "var(--border)" : "var(--border)",
                    borderRadius: 8,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 12,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <div>
                    {/* 卡片头部：图标 + 标题 + 来源胶囊 + 开关 */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {skill.name}
                          </h3>
                          {skill.sourceLabel && (
                            <span style={{ fontSize: 10, color: "var(--accent)", background: "var(--bg-selected)", padding: "1px 6px", borderRadius: 4, display: "inline-block", marginTop: 2 }}>
                              {skill.sourceLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 全局启用开关 */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: skill.enabled ? "var(--accent)" : "var(--text-dim)", fontWeight: 500 }}>
                          {skill.enabled ? tp(locale, "skills.statusEnabled") : tp(locale, "skills.statusDisabled")}
                        </span>
                        <ConfigSwitch
                          label={skill.name}
                          checked={skill.enabled}
                          onChange={(checked) => void handleToggle(skill, checked)}
                          disabled={isToggling}
                        />
                      </div>
                    </div>

                    {/* 技能描述 */}
                    <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45, margin: "10px 0 0", minHeight: 36 }}>
                      {skill.description}
                    </p>
                  </div>

                  {/* 底部信息：版本号 + 标签 */}
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono, monospace)" }}>
                      v{skill.version}
                    </span>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {skill.tags?.slice(0, 2).map((t, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "var(--bg)",
                            color: "var(--text-dim)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 统一的仓库源配置模态框 */}
      <SubscriptionFormModal
        isOpen={modalState.open}
        isEdit={modalState.isEdit}
        initialUrl={modalState.sub?.url ?? ""}
        initialName={modalState.sub?.name ?? ""}
        initialToken={modalState.sub?.token ?? ""}
        isDefault={modalState.sub?.isDefault ?? false}
        saving={savingSub}
        locale={locale}
        onClose={() => setModalState({ open: false, isEdit: false, sub: null })}
        onSave={handleSaveSub}
        onDelete={handleDeleteSub}
      />
    </div>
  );
}
