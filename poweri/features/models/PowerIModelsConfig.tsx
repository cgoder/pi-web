// PowerI 受控派生自 components/ModelsConfig.tsx — 遵循上游完整样式与交互，将 LITTA 作为 CUSTOM 分类首选预置项
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { ModelCatalogPreset, ModelCatalogRecommendation } from "@/lib/model-catalog";
import type { DiscoveredModel } from "@/lib/model-discovery";
import {
  getLastSettingsSelection,
  setLastSettingsSelection,
} from "@/lib/settings-navigation";
import {
  hasModelCostDraftValue,
  modelCostToDraft,
  parseCompleteModelCost,
  serializeHeaderRows,
  setCompatBool,
  updateHeaderRow,
  type HeaderRow,
  type ModelCostDraft,
  type ModelCostKey,
} from "@/components/models-config-helpers";
import {
  ConfigButton,
  ConfigDetail,
  ConfigDetailStack,
  ConfigEmptyState,
  ConfigField,
  ConfigFooter,
  ConfigListAction,
  ConfigPanelShell,
  ConfigSectionTitle,
  ConfigSidebar,
  ConfigSidebarItem,
  ConfigSidebarList,
  ConfigSidebarText,
  ConfigSplitView,
} from "@/components/SettingsUi";
import { ProviderIcon } from "@/components/ProviderIcon";

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

type ModelTestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "success"; latencyMs?: number }
  | { kind: "error"; message: string };

type Selection =
  | { type: "oauth"; providerId: string }
  | { type: "apikey"; providerId: string }
  | { type: "provider"; name: string }
  | { type: "model"; providerName: string; index: number };

function readRememberedSelection(): Selection | null {
  const selected = getLastSettingsSelection("models");
  if (!selected) return null;
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
        // ignore network glitches during polling
      }
    }, intervalMs);
  };

  const handlePromptSubmit = async () => {
    if (loginState.phase !== "prompt") return;
    const { token } = loginState;
    setLoginState({ phase: "progress", message: "Submitting..." });
    try {
      const res = await fetch("/api/auth/oauth/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, value: promptInput }),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) {
        setLoginState({ phase: "error", message: d.error ?? `HTTP ${res.status}` });
      } else {
        startPolling(token);
      }
    } catch (e) {
      setLoginState({ phase: "error", message: String(e) });
    }
  };

  const handleSelectSubmit = async (value: string) => {
    if (loginState.phase !== "select") return;
    const { token } = loginState;
    setLoginState({ phase: "progress", message: "Selecting..." });
    try {
      const res = await fetch("/api/auth/oauth/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, value }),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) {
        setLoginState({ phase: "error", message: d.error ?? `HTTP ${res.status}` });
      } else {
        startPolling(token);
      }
    } catch (e) {
      setLoginState({ phase: "error", message: String(e) });
    }
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
            {loginState.phase === "prompt" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{loginState.message}</div>
                <input
                  type="text"
                  placeholder={loginState.placeholder ?? ""}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }}
                />
                <ConfigButton variant="primary" onClick={handlePromptSubmit}>
                  {t("i18n.submit")}
                </ConfigButton>
              </div>
            )}
            {loginState.phase === "select" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{loginState.message}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {loginState.options.map((opt) => (
                    <ConfigButton key={opt.id} onClick={() => handleSelectSubmit(opt.id)}>
                      {opt.label}
                    </ConfigButton>
                  ))}
                </div>
              </div>
            )}
            {loginState.phase === "progress" && (
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{loginState.message}</div>
            )}
            {loginState.phase === "success" && (
              <div style={{ fontSize: 13, color: "var(--accent)" }}>{t("i18n.authSuccess")}</div>
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

// ── API Key Detail ────────────────────────────────────────────────────────────

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

// ── Provider Detail (Custom / LITTA) ──────────────────────────────────────────

function ProviderDetail({
  name,
  provider,
  onChange,
  onRename,
  onDelete,
  onAddModels,
}: {
  name: string;
  provider: ProviderEntry;
  onChange: (p: ProviderEntry) => void;
  onRename: (n: string) => void;
  onDelete: () => void;
  onAddModels: (models: DiscoveredModel[]) => void;
}) {
  const { t } = useI18n();
  const [providerName, setProviderName] = useState(name);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  useEffect(() => { setProviderName(name); }, [name]);

  const isLitta = name === "litta" || provider.baseUrl?.includes("litta.cn");

  const handleDiscover = async () => {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      let url = "/api/models-config/discover";
      let body: Record<string, unknown> = {
        baseUrl: provider.baseUrl,
        api: provider.api,
        apiKey: provider.apiKey,
        headers: provider.headers,
      };

      if (isLitta) {
        url = "/poweri/api/models/litta/discover";
        body = {
          apiKey: provider.apiKey,
          api: provider.api,
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { models?: DiscoveredModel[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (Array.isArray(data.models)) {
        onAddModels(data.models);
      }
    } catch (e) {
      setDiscoverError(e instanceof Error ? e.message : String(e));
    } finally {
      setDiscovering(false);
    }
  };

  return (
    <ConfigDetail>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isLitta ? <LittaAppIcon size={30} /> : <ProviderIcon id={name} size={30} />}
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{name}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
              {isLitta ? "LITTA BYOK Gateway" : t("i18n.customProvider")}
            </div>
          </div>
        </div>
        <ConfigButton onClick={onDelete} style={{ color: "#f87171" }}>
          {t("i18n.delete")}
        </ConfigButton>
      </div>

      <ConfigDetailStack>
        <ConfigField label={t("i18n.providerId")}>
          <input
            type="text"
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            onBlur={() => { if (providerName.trim() && providerName !== name) onRename(providerName.trim()); }}
            style={{ width: "100%", padding: "6px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
          />
        </ConfigField>

        <ConfigField label="Base URL">
          <input
            type="text"
            placeholder="https://api.example.com/v1"
            value={provider.baseUrl ?? ""}
            onChange={(e) => onChange({ ...provider, baseUrl: e.target.value })}
            style={{ width: "100%", padding: "6px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
          />
        </ConfigField>

        <ConfigField label="API Protocol">
          <select
            value={provider.api ?? "openai-completions"}
            onChange={(e) => onChange({ ...provider, api: e.target.value })}
            style={{ width: "100%", padding: "6px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
          >
            <option value="openai-completions">OpenAI completions / v1/chat/completions</option>
            <option value="anthropic-messages">Anthropic messages / v1/messages</option>
          </select>
        </ConfigField>

        <ConfigField label="API Key">
          <input
            type="password"
            placeholder="sk-..."
            value={provider.apiKey ?? ""}
            onChange={(e) => onChange({ ...provider, apiKey: e.target.value })}
            style={{ width: "100%", padding: "6px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
          />
        </ConfigField>

        <div style={{ paddingTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <ConfigButton onClick={handleDiscover} disabled={discovering}>
            {discovering ? t("i18n.fetchingModels") : t("i18n.fetchModels")}
          </ConfigButton>
          {discoverError && <span style={{ fontSize: 12, color: "#f87171" }}>{discoverError}</span>}
        </div>
      </ConfigDetailStack>
    </ConfigDetail>
  );
}

// ── Model Detail ──────────────────────────────────────────────────────────────

function ModelDetail({
  providerName,
  provider,
  model,
  onChange,
  onDelete,
}: {
  providerName: string;
  provider: ProviderEntry;
  model: ModelEntry;
  onChange: (m: ModelEntry) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();

  return (
    <ConfigDetail>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{model.name || model.id || t("i18n.untitledModel")}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{providerName} / {model.id}</div>
        </div>
        <ConfigButton onClick={onDelete} style={{ color: "#f87171" }}>
          {t("i18n.deleteModel")}
        </ConfigButton>
      </div>

      <ConfigDetailStack>
        <ConfigField label={t("i18n.modelId")}>
          <input
            type="text"
            value={model.id}
            onChange={(e) => onChange({ ...model, id: e.target.value })}
            style={{ width: "100%", padding: "6px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
          />
        </ConfigField>

        <ConfigField label={t("i18n.displayName")}>
          <input
            type="text"
            placeholder={model.id}
            value={model.name ?? ""}
            onChange={(e) => onChange({ ...model, name: e.target.value || undefined })}
            style={{ width: "100%", padding: "6px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
          />
        </ConfigField>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <ConfigField label={t("i18n.contextWindow")}>
            <input
              type="number"
              placeholder="32000"
              value={model.contextWindow ?? ""}
              onChange={(e) => onChange({ ...model, contextWindow: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              style={{ width: "100%", padding: "6px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
            />
          </ConfigField>

          <ConfigField label={t("i18n.maxTokens")}>
            <input
              type="number"
              placeholder="4096"
              value={model.maxTokens ?? ""}
              onChange={(e) => onChange({ ...model, maxTokens: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              style={{ width: "100%", padding: "6px 10px", fontSize: 13, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", boxSizing: "border-box" }}
            />
          </ConfigField>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
          <input
            type="checkbox"
            id="reasoning-checkbox"
            checked={Boolean(model.reasoning)}
            onChange={(e) => onChange({ ...model, reasoning: e.target.checked })}
          />
          <label htmlFor="reasoning-checkbox" style={{ fontSize: 13, color: "var(--text)", cursor: "pointer" }}>
            {t("i18n.reasoningModel")} (Reasoning / Thinking)
          </label>
        </div>
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
  onAddLitta: () => void;
  onAddCustom: () => void;
  onClose: () => void;
}

function AddProviderPicker({
  oauthProviders,
  apiKeyProviders,
  onSelectOAuth,
  onSelectApiKey,
  onAddLitta,
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
  const showCustom = !q || "custom".includes(q) || "openai-compatible".includes(q) || "anthropic-compatible".includes(q) || "litta".includes(q);

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
            {/* CUSTOM Section at the top */}
            {showCustom && (
              <div style={{ gridColumn: "1 / -1", fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {t("i18n.custom")}
              </div>
            )}

            {/* 1. LITTA: First item in CUSTOM */}
            {showCustom && (!q || "litta".includes(q) || "byok".includes(q)) && (
              <button
                onClick={() => { onAddLitta(); onClose(); }}
                style={{ ...cardStyle, borderColor: "var(--accent)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-panel)"; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>LITTA</span>
                    <span style={{ fontSize: 9, background: "var(--accent)", color: "#fff", padding: "1px 4px", borderRadius: 3, fontWeight: 500 }}>BYOK</span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
                    https://llms.litta.cn/ · OpenAI & Anthropic
                  </div>
                </div>
                <LittaAppIcon size={26} />
              </button>
            )}

            {/* 2. Generic Custom Endpoint */}
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

            {/* Subscriptions / OAuth */}
            {availableOAuth.length > 0 && (
              <div style={{ gridColumn: "1 / -1", paddingTop: 6, fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
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

            {/* API Key Providers */}
            {availableApiKey.length > 0 && (
              <div style={{ gridColumn: "1 / -1", paddingTop: 6, fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                API Key
              </div>
            )}
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

  const updateProvider = useCallback((name: string, p: ProviderEntry) => {
    setConfig((prev) => ({
      ...prev,
      providers: { ...(prev.providers ?? {}), [name]: p },
    }));
  }, []);

  const renameProvider = useCallback((oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) return;
    setConfig((prev) => {
      const entries = Object.entries(prev.providers ?? {}).map(([k, v]) => (k === oldName ? [newName, v] : [k, v]));
      return { ...prev, providers: Object.fromEntries(entries) };
    });
    setSelection((prev) => {
      if (!prev) return prev;
      if (prev.type === "provider" && prev.name === oldName) return { type: "provider", name: newName };
      if (prev.type === "model" && prev.providerName === oldName) return { ...prev, providerName: newName };
      return prev;
    });
  }, []);

  const deleteProvider = useCallback((name: string) => {
    setConfig((prev) => {
      const providers = { ...(prev.providers ?? {}) };
      delete providers[name];
      return { ...prev, providers };
    });
    setConfig((prev) => {
      const remaining = Object.keys(prev.providers ?? {});
      setSelection(remaining.length > 0 ? { type: "provider", name: remaining[0] } : null);
      return prev;
    });
  }, []);

  const addDiscoveredModels = useCallback((providerName: string, discovered: DiscoveredModel[]) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? [])];
      const existingIds = new Set(models.map((model) => model.id));
      for (const discoveredModel of discovered) {
        if (existingIds.has(discoveredModel.id)) continue;
        existingIds.add(discoveredModel.id);
        models.push({ id: discoveredModel.id, name: discoveredModel.name });
      }
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models } } };
    });
  }, []);

  const addLittaProvider = useCallback(() => {
    const name = "litta";
    setConfig((prev) => {
      const existing = prev.providers?.[name];
      if (existing) return prev;
      return {
        ...prev,
        providers: {
          ...(prev.providers ?? {}),
          [name]: {
            baseUrl: "https://llms.litta.cn/",
            api: "openai-completions",
            models: [],
          },
        },
      };
    });
    setSelection({ type: "provider", name });
  }, []);

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

  const updateModel = useCallback((providerName: string, index: number, m: ModelEntry) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? [])];
      models[index] = m;
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models } } };
    });
  }, []);

  const removeModel = useCallback((providerName: string, index: number) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? [])];
      models.splice(index, 1);
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models: models.length ? models : undefined } } };
    });
    setSelection({ type: "provider", name: providerName });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);
    try {
      const res = await fetch("/api/models-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) setSaveError(d.error ?? `HTTP ${res.status}`);
      else { setSavedOk(true); setTimeout(() => setSavedOk(false), 2000); }
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }, [config]);

  const providers = Object.entries(config.providers ?? {});
  const activeOAuth = oauthProviders.filter((p) => p.loggedIn);
  const activeApiKey = apiKeyProviders.filter((p) => p.configured);

  const detailContent = (() => {
    if (!selection) return null;
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
        <ProviderDetail
          key={selection.name}
          name={selection.name}
          provider={provider}
          onChange={(p) => updateProvider(selection.name, p)}
          onRename={(n) => renameProvider(selection.name, n)}
          onDelete={() => deleteProvider(selection.name)}
          onAddModels={(models) => addDiscoveredModels(selection.name, models)}
        />
      );
    }
    const provider = config.providers?.[selection.providerName];
    const model = provider?.models?.[selection.index];
    if (!model) return null;
    return (
      <ModelDetail
        key={`${selection.providerName}-${selection.index}`}
        providerName={selection.providerName}
        provider={provider}
        model={model}
        onChange={(m) => updateModel(selection.providerName, selection.index, m)}
        onDelete={() => removeModel(selection.providerName, selection.index)}
      />
    );
  })();

  return (
    <>
      <ConfigPanelShell embedded={embedded} title={t("common.models")} subtitle="~/.pi/agent/models.json" closeLabel={t("i18n.close")} onClose={onClose}>
        <ConfigSplitView>
          {/* Left: Provider tree */}
          <ConfigSidebar>
            <ConfigSidebarList>
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

              {/* Active API key providers */}
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

              {/* Divider */}
              {(activeOAuth.length > 0 || activeApiKey.length > 0) && providers.length > 0 && (
                <div style={{ margin: "4px 8px", borderTop: "1px solid var(--border)" }} />
              )}

              {/* Custom / LITTA providers */}
              {loading ? (
                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>{t("i18n.loading")}</div>
              ) : providers.map(([pName, pData]) => {
                const isProviderSelected = selection?.type === "provider" && selection.name === pName;
                const models = pData.models ?? [];
                const isLitta = pName === "litta" || pData.baseUrl?.includes("litta.cn");

                return (
                  <div key={pName} style={{ marginBottom: 2 }}>
                    <ConfigSidebarItem
                      active={isProviderSelected}
                      onClick={() => setSelection({ type: "provider", name: pName })}
                    >
                      {isLitta ? <LittaAppIcon size={16} /> : <ProviderIcon id={pName} size={16} />}
                      <ConfigSidebarText className="is-grow">{pName}</ConfigSidebarText>
                      {models.length > 0 && (
                        <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 4 }}>{models.length}</span>
                      )}
                    </ConfigSidebarItem>

                    {/* Model sub-items */}
                    {models.map((m, idx) => {
                      const isModelSelected = selection?.type === "model" && selection.providerName === pName && selection.index === idx;
                      return (
                        <ConfigSidebarItem
                          key={idx}
                          active={isModelSelected}
                          onClick={() => setSelection({ type: "model", providerName: pName, index: idx })}
                          style={{ paddingLeft: 24 }}
                        >
                          <ConfigSidebarText className="is-grow" style={{ fontSize: 11 }}>
                            {m.name || m.id || t("i18n.untitledModel")}
                          </ConfigSidebarText>
                        </ConfigSidebarItem>
                      );
                    })}
                  </div>
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
            onClick={handleSave}
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
          onAddLitta={addLittaProvider}
          onAddCustom={addCustomProvider}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
