// PowerI Skills 技能中心 (对齐 Plugins 交互逻辑: 双 Tab 模式 Installed vs Discover + Local/多源归类 + 点击卡片 Markdown 详情预览 + 待重载感知)
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useI18n } from "@/hooks/useI18n";
import { sendAgentCommand } from "@/lib/agent-client";
import { ConfigSwitch } from "@/components/SettingsUi";
import type { MarketSkillItem, SkillSubscription } from "@/poweri/lib/skill-subscriptions";
import { tp, type Locale } from "@/poweri/lib/i18n";

interface Props {
  cwd: string | null;
  sessionId?: string | null;
  onClose?: () => void;
  onReloaded?: () => void;
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

interface SkillDetailModalProps {
  skill: MarketSkillItem | null;
  isToggling: boolean;
  locale: Locale;
  onClose: () => void;
  onToggle: (skill: MarketSkillItem, enabled: boolean) => Promise<void>;
}

/**
 * 统一的仓库源配置模态弹窗组件（新增 / 编辑，支持 Esc / Enter）
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

  // 键盘快捷键: Esc 取消
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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
              placeholder="https://github.com/vercel-labs/skills.git 或 GitLab URL"
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
              placeholder="e.g. skills.sh 官方源 / 团队技能源"
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
              placeholder="glpat-... / ghp-..."
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

/**
 * 技能详情与 SKILL.md 预览弹窗组件（支持 Esc 关闭）
 */
function SkillDetailModal({
  skill,
  isToggling,
  locale,
  onClose,
  onToggle,
}: SkillDetailModalProps) {
  useEffect(() => {
    if (!skill) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [skill, onClose]);

  if (!skill) return null;

  const isLocal = skill.subscriptionId === "local" || skill.sourceType === "local";
  const previewText = skill.rawContent || (() => {
    const lines = [
      `# ${skill.name}`,
      "",
      skill.description || "No detailed description.",
      "",
    ];
    if (skill.tags && skill.tags.length > 0) {
      lines.push(`**Tags**: ${skill.tags.map((t) => `\`#${t}\``).join(" ")}`, "");
    }
    if (skill.author) {
      lines.push(`**Author**: ${skill.author}`, "");
    }
    if (skill.subscriptionUrl && skill.subscriptionUrl !== "local") {
      lines.push(`**Source Repository**: ${skill.subscriptionUrl}`, "");
    }
    return lines.join("\n");
  })();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        background: "rgba(0, 0, 0, 0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backdropFilter: "blur(3px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 640,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "85vh",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* 弹窗头部 */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-panel)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: 0 }}>
                {skill.name}
              </h2>
              <span
                style={{
                  fontSize: 11,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: isLocal ? "var(--bg-hover)" : "var(--bg)",
                  color: isLocal ? "var(--text-dim)" : "var(--accent)",
                  border: "1px solid var(--border)",
                }}
              >
                {isLocal ? "Local" : skill.sourceLabel || "Git"}
              </span>
              {skill.version && (
                <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono, monospace)" }}>
                  v{skill.version}
                </span>
              )}
            </div>

            <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "6px 0 0", lineHeight: 1.45 }}>
              {skill.description}
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-dim)",
              fontSize: 16,
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* 弹窗中间：状态与操作栏 + SKILL.md 详情预览区 */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 操作与元数据栏 */}
          <div
            style={{
              padding: "12px 14px",
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "var(--text-dim)" }}>
              {skill.author && <span>👤 {tp(locale, "skills.authorLabel")}: <strong style={{ color: "var(--text)" }}>{skill.author}</strong></span>}
              {skill.installs && <span>📥 {skill.installs}</span>}
              {skill.localPath && (
                <span title={skill.localPath} style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  📁 {skill.localPath.split("/").slice(-2).join("/")}
                </span>
              )}
            </div>

            {/* 开关 / 安装操作 */}
            {skill.installed ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: skill.enabled ? "#10b981" : "var(--text-dim)", fontWeight: 500 }}>
                  ● {skill.enabled ? tp(locale, "skills.statusEnabled") : tp(locale, "skills.statusDisabled")}
                </span>
                <ConfigSwitch
                  label={skill.name}
                  checked={skill.enabled}
                  onChange={(checked) => void onToggle(skill, checked)}
                  disabled={isToggling}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void onToggle(skill, true)}
                disabled={isToggling}
                style={{
                  padding: "5px 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  background: "var(--accent)",
                  color: "var(--bg)",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                {isToggling ? tp(locale, "plugins.installing") : tp(locale, "skills.installSkill")}
              </button>
            )}
          </div>

          {/* SKILL.md 规范与指令预览 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span>📄</span> {tp(locale, "skills.skillPreview")}
            </div>
            <pre
              style={{
                margin: 0,
                padding: 14,
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 11,
                lineHeight: 1.5,
                color: "var(--text)",
                fontFamily: "var(--font-mono, monospace)",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 320,
              }}
            >
              {previewText}
            </pre>
          </div>
        </div>

        {/* 弹窗底部 */}
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-panel)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            {tp(locale, "skills.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SkillsMarketView({ cwd, sessionId, onReloaded }: Props) {
  const { locale } = useI18n();
  const [activeTab, setActiveTab] = useState<"installed" | "discover">("installed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<MarketSkillItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<SkillSubscription[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [reloading, setReloading] = useState(false);

  // 技能详情预览状态
  const [previewingSkill, setPreviewingSkill] = useState<MarketSkillItem | null>(null);

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

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    return tp(locale, key, params);
  }, [locale]);

  // 搜索防抖 (200ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  // 获取技能列表（支持关键字搜索）
  const fetchSkills = useCallback(async (query: string = "") => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("cwd", cwd || "");
      params.set("category", "all");
      if (query.trim()) {
        params.set("q", query.trim());
      }
      const url = `/poweri/api/skills/market?${params.toString()}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        skills?: MarketSkillItem[];
        subscriptions?: SkillSubscription[];
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (Array.isArray(data.skills)) {
        setSkills(data.skills);
      }
      if (Array.isArray(data.subscriptions)) {
        setSubscriptions(data.subscriptions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    void fetchSkills(debouncedSearch);
  }, [debouncedSearch, fetchSkills]);

  // Tab 切换时重置源选择器
  const handleTabChange = (tab: "installed" | "discover") => {
    setActiveTab(tab);
    setSelectedSourceId("all");
  };

  // 会话热重载
  const handleReloadSession = useCallback(async () => {
    if (!sessionId) return;
    setReloading(true);
    setError(null);
    try {
      await sendAgentCommand(sessionId, { type: "reload" });
      onReloaded?.();
      setHasPendingChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReloading(false);
    }
  }, [sessionId, onReloaded]);

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
      await fetchSkills(debouncedSearch);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSub(false);
    }
  };

  // 删除源
  const handleDeleteSub = async () => {
    if (!modalState.sub) return;
    const confirmText = t("skills.deleteSourceConfirm");
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
      await fetchSkills(debouncedSearch);
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

      const updated = skills.map((s) =>
        s.id === skill.id
          ? { ...s, enabled: nextEnabled, installed: true }
          : s,
      );
      setSkills(updated);
      if (previewingSkill && previewingSkill.id === skill.id) {
        setPreviewingSkill({ ...previewingSkill, enabled: nextEnabled, installed: true });
      }
      setHasPendingChanges(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setTogglingMap((prev) => ({ ...prev, [skill.id]: false }));
    }
  };

  // 1. 已安装列表与统计
  const installedSkills = useMemo(() => {
    return skills.filter((s) => s.installed);
  }, [skills]);

  // 本地自定义技能 (未关联订阅源)
  const localSkillsCount = useMemo(() => {
    return installedSkills.filter((s) => s.subscriptionId === "local" || s.sourceType === "local").length;
  }, [installedSkills]);

  // 2. 当前视图的展示列表过滤 (结合本地与市场全文模糊搜索)
  const displayedSkills = useMemo(() => {
    let baseList = activeTab === "installed" ? installedSkills : skills;

    // 前端二次过滤（搜索已由后端 API 处理，这里做本地补充过滤）
    if (activeTab === "discover" && debouncedSearch) {
      const q = debouncedSearch.trim().toLowerCase();
      baseList = skills.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.author?.toLowerCase().includes(q) ||
        s.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // 按源过滤
    if (selectedSourceId === "local") {
      baseList = baseList.filter((s) => s.subscriptionId === "local" || s.sourceType === "local");
    } else if (selectedSourceId !== "all") {
      baseList = baseList.filter((s) => s.subscriptionId === selectedSourceId);
    }

    // 按关键字搜索
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags?.some((tag) => tag.toLowerCase().includes(q)) ||
        s.sourceLabel?.toLowerCase().includes(q) ||
        s.author?.toLowerCase().includes(q),
    );
  }, [activeTab, installedSkills, skills, selectedSourceId, debouncedSearch]);

  // 计算每个源在当前 Tab 下对应的技能数量
  const sourceCountMap = useMemo(() => {
    const list = activeTab === "installed" ? installedSkills : skills;
    const map: Record<string, number> = {};
    for (const s of list) {
      map[s.subscriptionId] = (map[s.subscriptionId] || 0) + 1;
    }
    return map;
  }, [activeTab, installedSkills, skills]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg)", position: "relative" }}>
      {/* 顶部工具栏: 双 Tab 胶囊 + 搜索框 + 重载按钮 + 添加源按钮 */}
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
            onClick={() => handleTabChange("installed")}
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
            <span>{t("skills.installedTab")}</span>
            <span style={{ fontSize: 10, background: "var(--bg-hover)", padding: "1px 5px", borderRadius: 8 }}>
              {installedSkills.length}
            </span>
          </button>

          <button
            onClick={() => handleTabChange("discover")}
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
            <span>{t("skills.discoverTab")}</span>
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
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={t("skills.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 12 }}
            >
              ✕
            </button>
          )}
        </div>

        {/* 右侧动作按钮区：添加源 + 重载 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {activeTab === "discover" && (
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
              <span>{t("skills.addSource")}</span>
            </button>
          )}

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
                fontWeight: hasPendingChanges ? 600 : 500,
                background: hasPendingChanges ? "rgba(245, 158, 11, 0.15)" : "var(--bg)",
                border: `1px solid ${hasPendingChanges ? "#f59e0b" : "var(--border)"}`,
                borderRadius: 6,
                color: hasPendingChanges ? "#f59e0b" : "var(--text)",
                cursor: "pointer",
                position: "relative",
                transition: "all 0.2s",
              }}
              title={hasPendingChanges ? t("skills.pendingReloadNotice") : t("skills.reloadSession")}
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
              <span>{reloading ? t("skills.reloading") : hasPendingChanges ? t("skills.reloadToApply") : t("skills.reloadSession")}</span>
            </button>
          )}
        </div>
      </div>

      {/* 待重载黄色提示条 */}
      {hasPendingChanges && (
        <div style={{ padding: "6px 18px", background: "rgba(245, 158, 11, 0.12)", borderBottom: "1px solid rgba(245, 158, 11, 0.25)", color: "#f59e0b", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>⚠️ {t("skills.pendingReloadNotice")}</span>
          <button onClick={handleReloadSession} style={{ background: "none", border: "none", color: "#f59e0b", textDecoration: "underline", fontSize: 11, cursor: "pointer" }}>
            {t("plugins.reloadNow")}
          </button>
        </div>
      )}

      {/* 顶部源胶囊分类栏 (Capsule Bar) */}
      <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg)", display: "flex", alignItems: "center", gap: 8, overflowX: "auto" }}>
        {/* 全部胶囊 */}
        <button
          type="button"
          onClick={() => setSelectedSourceId("all")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            fontSize: 11,
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
          <span>{t("skills.allCapsule")}</span>
          <span style={{ fontSize: 10, opacity: 0.75 }}>
            ({activeTab === "installed" ? installedSkills.length : skills.length})
          </span>
        </button>

        {/* Local 本地源胶囊 (仅在包含本地技能或在已安装视图下呈现) */}
        {(activeTab === "installed" || localSkillsCount > 0) && (
          <button
            type="button"
            onClick={() => setSelectedSourceId("local")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 20,
              border: "1px solid",
              borderColor: selectedSourceId === "local" ? "var(--accent)" : "var(--border)",
              background: selectedSourceId === "local" ? "var(--bg-selected)" : "var(--bg-panel)",
              color: selectedSourceId === "local" ? "var(--text)" : "var(--text-muted)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <span>🏠 {t("skills.localCategory")}</span>
            <span style={{ fontSize: 10, opacity: 0.75 }}>({localSkillsCount})</span>
          </button>
        )}

        {/* 各订阅源胶囊 (LITTA, skills.sh, Pi, 自定义 Git 源) */}
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
                padding: "3px 10px 3px 12px",
                fontSize: 11,
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

              {/* 仅在 Discover 发现视图下允许编辑/删除自定义源 */}
              {activeTab === "discover" && (
                <button
                  type="button"
                  onClick={(e) => handleOpenEdit(sub, e)}
                  title={t("skills.editSourceTitle")}
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
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 技能卡片视口 */}
      <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
        {loading && skills.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
            {t("skills.loading")}
          </div>
        ) : error ? (
          <div style={{ padding: 20, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
            {error}
          </div>
        ) : displayedSkills.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 8, color: "var(--text-dim)" }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              {activeTab === "installed"
                ? debouncedSearch
                  ? t("skills.noInstalledSearch", { query: debouncedSearch })
                  : t("skills.noInstalled")
                : t("skills.noDiscover")}
            </div>
            {activeTab === "installed" && (
              <button
                onClick={() => handleTabChange("discover")}
                style={{ padding: "6px 14px", fontSize: 12, background: "var(--accent)", color: "var(--bg)", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}
              >
                {debouncedSearch ? t("skills.searchInMarket", { query: debouncedSearch }) : t("skills.goToDiscover")}
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
            {displayedSkills.map((skill) => {
              const isToggling = togglingMap[skill.id] || false;
              const isLocal = skill.subscriptionId === "local" || skill.sourceType === "local";

              return (
                <div
                  key={skill.id}
                  onClick={() => setPreviewingSkill(skill)}
                  style={{
                    padding: 14,
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 10,
                    cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                  title={t("skills.detailTitle")}
                >
                  <div>
                    {/* 卡片头部：标题 + 来源胶囊 (无 emoji) */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {skill.name}
                      </h3>

                      {/* 来源徽章 */}
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: isLocal ? "var(--bg-hover)" : "var(--bg)",
                          color: isLocal ? "var(--text-dim)" : "var(--accent)",
                          border: "1px solid var(--border)",
                          flexShrink: 0,
                        }}
                      >
                        {isLocal ? "Local" : skill.sourceLabel || "Git"}
                      </span>
                    </div>

                    {/* 技能描述 */}
                    <p style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.45, margin: "6px 0 8px 0", minHeight: 32 }}>
                      {skill.description}
                    </p>

                    {/* 真实作者、热度与标签 */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 10, color: "var(--text-dim)" }}>
                      {skill.author && <span>👤 {skill.author}</span>}
                      {skill.installs && <span>📥 {skill.installs}</span>}
                      {skill.tags?.slice(0, 3).map((tag, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: 9,
                            padding: "1px 5px",
                            borderRadius: 3,
                            background: "var(--bg)",
                            color: "var(--text-dim)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 底部操作行 */}
                  <div
                    style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono, monospace)" }}>
                      {skill.version ? `v${skill.version}` : isLocal ? "local" : "active"}
                    </span>

                    {/* 已安装状态：显示 Toggle 开关；未安装状态：显示一键安装按钮 */}
                    {skill.installed ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color: skill.enabled ? "#10b981" : "var(--text-dim)", fontWeight: 500 }}>
                          ● {skill.enabled ? t("skills.statusEnabled") : t("skills.statusDisabled")}
                        </span>
                        <ConfigSwitch
                          label={skill.name}
                          checked={skill.enabled}
                          onChange={(checked) => void handleToggle(skill, checked)}
                          disabled={isToggling}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggle(skill, true);
                        }}
                        disabled={isToggling}
                        style={{
                          padding: "3px 10px",
                          fontSize: 11,
                          fontWeight: 500,
                          background: "var(--accent)",
                          color: "var(--bg)",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                      >
                        {isToggling ? t("plugins.installing") : t("skills.installSkill")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 技能详情与 SKILL.md 预览弹窗 */}
      <SkillDetailModal
        skill={previewingSkill}
        isToggling={Boolean(previewingSkill && togglingMap[previewingSkill.id])}
        locale={locale}
        onClose={() => setPreviewingSkill(null)}
        onToggle={handleToggle}
      />

      {/* 统一的仓库源配置模态框 (新增/编辑) */}
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
