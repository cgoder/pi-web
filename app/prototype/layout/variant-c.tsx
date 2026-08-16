"use client";

// PROTOTYPE — Variant C: VS Code-style activity bar workspace.
// 最左活动栏图标列（会话/文件/Git/统计/设置）+ 第二栏上下文面板（随图标切换）
// + 对话区；无常驻右抽屉，面板信息都进活动栏体系；顶栏收纳 tab。
// 密度最高、最"工具"的一版；会话树/右键菜单/拖拽排序复用。

import { useState } from "react";
import { SessionTree, MessageThread, Composer, ContextMenu, ResizeHandle, usePersistedWidth, SESSION_MENU, GitPanelDraft, StatsPanelDraft } from "./shared";

const ACTIVITY = [
  { key: "sessions", icon: "☰", label: "会话" },
  { key: "files", icon: "🗀", label: "文件" },
  { key: "git", icon: "⎇", label: "Git" },
  { key: "stats", icon: "◫", label: "统计" },
] as const;
type ActivityKey = (typeof ACTIVITY)[number]["key"];

export function VariantC() {
  const [active, setActive] = useState<ActivityKey>("sessions");
  const [panelW, setPanelW] = usePersistedWidth("plt:c:panel", 300, 180, 480);
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <div className="plt-root">
      {/* ===== 活动栏 ===== */}
      <nav className="plt-activity">
        {ACTIVITY.map((a) => (
          <button
            key={a.key}
            className={`plt-activity-btn${active === a.key ? " on" : ""}`}
            title={a.label}
            onClick={() => { setActive(a.key); setCollapsed(false); }}
          >
            {a.icon}
          </button>
        ))}
        <div className="grow" />
        <button className="plt-activity-btn" title="设置">⚙</button>
      </nav>

      {/* ===== 上下文面板（可折叠、宽度记忆） ===== */}
      {!collapsed && (
        <>
          <aside className="plt-col" style={{ width: panelW, borderRight: "1px solid var(--border)" }}>
            <div className="plt-col-head">
              <span className="plt-col-title">{ACTIVITY.find((a) => a.key === active)?.label}</span>
              <div className="plt-col-actions">
                <button className="plt-icon-btn" onClick={() => setCollapsed(true)}>«</button>
              </div>
            </div>
            <div className="plt-col-scroll grow">
              {active === "sessions" && (
                <SessionTree onContext={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }} />
              )}
              {active === "files" && (
                <div className="plt-tree">
                  {["src-tauri/", "components/", "app/", "lib/", "docs/"].map((d) => (
                    <div key={d} className="plt-sess"><span className="plt-sess-name">{d}</span></div>
                  ))}
                </div>
              )}
              {active === "git" && <GitPanelDraft />}
              {active === "stats" && <StatsPanelDraft />}
            </div>
          </aside>
          <ResizeHandle onDrag={(dx) => setPanelW(panelW + dx)} />
        </>
      )}
      {collapsed && (
        <button className="plt-drawer-tab" onClick={() => setCollapsed(false)}>▶</button>
      )}

      {/* ===== 对话区 ===== */}
      <main className="plt-col grow">
        <div className="plt-tabs">
          <span className="plt-tab active">三栏布局原型设计</span>
          <span className="plt-tab">main.rs</span>
          <span className="plt-tab">+</span>
        </div>
        <div className="plt-col-scroll grow"><MessageThread /></div>
        <Composer />
      </main>

      {/* ===== 底部状态栏 ===== */}
      <footer className="plt-statusbar">
        <span>claude-sonnet</span>
        <span>desktop ⎇</span>
        <span className="grow" />
        <span>68% ctx</span>
        <span>$0.42</span>
      </footer>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={SESSION_MENU} onClose={() => setMenu(null)} />}
    </div>
  );
}
