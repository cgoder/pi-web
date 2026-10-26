"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useTheme, type ThemePreference } from "@/hooks/useTheme";
import { sendAgentCommand } from "@/lib/agent-client";
import type { ProjectTrustStatus, ToolSettingsResponse } from "@/lib/api-types";
import { focusModalPanel, listenForPanelEscape } from "@/lib/stacked-dialog";
import {
  setLastSettingsSection,
  settingsSectionRequiresProject,
  type SettingsSection,
} from "@/lib/settings-navigation";
import { PowerIPluginsConfig } from "@/poweri/features/plugins/PowerIPluginsConfig";
import { ConfigButton, ConfigSwitch } from "@/components/SettingsUi";
import {
  CHAT_CONTENT_WIDTH_DEFAULT,
  CHAT_CONTENT_WIDTH_MAX,
  CHAT_CONTENT_WIDTH_MIN,
  CHAT_CONTENT_FONT_SIZE_DEFAULT,
  CHAT_CONTENT_FONT_SIZE_MAX,
  CHAT_CONTENT_FONT_SIZE_MIN,
  useChatAppearance,
} from "@/hooks/useChatAppearance";
import {
  isThinkingExpandedByDefault,
  setThinkingExpandedByDefault,
} from "@/lib/thinking-expansion-preference";
import { setEnterSendMode, useEnterSendMode, type EnterSendMode } from "@/hooks/useEnterSendMode";
import { StatsPanel } from "@/poweri/features/StatsPanel";
import { SkillsMarketView } from "@/poweri/features/skills/SkillsMarketView";
import { ModelsConfig } from "@/components/ModelsConfig";
import { AgentsConfig } from "@/components/AgentsConfig";
import { McpConfig } from "@/components/McpConfig";
import { tp } from "@/poweri/lib/i18n";
import { VersionUpdateSection } from "@/poweri/components/VersionUpdateSection";
import { AppUpdateDot, useAppUpdateTitle } from "@/poweri/components/AppUpdateDot";

export type PowerISettingsSection = SettingsSection | "usage";

interface Props {
  cwd: string | null;
  sessionId: string | null;
  initialSection: PowerISettingsSection;
  onClose: () => void;
  onSessionReloaded: () => void;
  quoteSelectionEnabled?: boolean;
  onQuoteSelectionChange?: (enabled: boolean) => void;
  /** 页面对 `cwd` 的信任决策；Settings › MCP 在它变化后重读（如刚信任完）。 */
  projectTrust?: ProjectTrustStatus | null;
  /** 打开页面的信任对话框（浮在设置之上）；Settings › MCP 的信任提示借用它。 */
  onOpenTrustDialog?: () => void;
  /** Settings › MCP 新增了项目服务器，改动了 `cwd` 的信任（可能顺带信任了新目录）。 */
  onProjectTrustChanged?: (cwd: string, status: ProjectTrustStatus) => void;
}

export function SettingsSectionIcon({
  section,
  size = 16,
  strokeWidth = 1.8,
}: {
  section: PowerISettingsSection;
  size?: number;
  strokeWidth?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "settings-section-icon",
  };

  if (section === "general") {
    return (
      <svg {...common}>
        <path d="M20 7h-9M14 17H5" />
        <circle cx="7" cy="7" r="3" />
        <circle cx="17" cy="17" r="3" />
      </svg>
    );
  }
  if (section === "models") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" />
      </svg>
    );
  }
  if (section === "skills") {
    return (
      <svg {...common}>
        <path d="m12 2-10 5 10 5 10-5-10-5Z" />
        <path d="m2 12 10 5 10-5M2 17l10 5 10-5" />
      </svg>
    );
  }
  if (section === "agents") {
    return (
      <svg {...common} className="settings-section-icon is-agent">
        <rect x="5" y="7" width="14" height="11" rx="2" />
        <path d="M9 11h.01M15 11h.01M9 15h6M12 7V4M10 4h4" />
      </svg>
    );
  }
  if (section === "mcp") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="7" rx="2" />
        <rect x="3" y="14" width="18" height="7" rx="2" />
        <path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6" />
      </svg>
    );
  }
  if (section === "usage") {
    return (
      <svg {...common}>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M9 7V2M15 7V2M6 13V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5a6 6 0 0 1-12 0ZM12 19v3" />
    </svg>
  );
}

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === "light") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (preference === "dark") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
    );
  }
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function GeneralSettings({ sessionId, onSessionReloaded, quoteSelectionEnabled = false, onQuoteSelectionChange }: Pick<Props, "sessionId" | "onSessionReloaded" | "quoteSelectionEnabled" | "onQuoteSelectionChange">) {
  const { locale, setLocale, supportedLocales, t } = useI18n();
  const { preference, setThemePreference } = useTheme();
  const { width: chatContentWidth, setWidth: setChatContentWidth, fontSize, setFontSize } = useChatAppearance();
  const enterSendMode = useEnterSendMode();
  const [shellSettings, setShellSettings] = useState<ToolSettingsResponse | null>(null);
  const [shellSaving, setShellSaving] = useState(false);
  const [shellError, setShellError] = useState<string | null>(null);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [cacheMissNotices, setCacheMissNotices] = useState<boolean | null>(null);
  const [cacheMissNoticesSaving, setCacheMissNoticesSaving] = useState(false);
  const [cacheMissNoticesError, setCacheMissNoticesError] = useState<string | null>(null);

  useEffect(() => {
    setThinkingExpanded(isThinkingExpandedByDefault());
  }, []);
  const themeOptions: { id: ThemePreference; label: string }[] = [
    { id: "light", label: t("settings.themeLight") },
    { id: "dark", label: t("settings.themeDark") },
    { id: "auto", label: t("settings.themeSystem") },
  ];
  const sendKeyOptions: { id: EnterSendMode; label: string }[] = [
    { id: "enter", label: t("settings.enterSendModeEnter") },
    { id: "ctrlEnter", label: t("settings.enterSendModeCtrlEnter") },
  ];

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/tools/settings")
      .then(async (response) => {
        const data = await response.json() as ToolSettingsResponse & { error?: string };
        if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
        if (!cancelled) setShellSettings(data);
      })
      .catch((cause) => {
        if (!cancelled) setShellError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, []);

  // 上游 #1265 的 showCacheMissNotices：读全局设置，写后让当前会话重读，
  // 提示才当场出现或消失。
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/cache-miss-notices")
      .then(async (response) => {
        const data = await response.json() as { enabled?: boolean; error?: string };
        if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
        if (!cancelled) setCacheMissNotices(data.enabled === true);
      })
      .catch((cause) => {
        if (!cancelled) setCacheMissNoticesError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, []);

  const toggleCacheMissNotices = async (enabled: boolean) => {
    setCacheMissNoticesSaving(true);
    setCacheMissNoticesError(null);
    try {
      const response = await fetch("/api/cache-miss-notices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json() as { enabled?: boolean; error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setCacheMissNotices(data.enabled === true);
      if (sessionId) onSessionReloaded();
    } catch (cause) {
      setCacheMissNoticesError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCacheMissNoticesSaving(false);
    }
  };

  const togglePowerShell = async (enabled: boolean) => {
    setShellSaving(true);
    setShellError(null);
    try {
      const response = await fetch("/api/tools/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json() as ToolSettingsResponse & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setShellSettings(data);
      if (sessionId) {
        await sendAgentCommand(sessionId, { type: "reload" });
        onSessionReloaded();
      }
    } catch (cause) {
      setShellError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setShellSaving(false);
    }
  };

  return (
    <div className="settings-general">
      <h2 className="settings-general-title">{t("settings.general")}</h2>

      <section className="settings-general-section">
        <h3 className="settings-general-heading">{t("settings.appearance")}</h3>
        <p className="settings-general-description">{t("settings.appearanceDescription")}</p>
        <div role="radiogroup" aria-label={t("settings.appearance")} className="settings-theme-options">
          {themeOptions.map((option) => {
            const selected = preference === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setThemePreference(option.id)}
                className="settings-theme-option"
              >
                <ThemeIcon preference={option.id} />
                <span className="settings-theme-option-label">{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-general-section">
        <h3 className="settings-general-heading">{t("settings.typography")}</h3>
        <p className="settings-general-description">{tp(locale, "settings.typographyDescription")}</p>
        <div className="settings-chat-options">
          <div className="settings-chat-option settings-chat-range-option">
            <div className="settings-chat-range-header">
              <label htmlFor="settings-chat-content-width">{t("settings.chatContentWidth")}</label>
              <output htmlFor="settings-chat-content-width">{chatContentWidth}px</output>
              <ConfigButton
                variant="ghost"
                size="small"
                className="settings-chat-reset"
                title={t("settings.resetChatContentWidth")}
                aria-label={t("settings.resetChatContentWidth")}
                disabled={chatContentWidth === CHAT_CONTENT_WIDTH_DEFAULT}
                onClick={() => setChatContentWidth(CHAT_CONTENT_WIDTH_DEFAULT)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />
                </svg>
              </ConfigButton>
            </div>
            <input
              id="settings-chat-content-width"
              type="range"
              min={CHAT_CONTENT_WIDTH_MIN}
              max={CHAT_CONTENT_WIDTH_MAX}
              step={10}
              value={chatContentWidth}
              onChange={(event) => setChatContentWidth(Number(event.target.value))}
            />
          </div>
          <div className="settings-chat-option settings-chat-range-option">
            <div className="settings-chat-range-header">
              <label htmlFor="settings-chat-content-font-size">{t("settings.chatContentFontSize")}</label>
              <output htmlFor="settings-chat-content-font-size">{fontSize}px</output>
              <ConfigButton
                variant="ghost"
                size="small"
                className="settings-chat-reset"
                title={t("settings.resetChatContentFontSize")}
                aria-label={t("settings.resetChatContentFontSize")}
                disabled={fontSize === CHAT_CONTENT_FONT_SIZE_DEFAULT}
                onClick={() => setFontSize(CHAT_CONTENT_FONT_SIZE_DEFAULT)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />
                </svg>
              </ConfigButton>
            </div>
            <input
              id="settings-chat-content-font-size"
              type="range"
              min={CHAT_CONTENT_FONT_SIZE_MIN}
              max={CHAT_CONTENT_FONT_SIZE_MAX}
              step={1}
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
            />
          </div>
        </div>
      </section>

      <section className="settings-general-section">
        <h3 className="settings-general-heading">{t("settings.chat")}</h3>
        <div className="settings-chat-options">
          {/* 发送键（上游 5df8278a）：吸收逻辑开关，控件用 PowerI 既有的二选一版式。 */}
          <div
            className="settings-chat-option settings-chat-switch-option"
            role="radiogroup"
            aria-label={t("settings.enterSendMode")}
          >
            <span>{t("settings.enterSendMode")}</span>
            <div className="settings-send-mode-options">
              {sendKeyOptions.map((option) => (
                <label key={option.id} className="settings-send-mode-option">
                  <input
                    type="radio"
                    name="settings-enter-send-mode"
                    value={option.id}
                    checked={enterSendMode === option.id}
                    onChange={() => setEnterSendMode(option.id)}
                    className="sr-only"
                  />
                  <span className="settings-send-mode-label">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="settings-chat-option settings-chat-switch-option">
            <span>{t("settings.thinkingExpandedDefault")}</span>
            <ConfigSwitch
              checked={thinkingExpanded}
              label={t("settings.thinkingExpandedDefault")}
              onChange={(enabled) => {
                setThinkingExpandedByDefault(enabled);
                setThinkingExpanded(enabled);
              }}
            />
          </div>
          <div className="settings-chat-option settings-chat-switch-option">
            <span>{t("settings.cacheMissNotices")}</span>
            <ConfigSwitch
              checked={cacheMissNotices === true}
              loading={(cacheMissNotices === null && !cacheMissNoticesError) || cacheMissNoticesSaving}
              label={t("settings.cacheMissNotices")}
              describedBy="settings-cache-miss-notices-description"
              onChange={(enabled) => void toggleCacheMissNotices(enabled)}
            />
          </div>
          {onQuoteSelectionChange && (
            <div className="settings-chat-option settings-chat-switch-option">
              <span>{t("settings.quoteSelection")}</span>
              <ConfigSwitch
                checked={quoteSelectionEnabled}
                label={t("settings.quoteSelection")}
                onChange={onQuoteSelectionChange}
              />
            </div>
          )}
        </div>
        <p id="settings-cache-miss-notices-description" className="settings-general-description">{t("settings.cacheMissNoticesDescription")}</p>
        {cacheMissNoticesError && <p role="alert" className="settings-general-error">{cacheMissNoticesError}</p>}
      </section>

      {shellSettings?.isWindows && (
        <section className="settings-general-section">
          <h3 className="settings-general-heading">{t("settings.shellTool")}</h3>
          <p className="settings-general-description">{t("settings.shellToolDescription")}</p>
          <div className="settings-shell-option">
            <span>{t("settings.usePowerShell")}</span>
            <ConfigSwitch
              checked={shellSettings.powerShellEnabled}
              loading={shellSaving}
              label={t("settings.usePowerShell")}
              onChange={(enabled) => void togglePowerShell(enabled)}
            />
          </div>
          {shellError && <p role="alert" className="settings-general-error">{shellError}</p>}
        </section>
      )}

      <section className="settings-general-section">
        <h3 className="settings-general-heading">{t("common.language")}</h3>
        <p className="settings-general-description">{t("settings.languageDescription")}</p>
        <div role="radiogroup" aria-label={t("common.language")} className="settings-language-options">
          {supportedLocales.map((plugin) => {
            const selected = locale === plugin.id;
            return (
              <button
                key={plugin.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setLocale(plugin.id as typeof locale)}
                className="settings-language-option"
              >
                <span className="settings-language-radio">
                  {selected && <span className="settings-language-radio-dot" />}
                </span>
                <span className="settings-language-label">{plugin.label}</span>
                <span className="settings-language-code">{plugin.id}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* PROTOTYPE(version-update): 底部 slot（变体 A/C 挂这里） */}
      {/* 版本与更新（胜出设计 A'：行内版本行 + 手动检查），详见 VersionUpdateSection.tsx */}
      <VersionUpdateSection />
    </div>
  );
}

export function SettingsPanel({ cwd, sessionId, initialSection, onClose, onSessionReloaded, quoteSelectionEnabled, onQuoteSelectionChange, projectTrust, onOpenTrustDialog, onProjectTrustChanged }: Props) {
  const { t, locale } = useI18n();
  const [section, setSection] = useState<PowerISettingsSection>(initialSection);
  const [mountedSections, setMountedSections] = useState<ReadonlySet<PowerISettingsSection>>(
    () => new Set([section]),
  );
  // 更新计数(plugins 包更新 / skills 订阅源+包技能):
  // 初始自 fetch(普通模式,命中服务端 TTL 缓存零网络)供未挂载 section 的 tab 角标;
  // 子面板挂载后 force 检测经 onUpdateCount 回调覆盖为最新值。
  const [pluginUpdateCount, setPluginUpdateCount] = useState(0);
  const [skillUpdateCount, setSkillUpdateCount] = useState(0);
  // 应用本体更新（poweri-web）：入口圆点/常规 tab 圆点与 title 共用一份数据源
  const appUpdateTitle = useAppUpdateTitle();

  // 哪些分区需要项目由 lib/settings-navigation.ts 统一决定（上游 8716e708）。
  // MCP 不在其中：没有项目时它只列全局 mcp.json，有项目再加一组。
  const sections: { id: PowerISettingsSection; label: string; requiresProject: boolean }[] = ([
    { id: "general", label: t("settings.general") },
    { id: "models", label: t("common.models") },
    { id: "skills", label: t("common.skills") },
    { id: "agents", label: t("common.agents") },
    { id: "plugins", label: t("common.plugins") },
    { id: "mcp", label: t("settings.mcp") },
    { id: "usage", label: tp(locale, "common.data") },
  ] as const).map((item) => ({
    ...item,
    requiresProject: item.id === "usage" ? false : settingsSectionRequiresProject(item.id),
  }));

  useEffect(() => {
    if (initialSection !== "usage") {
      setLastSettingsSection(initialSection as SettingsSection);
    }
  }, [initialSection]);

  // 气泡阶段关闭，且只在这条 Esc 没被更近的东西先处理时（菜单、嵌套弹窗）。
  // 浮在设置之上的信任对话框在捕获阶段取走 Esc 并停止传播，一次 Esc 只关那一层。
  // IME 组字时按 Esc 是取消候选词：交给输入法，不关面板——McpConfig 的添加草稿在这里。
  useEffect(() => listenForPanelEscape(document, onClose), [onClose]);

  // 打开时焦点进入面板、关闭时还给开启者。焦点留在聊天输入框上时（裸 `/mcp` 就是从那里开的面板），
  // Esc 会先被 ChatInput 当成 Stop：流式运行被中断，面板还开着。走布局阶段，
  // 让开启者在本体分区各自的 autoFocus 搜索框之前读走。
  const dialogRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => focusModalPanel(document, dialogRef.current, {
    restoreTextEntry: !window.matchMedia?.("(pointer: coarse)").matches,
  }), []);

  useEffect(() => {
    if (cwd || !settingsSectionRequiresProject(section as SettingsSection)) return;
    setSection("general");
    setMountedSections((current) => new Set(current).add("general"));
    setLastSettingsSection("general");
  }, [cwd, section]);

  useEffect(() => {
    if (!cwd) return;
    let cancelled = false;
    void (async () => {
      try {
        const [pkgRes, skillRes] = await Promise.all([
          fetch(`/poweri/api/plugins/updates?cwd=${encodeURIComponent(cwd)}`),
          fetch("/poweri/api/skills/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "check", mode: "auto" }),
          }),
        ]);
        const pkgData = pkgRes.ok ? ((await pkgRes.json()) as { summary?: { outdated?: number } } | null) : null;
        const skillData = skillRes.ok ? ((await skillRes.json()) as { updates?: Array<{ updateState?: string }> } | null) : null;
        if (!cancelled && pkgData?.summary && typeof pkgData.summary.outdated === "number") {
          setPluginUpdateCount(pkgData.summary.outdated);
        }
        if (!cancelled && Array.isArray(skillData?.updates)) {
          setSkillUpdateCount(
            skillData.updates.filter(
              (u) => u.updateState === "update-available" || u.updateState === "conflict",
            ).length,
          );
        }
      } catch {
        // 角标是增强提示,检测失败静默
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const activateSection = (nextSection: PowerISettingsSection) => {
    setMountedSections((current) => new Set(current).add(nextSection));
    setSection(nextSection);
    if (nextSection !== "usage") {
      setLastSettingsSection(nextSection as SettingsSection);
    }
  };

  const sectionHost = (id: PowerISettingsSection, content: ReactNode) =>
    mountedSections.has(id) ? (
      <div
        key={id}
        hidden={section !== id}
        className="settings-section-host"
        style={id === "usage" ? { height: "100%", overflowY: "auto" } : undefined}
      >
        {content}
      </div>
    ) : null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("settings.title")}
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="settings-dialog-backdrop"
    >
      <div className="settings-dialog-surface">
        <div className="settings-dialog-header">
          <strong className="settings-dialog-title">{t("settings.title")}</strong>
          <select
            aria-label={t("settings.title")}
            value={section}
            onChange={(event) => activateSection(event.target.value as PowerISettingsSection)}
            className="settings-mobile-section-picker"
          >
            {sections.map((item) => (
              <option key={item.id} value={item.id} disabled={item.requiresProject && !cwd}>
                {item.label}
              </option>
            ))}
          </select>
          <nav aria-label={t("settings.title")} className="settings-section-tabs">
            {sections.map((item) => {
              const selected = section === item.id;
              const disabled = item.requiresProject && !cwd;
              const badgeCount =
                item.id === "plugins" ? pluginUpdateCount : item.id === "skills" ? skillUpdateCount : 0;
              // 常规 tab：应用本体有新版时加圆点示意（与侧栏设置按钮同数据源）
              const generalAppUpdate = item.id === "general" && appUpdateTitle != null;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="settings-section-tab"
                  disabled={disabled}
                  title={
                    disabled
                      ? t("settings.projectRequired")
                      : generalAppUpdate
                        ? appUpdateTitle!
                        : item.id === "plugins" || item.id === "skills"
                          ? tp(locale, "settings.updatesBadgeTitle", { p: pluginUpdateCount, s: skillUpdateCount })
                          : item.label
                  }
                  aria-current={selected ? "page" : undefined}
                  onClick={() => activateSection(item.id)}
                >
                  <SettingsSectionIcon section={item.id} />
                  <span>{item.label}</span>
                  {!disabled && item.id === "general" && <AppUpdateDot />}
                  {!disabled && badgeCount > 0 && (
                    <span
                      style={{
                        flexShrink: 0,
                        minWidth: 14,
                        height: 14,
                        padding: "0 4px",
                        borderRadius: 7,
                        background: "#3b82f6",
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 600,
                        lineHeight: "14px",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={onClose}
            title={t("i18n.close")}
            aria-label={t("i18n.close")}
            className="config-close-button settings-dialog-close"
          >
            ×
          </button>
        </div>

        <main className="settings-dialog-main">
          {sectionHost("general", <GeneralSettings sessionId={sessionId} onSessionReloaded={onSessionReloaded} quoteSelectionEnabled={quoteSelectionEnabled} onQuoteSelectionChange={onQuoteSelectionChange} />)}
          {sectionHost("models", <ModelsConfig embedded cwd={cwd} onClose={onClose} />)}
          {sectionHost(
          "skills",
          <SkillsMarketView
            cwd={cwd}
            sessionId={sessionId}
            onReloaded={onSessionReloaded}
            onClose={onClose}
            onUpdateCount={setSkillUpdateCount}
          />,
        )}
          {cwd && sectionHost("agents", <AgentsConfig embedded key={cwd} cwd={cwd} sessionId={sessionId} onClose={onClose} onReloaded={onSessionReloaded} />)}
          {cwd && sectionHost("plugins", <PowerIPluginsConfig key={cwd} cwd={cwd} sessionId={sessionId} onReloaded={onSessionReloaded} onUpdateCount={setPluginUpdateCount} />)}
          {/* 不需要项目：没有项目时只列全局 mcp.json，有项目再加一组。
              Code mode 的选择器也在这个分区里（上游 9cf95474）。 */}
          {sectionHost("mcp", <McpConfig embedded key={cwd ?? ""} cwd={cwd} trust={projectTrust} onTrustProject={onOpenTrustDialog} onProjectTrustChanged={onProjectTrustChanged} onClose={onClose} />)}
          {sectionHost("usage", <StatsPanel sessionId={sessionId} />)}
        </main>
      </div>
    </div>
  );
}
