// PowerI Models 配置面板 — 严格遵循上游 ModelsConfig 风格，将 LITTA 作为像 DeepSeek 一样的极简 API Key Provider
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { DiscoveredModel } from "@/lib/model-discovery";
import {
  getLastSettingsSelection,
  setLastSettingsSelection,
} from "@/lib/settings-navigation";
import {
  ConfigButton,
  ConfigDetail,
  ConfigDetailStack,
  ConfigEmptyState,
  ConfigField,
  ConfigFooter,
  ConfigListAction,
  ConfigPanelShell,
  ConfigSidebar,
  ConfigSidebarItem,
  ConfigSidebarList,
  ConfigSidebarText,
  ConfigSplitView,
} from "@/components/SettingsUi";
import { ProviderIcon } from "@/components/ProviderIcon";
import { enrichModelMetadata, type LittaModelEntry } from "@/poweri/lib/model-metadata";
import { tp } from "@/poweri/lib/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OAuthProvider {
  id: string;
  name: string;
  usesCallbackServer: boolean;
  loggedIn: boolean;
  supportsApiKey?: boolean;
}

interface ApiKeyProvider {
  id: string;
  displayName: string;
  configured: boolean;
  source?: string;
  modelCount: number;
  supportsOAuth?: boolean;
}

type OAuthLoginState =
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "auth"; url: string; instructions: string | null; token: string }
  | { phase: "device_code"; userCode: string; verificationUri: string; intervalSeconds: number | null; expiresInSeconds: number | null }
  | { phase: "prompt"; message: string; placeholder: string | null; token: string }
  | { phase: "select"; message: string; options: { id: string; label: string }[]; token: string }
  | { phase: "progress"; message: string }
  | { phase: "success" }
  | { phase: "error"; message: string };

interface ModelEntry {
  id: string;
  name?: string;
  api?: string;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; tiers?: unknown };
  headers?: Record<string, string>;
  compat?: Record<string, unknown>;
}

interface ProviderEntry {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  compat?: Record<string, unknown>;
  models?: ModelEntry[];
  modelOverrides?: Record<string, unknown>;
}

interface ModelsJson {
  providers?: Record<string, ProviderEntry>;
}

type Selection =
  | { type: "litta" }
  | { type: "oauth"; providerId: string }
  | { type: "apikey"; providerId: string }
  | { type: "provider"; name: string }
  | { type: "model"; providerName: string; index: number };

function readRememberedSelection(): Selection | null {
  const selected = getLastSettingsSelection("models");
  if (!selected) return null;
  if (selected === "litta") return { type: "litta" };
  if (selected.startsWith("oauth:")) return { type: "oauth", providerId: selected.slice(6) };
  if (selected.startsWith("apikey:")) return { type: "apikey", providerId: selected.slice(7) };
  if (selected.startsWith("provider:")) return { type: "provider", name: selected.slice(9) };
  if (selected.startsWith("model:")) {
    const rest = selected.slice(6);
    const colon = rest.indexOf(":");
    if (colon > 0) {
      const providerName = rest.slice(0, colon);
      const index = parseInt(rest.slice(colon + 1), 10);
      if (!isNaN(index)) return { type: "model", providerName, index };
    }
  }
  return null;
}

function selectionKey(s: Selection | null): string | null {
  if (!s) return null;
  if (s.type === "litta") return "litta";
  if (s.type === "oauth") return `oauth:${s.providerId}`;
  if (s.type === "apikey") return `apikey:${s.providerId}`;
  if (s.type === "provider") return `provider:${s.name}`;
  if (s.type === "model") return `model:${s.providerName}:${s.index}`;
  return null;
}

function LittaAppIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

// ── LITTA API Key Detail (像 DeepSeek 一样纯粹的连接体验) ────────────────────────

function LittaApiKeyDetail({
  provider,
  onUpdate,
  onRemove,
}: {
  provider?: ProviderEntry;
  onUpdate: (apiKey: string, models?: ModelEntry[]) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [apiKeyInput, setApiKeyInput] = useState(provider?.apiKey || "");
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = Boolean(provider?.apiKey && provider.apiKey.trim().length > 0);
  const models = provider?.models || [];

  useEffect(() => {
    setApiKeyInput(provider?.apiKey || "");
  }, [provider?.apiKey]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim() || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      // 1. 尝试从网关自动拉取模型列表
      const res = await fetch("/poweri/api/models/litta/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKeyInput.trim(),
          api: "openai-completions",
        }),
      });
      const data = await res.json() as { models?: DiscoveredModel[]; error?: string };
      let fetchedModels: ModelEntry[] = [];
      if (res.ok && Array.isArray(data.models) && data.models.length > 0) {
        fetchedModels = data.models.map(enrichModelMetadata);
      }
      // 2. 保存 Key 并同步更新 models
      await onUpdate(apiKeyInput.trim(), fetchedModels);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleRefreshModels = async () => {
    if (!provider?.apiKey || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/poweri/api/models/litta/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: provider.apiKey,
          api: "openai-completions",
        }),
      });
      const data = await res.json() as { models?: DiscoveredModel[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Failed to fetch models");
      if (Array.isArray(data.models)) {
        const enriched = data.models.map(enrichModelMetadata);
        await onUpdate(provider.apiKey, enriched);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ConfigDetail>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <LittaAppIcon size={32} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>LITTA</div>
          <div style={{ fontSize: 12, color: isConfigured ? "#16a34a" : "var(--text-dim)" }}>
            {isConfigured ? t("i18n.connected") : t("i18n.notConnected")}
          </div>
        </div>
      </div>

      <ConfigDetailStack>
        {isConfigured ? (
          <div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
              已连接到企业大模型网关（https://llms.litta.cn/）。所有可用模型已自动加入对话模型池。
            </p>

            {/* 模型列表 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.05em" }}>
                可用模型 ({models.length})
              </div>
              {models.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>
                  暂未拉取到模型列表，可点击下方刷新
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {models.map((m) => (
                    <span
                      key={m.id}
                      style={{
                        fontSize: 11,
                        padding: "3px 8px",
                        background: "var(--bg-panel)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        color: "var(--text)",
                      }}
                    >
                      {m.name || m.id} {m.reasoning ? "🧠" : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {error && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 12 }}>{error}</div>}

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <ConfigButton onClick={handleRefreshModels} disabled={refreshing}>
                {refreshing ? t("i18n.fetchingModels") : "刷新模型列表"}
              </ConfigButton>
              <ConfigButton onClick={() => void onRemove()} style={{ color: "#f87171" }}>
                断开连接
              </ConfigButton>
            </div>
          </div>
        ) : (
          <form onSubmit={handleConnect} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
              企业统一大模型代理（https://llms.litta.cn/）。只需输入 API Key，将自动连接并拉取全部可用模型。
            </p>

            <ConfigField label="API Key">
              <input
                type="password"
                placeholder="sk-..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
                required
              />
            </ConfigField>

            {error && <div style={{ fontSize: 12, color: "#f87171" }}>{error}</div>}

            <div>
              <ConfigButton variant="primary" type="submit" disabled={connecting || !apiKeyInput.trim()}>
                {connecting ? "连接中..." : "保存并连接"}
              </ConfigButton>
            </div>
          </form>
        )}
      </ConfigDetailStack>
    </ConfigDetail>
  );
}

// ── OAuth Detail ─────────────────────────────────────────────────────────────

function OAuthDetail({ provider, onRefresh }: { provider: OAuthProvider; onRefresh: () => void }) {
  const { t } = useI18n();
  const [loginState, setLoginState] = useState<OAuthLoginState>({ phase: "idle" });
  const [promptInput, setPromptInput] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => () => stopPolling(), []);

  const handleStartLogin = async () => {
    stopPolling();
    setLoginState({ phase: "connecting" });
    try {
      const res = await fetch("/api/auth/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider.id }),
      });
      const d = await res.json() as { error?: string; status?: string; url?: string; instructions?: string | null; token?: string; userCode?: string; verificationUri?: string; intervalSeconds?: number | null; expiresInSeconds?: number | null };
      if (!res.ok || d.error) {
        setLoginState({ phase: "error", message: d.error ?? `HTTP ${res.status}` });
        return;
      }
      if (d.status === "auth" && d.url && d.token) {
        window.open(d.url, "_blank");
        setLoginState({ phase: "auth", url: d.url, instructions: d.instructions ?? null, token: d.token });
        startPolling(d.token);
      } else if (d.status === "device_code" && d.userCode && d.verificationUri && d.token) {
        setLoginState({
          phase: "device_code",
          userCode: d.userCode,
          verificationUri: d.verificationUri,
          intervalSeconds: d.intervalSeconds ?? null,
          expiresInSeconds: d.expiresInSeconds ?? null,
        });
        startPolling(d.token, (d.intervalSeconds ?? 5) * 1000);
      } else {
        setLoginState({ phase: "error", message: "Unexpected auth response" });
      }
    } catch (e) {
      setLoginState({ phase: "error", message: String(e) });
    }
  };

  const startPolling = (token: string, intervalMs = 2000) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/oauth/poll?token=${encodeURIComponent(token)}`);
        const d = await res.json() as { status?: string; error?: string; message?: string; placeholder?: string | null; options?: { id: string; label: string }[] };
        if (d.status === "success") {
          stopPolling();
          setLoginState({ phase: "success" });
          onRefresh();
        } else if (d.status === "prompt" && d.message) {
          stopPolling();
          setLoginState({ phase: "prompt", message: d.message, placeholder: d.placeholder ?? null, token });
        } else if (d.status === "select" && d.message && Array.isArray(d.options)) {
          stopPolling();
          setLoginState({ phase: "select", message: d.message, options: d.options, token });
        } else if (d.status === "error") {
          stopPolling();
          setLoginState({ phase: "error", message: d.error ?? "Authentication failed" });
        }
      } catch {
        // ignore network glitches
      }
    }, intervalMs);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/oauth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider.id }),
      });
      setLoginState({ phase: "idle" });
      onRefresh();
    } catch {
      // ignore
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <ConfigDetail>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <ProviderIcon id={provider.id} size={32} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{provider.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {provider.loggedIn ? t("i18n.connected") : t("i18n.notConnected")}
          </div>
        </div>
      </div>

      <ConfigDetailStack>
        {provider.loggedIn ? (
          <div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              {t("i18n.oauthConnectedDesc", { name: provider.name })}
            </p>
            <ConfigButton onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? t("i18n.disconnecting") : t("i18n.disconnect")}
            </ConfigButton>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              {t("i18n.oauthConnectDesc", { name: provider.name })}
            </p>
            {loginState.phase === "idle" && (
              <ConfigButton variant="primary" onClick={handleStartLogin}>
                {t("i18n.connect")}
              </ConfigButton>
            )}
            {loginState.phase === "connecting" && (
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{t("i18n.connecting")}...</div>
            )}
            {loginState.phase === "auth" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {loginState.instructions || t("i18n.completeAuthInBrowser")}
                </div>
                <ConfigButton onClick={() => window.open(loginState.url, "_blank")}>
                  {t("i18n.openBrowser")}
                </ConfigButton>
              </div>
            )}
            {loginState.phase === "device_code" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {t("i18n.deviceCodeInstructions", { uri: loginState.verificationUri })}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.1em", color: "var(--accent)", padding: "6px 0" }}>
                  {loginState.userCode}
                </div>
                <ConfigButton onClick={() => window.open(loginState.verificationUri, "_blank")}>
                  {t("i18n.openVerificationPage")}
                </ConfigButton>
              </div>
            )}
            {loginState.phase === "error" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 13, color: "#f87171" }}>{loginState.message}</div>
                <ConfigButton onClick={handleStartLogin}>{t("i18n.retry")}</ConfigButton>
              </div>
            )}
          </div>
        )}
      </ConfigDetailStack>
    </ConfigDetail>
  );
}

// ── API Key Detail (DeepSeek / OpenAI 等) ─────────────────────────────────────

function ApiKeyDetail({ provider, onRefresh }: { provider: ApiKeyProvider; onRefresh: () => void }) {
  const { t } = useI18n();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider.id, apiKey: apiKeyInput.trim() }),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) {
        setError(d.error ?? `HTTP ${res.status}`);
      } else {
        setApiKeyInput("");
        onRefresh();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/api-key", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider.id }),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) {
        setError(d.error ?? `HTTP ${res.status}`);
      } else {
        onRefresh();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfigDetail>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <ProviderIcon id={provider.id} size={32} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{provider.displayName}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {provider.configured ? t("i18n.configured") : t("i18n.notConfigured")}
          </div>
        </div>
      </div>

      <ConfigDetailStack>
        {provider.configured ? (
          <div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              {t("i18n.apiKeyConfiguredDesc", { name: provider.displayName })}
            </p>
            <ConfigButton onClick={handleRemove} disabled={saving}>
              {saving ? t("i18n.removing") : t("i18n.removeKey")}
            </ConfigButton>
          </div>
        ) : (
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ConfigField label="API Key">
              <input
                type="password"
                placeholder="sk-..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
              />
            </ConfigField>
            {error && <div style={{ fontSize: 12, color: "#f87171" }}>{error}</div>}
            <div>
              <ConfigButton variant="primary" type="submit" disabled={saving || !apiKeyInput.trim()}>
                {saving ? t("i18n.saving") : t("i18n.saveKey")}
              </ConfigButton>
            </div>
          </form>
        )}
      </ConfigDetailStack>
    </ConfigDetail>
  );
}

// ── Add Provider Picker ───────────────────────────────────────────────────────

interface AddProviderPickerProps {
  oauthProviders: OAuthProvider[];
  apiKeyProviders: ApiKeyProvider[];
  onSelectOAuth: (id: string) => void;
  onSelectApiKey: (id: string) => void;
  onSelectLitta: () => void;
  onAddCustom: () => void;
  onClose: () => void;
}

function AddProviderPicker({
  oauthProviders,
  apiKeyProviders,
  onSelectOAuth,
  onSelectApiKey,
  onSelectLitta,
  onAddCustom,
  onClose,
}: AddProviderPickerProps) {
  const [search, setSearch] = useState("");
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, []);

  const q = search.trim().toLowerCase();

  const availableOAuth = oauthProviders.filter((p) => !p.loggedIn && (!q || p.name.toLowerCase().includes(q)));
  const availableApiKey = apiKeyProviders.filter((p) => !p.configured && (!q || p.displayName.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)));
  const showLitta = !q || "litta".includes(q) || "byok".includes(q);
  const showCustom = !q || "custom".includes(q) || "openai-compatible".includes(q) || "anthropic-compatible".includes(q);

  const cardStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    background: "var(--bg-panel)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    boxSizing: "border-box",
    cursor: "pointer",
    minWidth: 0,
    textAlign: "left",
    transition: "border-color 0.12s, background 0.12s",
    width: "100%",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div style={{ width: 820, maxWidth: "calc(100vw - 32px)", maxHeight: "min(72vh, calc(100vh - 32px))", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.22)", overflow: "hidden" }}>
        {/* Search */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("i18n.searchProviders")}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }}
          />
        </div>

        {/* Card grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 8 }}>
            
            {/* API Key 提供商 (LITTA 排在最前面，像 DeepSeek 一样) */}
            <div style={{ gridColumn: "1 / -1", fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              API Key (BYOK)
            </div>

            {/* 1. LITTA: 首选 API Key 提供商 */}
            {showLitta && (
              <button
                onClick={() => { onSelectLitta(); onClose(); }}
                style={{ ...cardStyle, borderColor: "var(--accent)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-panel)"; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>LITTA</span>
                    <span style={{ fontSize: 9, background: "var(--accent)", color: "#fff", padding: "1px 4px", borderRadius: 3, fontWeight: 500 }}>默认源</span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
                    https://llms.litta.cn/ · 一键连接
                  </div>
                </div>
                <LittaAppIcon size={28} />
              </button>
            )}

            {/* 常规 API Key 提供商 (DeepSeek, OpenAI 等) */}
            {availableApiKey.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelectApiKey(p.id); onClose(); }}
                style={cardStyle}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-panel)"; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.displayName}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>{p.modelCount} models</div>
                </div>
                <ProviderIcon id={p.id} size={28} />
              </button>
            ))}

            {/* Subscriptions / OAuth */}
            {availableOAuth.length > 0 && (
              <div style={{ gridColumn: "1 / -1", paddingTop: 8, fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {t("i18n.subscriptions")}
              </div>
            )}
            {availableOAuth.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelectOAuth(p.id); onClose(); }}
                style={cardStyle}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-panel)"; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>OAuth</div>
                </div>
                <ProviderIcon id={p.id} size={28} />
              </button>
            ))}

            {/* CUSTOM Section */}
            {showCustom && (
              <div style={{ gridColumn: "1 / -1", paddingTop: 8, fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {t("i18n.custom")}
              </div>
            )}
            {showCustom && (
              <button
                onClick={() => { onAddCustom(); onClose(); }}
                style={cardStyle}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-panel)"; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    OpenAI / Anthropic compatible
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
                    {t("i18n.customEndpoint")}
                  </div>
                </div>
                <span style={{ width: 26, height: 26, borderRadius: 5, background: "var(--bg-hover)", border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)" }}>
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PowerIModelsConfig({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const { t } = useI18n();
  const [config, setConfig] = useState<ModelsJson>({ providers: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(readRememberedSelection);
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const [apiKeyProviders, setApiKeyProviders] = useState<ApiKeyProvider[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const refreshAuthProviders = useCallback(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((d: { oauthProviders?: OAuthProvider[]; apiKeyProviders?: ApiKeyProvider[] }) => {
        if (Array.isArray(d.oauthProviders)) setOauthProviders(d.oauthProviders);
        if (Array.isArray(d.apiKeyProviders)) setApiKeyProviders(d.apiKeyProviders);
      })
      .catch(() => {});
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/models-config");
      const d = await res.json() as ModelsJson;
      if (res.ok && d) {
        setConfig(d);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    refreshAuthProviders();
  }, [loadConfig, refreshAuthProviders]);

  useEffect(() => {
    const key = selectionKey(selection);
    if (key) setLastSettingsSelection("models", key);
  }, [selection]);

  // LITTA 更新操作 (像 DeepSeek 一样直接保存 Key 并可选注入 models)
  const handleUpdateLitta = async (apiKey: string, models?: ModelEntry[]) => {
    setSaving(true);
    setSaveError(null);
    try {
      const current = config.providers?.litta || {};
      const updatedProvider: ProviderEntry = {
        ...current,
        baseUrl: "https://llms.litta.cn/",
        api: "openai-completions",
        apiKey,
        models: models && models.length > 0 ? models : current.models || [],
      };

      const newConfig = {
        ...config,
        providers: {
          ...(config.providers ?? {}),
          litta: updatedProvider,
        },
      };

      const res = await fetch("/api/models-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) throw new Error(d.error || `HTTP ${res.status}`);
      setConfig(newConfig);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // LITTA 移除/断开操作
  const handleRemoveLitta = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const newProviders = { ...(config.providers ?? {}) };
      delete newProviders.litta;
      const newConfig = { ...config, providers: newProviders };

      const res = await fetch("/api/models-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) throw new Error(d.error || `HTTP ${res.status}`);
      setConfig(newConfig);
      setSelection(null);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const addCustomProvider = useCallback(() => {
    let name = "custom";
    let i = 1;
    while (config.providers?.[name]) {
      name = `custom-${++i}`;
    }
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...(prev.providers ?? {}),
        [name]: {
          baseUrl: "",
          api: "openai-completions",
          models: [],
        },
      },
    }));
    setSelection({ type: "provider", name });
  }, [config.providers]);

  const providers = Object.entries(config.providers ?? {}).filter(([p]) => p !== "litta");
  const activeOAuth = oauthProviders.filter((p) => p.loggedIn);
  const activeApiKey = apiKeyProviders.filter((p) => p.configured);
  const littaEntry = config.providers?.litta;

  const detailContent = (() => {
    if (!selection) return null;
    if (selection.type === "litta") {
      return (
        <LittaApiKeyDetail
          provider={littaEntry}
          onUpdate={handleUpdateLitta}
          onRemove={handleRemoveLitta}
        />
      );
    }
    if (selection.type === "oauth") {
      const p = oauthProviders.find((p) => p.id === selection.providerId);
      if (!p) return null;
      return <OAuthDetail key={p.id} provider={p} onRefresh={refreshAuthProviders} />;
    }
    if (selection.type === "apikey") {
      const p = apiKeyProviders.find((p) => p.id === selection.providerId);
      if (!p) return null;
      return <ApiKeyDetail key={p.id} provider={p} onRefresh={refreshAuthProviders} />;
    }
    if (selection.type === "provider") {
      const provider = config.providers?.[selection.name];
      if (!provider) return null;
      return (
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{selection.name}</div>
        </div>
      );
    }
    return null;
  })();

  return (
    <>
      <ConfigPanelShell embedded={embedded} title={t("common.models")} subtitle="~/.pi/agent/models.json" closeLabel={t("i18n.close")} onClose={onClose}>
        <ConfigSplitView>
          {/* Left: Provider tree */}
          <ConfigSidebar>
            <ConfigSidebarList>
              {/* LITTA Provider (置顶像 DeepSeek 一样呈现) */}
              <ConfigSidebarItem
                active={selection?.type === "litta"}
                onClick={() => setSelection({ type: "litta" })}
              >
                <LittaAppIcon size={16} />
                <ConfigSidebarText className="is-grow">LITTA</ConfigSidebarText>
                {littaEntry?.models && littaEntry.models.length > 0 && (
                  <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 4 }}>
                    {littaEntry.models.length}
                  </span>
                )}
              </ConfigSidebarItem>

              {/* Active OAuth subscriptions */}
              {activeOAuth.map((p) => {
                const isSelected = selection?.type === "oauth" && selection.providerId === p.id;
                return (
                  <ConfigSidebarItem
                    key={p.id}
                    active={isSelected}
                    onClick={() => setSelection({ type: "oauth", providerId: p.id })}
                  >
                    <ProviderIcon id={p.id} size={16} />
                    <ConfigSidebarText className="is-grow">{p.name}</ConfigSidebarText>
                  </ConfigSidebarItem>
                );
              })}

              {/* Active API key providers (DeepSeek, OpenAI 等) */}
              {activeApiKey.map((p) => {
                const isSelected = selection?.type === "apikey" && selection.providerId === p.id;
                return (
                  <ConfigSidebarItem
                    key={p.id}
                    active={isSelected}
                    onClick={() => setSelection({ type: "apikey", providerId: p.id })}
                  >
                    <ProviderIcon id={p.id} size={16} />
                    <ConfigSidebarText className="is-grow">{p.displayName}</ConfigSidebarText>
                  </ConfigSidebarItem>
                );
              })}

              {/* Custom providers */}
              {providers.length > 0 && (
                <div style={{ margin: "4px 8px", borderTop: "1px solid var(--border)" }} />
              )}
              {providers.map(([pName, pData]) => {
                const isProviderSelected = selection?.type === "provider" && selection.name === pName;
                return (
                  <ConfigSidebarItem
                    key={pName}
                    active={isProviderSelected}
                    onClick={() => setSelection({ type: "provider", name: pName })}
                  >
                    <ProviderIcon id={pName} size={16} />
                    <ConfigSidebarText className="is-grow">{pName}</ConfigSidebarText>
                  </ConfigSidebarItem>
                );
              })}

              {/* Add Provider Button */}
              <div style={{ padding: "8px 8px 4px" }}>
                <ConfigListAction onClick={() => setPickerOpen(true)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>{t("i18n.addProvider")}</span>
                </ConfigListAction>
              </div>
            </ConfigSidebarList>
          </ConfigSidebar>

          {/* Right: Detail View */}
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 20 }}>
            {detailContent || (
              <ConfigEmptyState>
                <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{t("i18n.selectProviderOrModel")}</div>
              </ConfigEmptyState>
            )}
          </div>
        </ConfigSplitView>

        {/* Footer */}
        <ConfigFooter status={saveError && <span style={{ color: "#f87171" }}>{saveError}</span>}>
          {!embedded && <ConfigButton onClick={onClose}>{t("i18n.cancel")}</ConfigButton>}
          <ConfigButton
            variant="primary"
            onClick={() => { setSavedOk(true); setTimeout(() => setSavedOk(false), 2000); }}
            disabled={saving || savedOk}
            className={savedOk ? "is-success" : undefined}
          >
            {savedOk && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="config-button-success-icon">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            <span>{savedOk ? t("i18n.saved") : saving ? t("i18n.saving") : t("i18n.save")}</span>
          </ConfigButton>
        </ConfigFooter>
      </ConfigPanelShell>

      {/* Add Provider Picker */}
      {pickerOpen && (
        <AddProviderPicker
          oauthProviders={oauthProviders}
          apiKeyProviders={apiKeyProviders}
          onSelectOAuth={(id) => setSelection({ type: "oauth", providerId: id })}
          onSelectApiKey={(id) => setSelection({ type: "apikey", providerId: id })}
          onSelectLitta={() => setSelection({ type: "litta" })}
          onAddCustom={addCustomProvider}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
