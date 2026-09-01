"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/hooks/useI18n";
import { ConfigSwitch } from "@/components/SettingsUi";
import { ModelsConfig } from "@/components/ModelsConfig";
import type { LittaModelEntry, LittaProviderConfig } from "@/poweri/lib/litta-provider";
import { tp } from "@/poweri/lib/i18n";

interface Props {
  onClose: () => void;
  embedded?: boolean;
}

export function PowerIModelsConfig({ onClose }: Props) {
  const { locale } = useI18n();

  // LITTA 状态
  const [littaConfig, setLittaConfig] = useState<LittaProviderConfig | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [protocol, setProtocol] = useState<"openai-completions" | "anthropic-messages">("openai-completions");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [testing, setTesting] = useState(false);
  const [latencyResult, setLatencyResult] = useState<{ ok: boolean; latencyMs?: number; error?: string } | null>(null);
  const [models, setModels] = useState<LittaModelEntry[]>([]);
  const [showOtherProviders, setShowOtherProviders] = useState(false);

  // 拉取当前 LITTA 配置
  const fetchLitta = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/poweri/api/models/litta");
      const data = (await res.json()) as LittaProviderConfig;
      if (res.ok && data) {
        setLittaConfig(data);
        setApiKeyInput(data.apiKey || "");
        setProtocol(data.api || "openai-completions");
        setModels(data.models || []);
      }
    } catch (err) {
      console.error("Failed to load LITTA config:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLitta();
  }, [fetchLitta]);

  // 保存 LITTA Key 与配置
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setLatencyResult(null);
    try {
      const res = await fetch("/poweri/api/models/litta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKeyInput.trim(),
          api: protocol,
          models,
          autoDiscover: models.length === 0,
        }),
      });
      const data = (await res.json()) as { success?: boolean; config?: LittaProviderConfig; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Save failed");
      if (data.config) {
        setLittaConfig(data.config);
        setModels(data.config.models || []);
      }
      // 触发一次连通性测速
      void handleTestLatency(apiKeyInput.trim(), protocol);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // 从网关拉取模型
  const handleDiscover = async () => {
    if (!apiKeyInput.trim()) {
      alert("Please input API Key first / 请先填写 API Key");
      return;
    }
    setDiscovering(true);
    try {
      const res = await fetch("/poweri/api/models/litta/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKeyInput.trim(),
          api: protocol,
        }),
      });
      const data = (await res.json()) as { success?: boolean; models?: LittaModelEntry[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Fetch failed");
      if (Array.isArray(data.models)) {
        setModels(data.models);
        // 同步保存
        await fetch("/poweri/api/models/litta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: apiKeyInput.trim(),
            api: protocol,
            models: data.models,
            autoDiscover: false,
          }),
        });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscovering(false);
    }
  };

  // 测速
  const handleTestLatency = async (key = apiKeyInput, proto = protocol) => {
    if (!key.trim()) return;
    setTesting(true);
    try {
      const res = await fetch("/poweri/api/models/litta/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key.trim(), api: proto }),
      });
      const data = (await res.json()) as { ok: boolean; latencyMs?: number; error?: string };
      setLatencyResult(data);
    } catch (err) {
      setLatencyResult({ ok: false, error: String(err) });
    } finally {
      setTesting(false);
    }
  };

  // 切换单个模型启用状态
  const handleToggleModel = async (modelId: string, nextEnabled: boolean) => {
    const updated = models.map((m) => (m.id === modelId ? { ...m, enabled: nextEnabled } : m));
    setModels(updated);
    try {
      await fetch("/poweri/api/models/litta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKeyInput.trim(),
          api: protocol,
          models: updated,
          autoDiscover: false,
        }),
      });
    } catch (err) {
      console.error("Failed to save model toggle:", err);
    }
  };

  const isConfigured = Boolean(littaConfig?.configured && apiKeyInput.trim().length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", background: "var(--bg)", padding: "20px 24px", gap: 20 }}>
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
          {tp(locale, "models.fetching")}
        </div>
      ) : (
        <>
          {/* ⭐ LITTA 默认 BYOK 提供商 Hero 卡片 */}
      <div
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "20px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        }}
      >
        {/* 标题与状态 */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>⚡</span>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: 0 }}>
                {tp(locale, "models.littaTitle")}
              </h2>
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: isConfigured ? "rgba(34,197,94,0.12)" : "rgba(234,179,8,0.12)",
                  color: isConfigured ? "#16a34a" : "#ca8a04",
                  fontWeight: 600,
                }}
              >
                {isConfigured ? tp(locale, "models.connected") : tp(locale, "models.notConfigured")}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "6px 0 0" }}>
              {tp(locale, "models.littaDesc")}
            </p>
          </div>

          {/* 测速结果 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {latencyResult && (
              <span
                style={{
                  fontSize: 11,
                  color: latencyResult.ok ? "#16a34a" : "#ef4444",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 500,
                }}
              >
                {latencyResult.ok ? `● ${latencyResult.latencyMs}ms` : "● 连接失败"}
              </span>
            )}
            <button
              type="button"
              disabled={testing || !apiKeyInput.trim()}
              onClick={() => void handleTestLatency()}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                color: "var(--text)",
                cursor: testing || !apiKeyInput.trim() ? "not-allowed" : "pointer",
              }}
            >
              {testing ? tp(locale, "models.testing") : tp(locale, "models.testLatency")}
            </button>
          </div>
        </div>

        {/* 核心配置表单 */}
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* API Key 输入与保存按钮 */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                type={showKey ? "text" : "password"}
                placeholder={tp(locale, "models.apiKeyPlaceholder")}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 36px 8px 12px",
                  fontSize: 13,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text)",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
                title={showKey ? "Hide" : "Show"}
              >
                {showKey ? "👁️" : "🔒"}
              </button>
            </div>

            <button
              type="submit"
              disabled={saving || !apiKeyInput.trim()}
              style={{
                padding: "8px 18px",
                fontSize: 13,
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: saving || !apiKeyInput.trim() ? "not-allowed" : "pointer",
                opacity: saving || !apiKeyInput.trim() ? 0.6 : 1,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {saving ? tp(locale, "models.connecting") : tp(locale, "models.saveAndConnect")}
            </button>
          </div>

          {/* 协议与高级参数 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span>{tp(locale, "models.protocol")}:</span>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="litta-protocol"
                  value="openai-completions"
                  checked={protocol === "openai-completions"}
                  onChange={() => setProtocol("openai-completions")}
                />
                <span>{tp(locale, "models.protoOpenAI")}</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="litta-protocol"
                  value="anthropic-messages"
                  checked={protocol === "anthropic-messages"}
                  onChange={() => setProtocol("anthropic-messages")}
                />
                <span>{tp(locale, "models.protoAnthropic")}</span>
              </label>
            </div>

            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              <span>{tp(locale, "models.baseUrl")}: </span>
              <code style={{ background: "var(--bg)", padding: "1px 5px", borderRadius: 4 }}>
                {littaConfig?.baseUrl || "https://llms.litta.cn/"}
              </code>
            </div>
          </div>
        </form>

        {/* 动态模型列表管理 */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
              {tp(locale, "models.availableModels", { count: models.length })}
            </span>
            <button
              type="button"
              disabled={discovering || !apiKeyInput.trim()}
              onClick={() => void handleDiscover()}
              style={{
                padding: "4px 12px",
                fontSize: 12,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                color: "var(--accent)",
                cursor: discovering || !apiKeyInput.trim() ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 500,
              }}
            >
              <span>🔄</span>
              <span>{discovering ? tp(locale, "models.fetching") : tp(locale, "models.fetchModels")}</span>
            </button>
          </div>

          {models.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {models.map((m) => (
                <div
                  key={m.id}
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.name || m.id}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span>{m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k ctx` : "32k ctx"}</span>
                      {m.reasoning && (
                        <span style={{ background: "rgba(168,85,247,0.15)", color: "#a855f7", padding: "0 4px", borderRadius: 3, fontSize: 10 }}>
                          Reasoning
                        </span>
                      )}
                    </div>
                  </div>
                  <ConfigSwitch
                    checked={m.enabled !== false}
                    label={`Toggle ${m.name || m.id}`}
                    onChange={(checked) => void handleToggleModel(m.id, checked)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "16px 0", textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              暂未拉取模型，输入 API Key 后点击右上角「从网关拉取最新模型」
            </div>
          )}
        </div>
      </div>

          {/* 折叠区域：其他模型服务商 (上游标准 ModelsConfig) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              onClick={() => setShowOtherProviders((v) => !v)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: 0,
              }}
            >
              <span>{showOtherProviders ? "▼" : "▶"}</span>
              <span>{tp(locale, "models.otherProviders")} (OpenAI, Anthropic, Custom endpoints...)</span>
            </button>

            {showOtherProviders && (
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", height: 520 }}>
                <ModelsConfig embedded onClose={onClose} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
