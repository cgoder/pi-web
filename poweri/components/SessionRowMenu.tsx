"use client";

import { useEffect, useRef } from "react";

/**
 * 会话行的右键菜单（上游 2e87ddb1 的行菜单能力，PowerI 平面时间线版）。
 *
 * PowerI 不引入上游的项目分组树，行内 hover 按钮也不加（保持行密度）；
 * 置顶/归档/重命名/删除全部收进右键菜单，入口唯一。置顶的会话收进列表
 * 顶部「已置顶」折叠区，归档的收进侧栏底部「已归档 (N)」入口。
 *
 * 模式与 FileContextMenu 相同：fixed 定位 + 点击外关闭 + Esc + 滚动关闭。
 */

export interface SessionRowMenuAction {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  separatorBefore?: boolean;
  onSelect: () => void;
}

interface SessionRowMenuProps {
  x: number;
  y: number;
  actions: SessionRowMenuAction[];
  onClose: () => void;
}

export function SessionRowMenu({ x, y, actions, onClose }: SessionRowMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleScroll = () => onClose();
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 230),
    top: Math.min(y, window.innerHeight - 40 - actions.length * 30),
    zIndex: 9999,
    minWidth: 200,
    background: "var(--bg-panel)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    padding: 4,
    fontSize: 12,
  };

  return (
    <div ref={ref} role="menu" style={style} onClick={(e) => e.stopPropagation()}>
      {actions.map((action) => (
        <div key={action.id}>
          {action.separatorBefore && <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />}
          <button
            type="button"
            role="menuitem"
            disabled={action.disabled}
            title={action.disabled ? action.disabledReason : undefined}
            onClick={() => {
              onClose();
              action.onSelect();
            }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "7px 10px",
              background: "none", border: "none", borderRadius: 4,
              color: action.danger ? "#ef4444" : "var(--text)",
              cursor: action.disabled ? "not-allowed" : "pointer",
              fontSize: 12, textAlign: "left",
              opacity: action.disabled ? 0.45 : 1,
            }}
            onMouseEnter={(e) => { if (!action.disabled) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            {action.label}
          </button>
        </div>
      ))}
    </div>
  );
}

/** 菜单动作的 i18n key（上游 SESSION_ACTION_LABEL_KEYS 的子集：PowerI 本轮接的部分）。 */
export const SESSION_ROW_MENU_LABEL_KEYS = {
  pin: "sidebar.pin",
  unpin: "sidebar.unpin",
  rename: "sidebar.rename",
  archive: "sidebar.archive",
  unarchive: "sidebar.unarchive",
  delete: "sidebar.delete",
} as const;
