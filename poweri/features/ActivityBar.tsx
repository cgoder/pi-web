import { useCallback } from "react";

export type ActivityId = "sessions" | "files" | "stats";

const BTN = 40;
const BAR_W = 48;

function SessionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

const ITEMS: Array<{ id: ActivityId; label: string; icon: () => React.ReactNode }> = [
  { id: "sessions", label: "会话", icon: SessionIcon },
  { id: "files", label: "文件", icon: FileIcon },
  { id: "stats", label: "统计", icon: StatsIcon },
];

/**
 * PowerI 活动栏（F1）：最左侧图标列，与右侧/侧边面板互斥切换。
 * 纯展示 + 回调，不含任何面板状态；激活态由父组件（AppShell）计算后传入。
 */
export function ActivityBar({
  active,
  onSelect,
}: {
  active: ActivityId | null;
  onSelect: (id: ActivityId) => void;
}) {
  const handleClick = useCallback(
    (id: ActivityId) => () => onSelect(id),
    [onSelect],
  );
  return (
    <div
      role="tablist"
      aria-label="活动栏"
      style={{
        width: BAR_W,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        paddingTop: "calc(4px + env(safe-area-inset-top))",
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border)",
        zIndex: 210,
        userSelect: "none",
      }}
    >
      {ITEMS.map((item) => {
        const on = active === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            title={item.label}
            aria-label={item.label}
            onClick={handleClick(item.id)}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: BTN,
              height: BTN,
              padding: 0,
              background: on ? "var(--bg-selected)" : "transparent",
              border: "none",
              borderRadius: 8,
              color: on ? "var(--text)" : "var(--text-muted)",
              cursor: "pointer",
              transition: "color 0.12s, background 0.12s",
            }}
            onMouseEnter={(e) => {
              if (!on) {
                e.currentTarget.style.color = "var(--text)";
                e.currentTarget.style.background = "var(--bg-hover)";
              }
            }}
            onMouseLeave={(e) => {
              if (!on) {
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            {/* active 指示条 */}
            {on && (
              <span
                style={{
                  position: "absolute",
                  left: -6,
                  top: 10,
                  bottom: 10,
                  width: 3,
                  borderRadius: 2,
                  background: "var(--accent)",
                }}
              />
            )}
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
