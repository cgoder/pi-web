"use client";

// PROTOTYPE — Variant A: Codex-style three-column workspace.
// 左: 项目+会话树（可折叠、宽度记忆） | 中: 对话 | 右: 抽屉（Git/统计，常驻挂载、可钉住、宽度记忆）
// 会话历史抽屉 = 左栏头部按钮打开的浮层；右键菜单；拖拽排序示意；底部状态栏占位。

import { useState } from "react";
import {
  SessionTree, MessageThread, Composer, ContextMenu, ResizeHandle,
  usePersistedWidth, SESSION_MENU, GitPanelDraft, StatsPanelDraft,
  type MenuItem,
} from "./shared";
import type { MockSession } from "./data";

export function VariantA() {
  const [leftW, setLeftW] = usePersistedWidth("plt:a:left", 260, 140, 440);
  const [drawerW, setDrawerW] = usePersistedWidth("plt:a:drawer", 320, 200, 560);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [drawerTab, setDrawerTab] = useState<"git" | "stats">("git");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [menuSession, setMenuSession] = useState<MockSession | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);

  return (
    <div className="plt-root">
      {/* ===== 左栏 ===== */}
      <aside className="plt-col" style={{ width: leftCollapsed ? 0 : leftW, borderRight: "1px solid var(--border)" }}>
        {!leftCollapsed && (
          <div className="plt-col-inner">
            <div className="plt-col-head">
              <span className="plt-col-title">工作区</span>
              <div className="plt-col-actions">
                <button className="plt-icon-btn" title="会话历史" onClick={() => setHistoryOpen(true)}>🕘</button>
                <button className="plt-icon-btn" title="新建会话">＋</button>
              </div>
            </div>
            <div className="plt-col-scroll">
              <SessionTree
                onSelect={() => setMenu(null)}
                onContext={(e, s) => {
                  e.preventDefault();
                  setMenuSession(s);
                  setMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: e.clientY });
                }}
              />
            </div>
          </div>
        )}
      </aside>
      <ResizeHandle onDrag={(dx) => !leftCollapsed && setLeftW(leftW + dx)} />

      {/* ===== 中栏：对话 ===== */}
      <main className="plt-col grow">
        <div className="plt-tabs">
          <span className="plt-tab active">对话 · 三栏布局原型设计</span>
          <span className="plt-tab">GitPanel.tsx</span>
          <span className="plt-tab">+</span>
        </div>
        <div className="plt-col-scroll grow">
          <MessageThread />
        </div>
        <Composer />
      </main>

      {/* ===== 右栏：抽屉（常驻挂载，0 宽折叠） ===== */}
      {drawerCollapsed ? (
        <button className="plt-drawer-tab" onClick={() => setDrawerCollapsed(false)}>◀</button>
      ) : (
        <>
          <ResizeHandle onDrag={(dx) => setDrawerW(drawerW - dx)} />
          <aside className="plt-col" style={{ width: drawerW, borderLeft: "1px solid var(--border)" }}>
            <div className="plt-col-head">
              <div className="plt-drawer-tabs">
                <button className={`plt-tab ${drawerTab === "git" ? "active" : ""}`} onClick={() => setDrawerTab("git")}>Git</button>
                <button className={`plt-tab ${drawerTab === "stats" ? "active" : ""}`} onClick={() => setDrawerTab("stats")}>统计</button>
              </div>
              <div className="plt-col-actions">
                <button className={`plt-icon-btn${pinned ? " on" : ""}`} title={pinned ? "取消钉住" : "钉住"} onClick={() => setPinned(!pinned)}>📌</button>
                <button className="plt-icon-btn" title="折叠" onClick={() => setDrawerCollapsed(true)}>»</button>
              </div>
            </div>
            <div className="plt-col-scroll grow">
              {drawerTab === "git" ? <GitPanelDraft /> : <StatsPanelDraft />}
            </div>
          </aside>
        </>
      )}

      {/* ===== 底部状态栏占位（F3 工单内容） ===== */}
      <footer className="plt-statusbar">
        <span>模型 claude-sonnet</span>
        <span>思考 中</span>
        <span className="grow" />
        <span>上下文 68%</span>
        <span>$0.42</span>
        <span>缓存 41%</span>
      </footer>

      {/* ===== 会话历史抽屉（浮层） ===== */}
      {historyOpen && (
        <div className="plt-overlay" onClick={() => setHistoryOpen(false)}>
          <div className="plt-history" onClick={(e) => e.stopPropagation()}>
            <div className="plt-col-head">
              <span className="plt-col-title">会话历史</span>
              <button className="plt-icon-btn" onClick={() => setHistoryOpen(false)}>✕</button>
            </div>
            <input className="plt-search" placeholder="搜索会话…" />
            <div className="plt-history-list">
              {["今天", "昨天", "上周"].map((day) => (
                <div key={day}>
                  <div className="plt-proj">{day}</div>
                  {["修复托盘退出竞态", "三栏布局原型设计", "合并 R2 findings", "Tauri 托盘增强", "升级 UX 调研", "逆向 npx 启动"].map((n, i) => (
                    <div key={i} className="plt-sess"><span className="plt-sess-name">{n}</span><span className="plt-sess-meta">{"1" + i}条</span></div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== 右键菜单 ===== */}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={SESSION_MENU} onClose={() => setMenu(null)} />
      )}

      {/* ===== 拖拽排序示意 ===== */}
      <div className="plt-hint" style={{ position: "fixed", bottom: 40, left: 16, opacity: dragOver ? 1 : 0.5 }}>
        {dragOver ? "松手移动会话（示意）" : "拖拽会话项可排序（示意）"}
      </div>
    </div>
  );
}
