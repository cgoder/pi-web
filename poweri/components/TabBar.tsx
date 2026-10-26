"use client";

import { useEffect, useRef, useState } from "react";
import { getFileIcon } from "@/components/FileIcons";
import { useI18n } from "@/hooks/useI18n";
import { tp } from "@/poweri/lib/i18n";
import { FileContextMenu } from "./FileContextMenu";
import type { FileViewerDisplayMode, FileViewerState } from "@/lib/file-viewer-state";

export interface Tab {
  id: string;
  label: string;
  filePath: string;
  sourceSessionId?: string | null;
  initialDisplayMode?: FileViewerDisplayMode;
  viewerState?: FileViewerState;
  viewerRevision?: number;
}

interface Props {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab }: Props) {
  const { t, locale } = useI18n();
  const [hoveredClose, setHoveredClose] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ filePath: string; x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef(new Map<string, HTMLDivElement>());

  // 横向滚动条被隐藏（上游 globals.css 的 .tabbar-scroll），所以纵向滚轮在这里
  // 改成横向平移。非 passive：位移发生时页面不得跟着滚（上游 f4adfd04 / #1303）。
  // 隐藏滚动条与接管滚轮是一对，只做一半会让鼠标用户彻底没法滚。
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const onWheel = (event: WheelEvent) => {
      // 触控板横扫本来就带 deltaX，交给浏览器；未溢出时也不拦，页面照常滚。
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX) || list.scrollWidth <= list.clientWidth) return;
      event.preventDefault();
      // deltaMode：0 像素 / 1 行（Firefox）/ 2 页。
      list.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1);
    };
    list.addEventListener("wheel", onWheel, { passive: false });
    return () => list.removeEventListener("wheel", onWheel);
  }, []);

  // 新开/切换的标签滚入视野。只调 scrollLeft：scrollIntoView 会连带滚动
  // 标签条周围的面板，把用户正在看的区域顶走。
  useEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!list || !tab) return;
    const strip = list.getBoundingClientRect();
    const { left, right } = tab.getBoundingClientRect();
    if (left < strip.left) list.scrollLeft -= strip.left - left;
    else if (right > strip.right) list.scrollLeft += right - strip.right;
  }, [activeTabId, tabs.length]);

  // 焦点在要关的标签里时（键盘用户按关闭按钮、或在标签上按中键），标签消失
  // 后焦点会掉回 body，连续关多个标签就丢了位置。所以先取同一个标签所覆盖的
  // 相邻项（优先前一个，关最后一个时取新的最后一个），关掉后再把焦点交回去。
  // 焦点本来在别处（输入框、其它面板）时不动它。
  const handleClose = (tabId: string, index: number) => {
    const hadFocus = tabsRef.current.get(tabId)?.contains(document.activeElement) ?? false;
    const focusTargetId = hadFocus ? (tabs[index - 1]?.id ?? tabs[index + 1]?.id ?? null) : null;
    onCloseTab(tabId);
    if (!focusTargetId) return;
    // 等下一次渲染把这一项真正移除，否则 focus 会被随后的 DOM 变更抹掉。
    requestAnimationFrame(() => {
      tabsRef.current.get(focusTargetId)?.focus({ preventScroll: true });
    });
  };

  // 方向键移动选中项与焦点（roving tabindex 的配套）。只接当前标签自身的
  // 按键：关闭按钮里的 Enter/Space 会冒泡到这里，不能劫持。
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, tab: Tab) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectTab(tab.id);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.findIndex((item) => item.id === tab.id);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[next];
    if (!nextTab) return;
    onSelectTab(nextTab.id);
    tabsRef.current.get(nextTab.id)?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={tp(locale, "tabBar.label")}
      className="tabbar-scroll"
      style={{
        // 标签项填满滚动视口，而不是各自写死 36px：一旦溢出，应用自带的
        // 10px（触控 6px）滚动条要在条内占高度，贴底的 36px 标签项会被推过
        // 条顶、顶部被裁掉且滚不回来（上游 bf0730c1 / #1225）。
        // 滚动条外观现在由 .tabbar-scroll 隐掉，条高恒定 36px 不再跳动。
        display: "flex",
        alignItems: "stretch",
        background: "var(--bg-panel)",
        overflowX: "auto",
        overflowY: "hidden",
        flexShrink: 0,
        height: 36,
      }}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            ref={(node) => {
              if (node) tabsRef.current.set(tab.id, node);
              else tabsRef.current.delete(tab.id);
            }}
            role="tab"
            aria-label={tab.label}
            aria-selected={isActive}
            // roving tabindex：Tab 键在标签条内只停一次。无激活项时（面板刚
            // 开、activeTabId 还是空串）让第一个标签可取焦，否则整条从 Tab
            // 顺序里消失，键盘进不来。
            tabIndex={isActive || (!activeTabId && tabs[0]?.id === tab.id) ? 0 : -1}
            onKeyDown={(event) => handleTabKeyDown(event, tab)}
            onClick={() => onSelectTab(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ filePath: tab.filePath, x: e.clientX, y: e.clientY });
            }}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault();
            }}
            onAuxClick={(e) => {
              if (e.button !== 1) return;
              e.preventDefault();
              e.stopPropagation();
              handleClose(tab.id, index);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              paddingLeft: 12,
              paddingRight: 6,
              borderRight: "1px solid var(--border)",
              background: isActive ? "var(--bg)" : "var(--bg-panel)",
              cursor: "pointer",
              fontSize: 12,
              color: isActive ? "var(--text)" : "var(--text-muted)",
              whiteSpace: "nowrap",
              maxWidth: 180,
              minWidth: 80,
              flexShrink: 0,
              userSelect: "none",
              transition: "background 0.1s, color 0.1s",
            }}
          >
            <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7, display: "flex", alignItems: "center" }}>
              {getFileIcon(tab.label, 13)}
            </span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
                fontWeight: isActive ? 500 : 400,
              }}
              title={tab.filePath}
            >
              {tab.label}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); handleClose(tab.id, index); }}
              onMouseEnter={() => setHoveredClose(tab.id)}
              onMouseLeave={() => setHoveredClose(null)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 24, height: 24,
                background: hoveredClose === tab.id ? "var(--bg-hover)" : "transparent",
                border: "none",
                borderRadius: 4,
                color: hoveredClose === tab.id ? "var(--text)" : "var(--text-dim)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
                transition: "background 0.1s, color 0.1s",
              }}
               title={t("i18n.close")}
               aria-label={`${t("i18n.close")} ${tab.label}`}
            >
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </button>
          </div>
        );
      })}
      {contextMenu && (
        <FileContextMenu
          filePath={contextMenu.filePath}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
