"use client";

// PROTOTYPE — Variant B: official two-column + increments.
// 官方形态（侧栏=会话树/文件树上下分区 | 主区=TabBar+对话）不动；
// 新增：① 侧栏「会话/历史」视图切换（历史抽屉并入侧栏第二层）
// ② 右下角浮动按钮弹出的 GitPanel 浮层 ③ 底部状态栏占位。
// 宽度保持官方固定式（不引入拖拽），改动面最小。

import { useState } from "react";
import { SessionTree, MessageThread, Composer, ContextMenu, SESSION_MENU, GitPanelDraft, usePersistedWidth } from "./shared";

export function VariantB() {
  const [sideView, setSideView] = useState<"sessions" | "history">("sessions");
  const [gitOpen, setGitOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [sideW, setSideW] = usePersistedWidth("plt:b:side", 280, 200, 420);

  return (
    <div className="plt-root">
      {/* ===== 侧栏：会话/历史双视图 ===== */}
      <aside className="plt-col" style={{ width: sideW, borderRight: "1px solid var(--border)" }}>
        <div className="plt-col-head">
          <div className="plt-side-tabs">
            <button className={`plt-tab ${sideView === "sessions" ? "active" : ""}`} onClick={() => setSideView("sessions")}>会话</button>
            <button className={`plt-tab ${sideView === "history" ? "active" : ""}`} onClick={() => setSideView("history")}>历史</button>
          </div>
          <button className="plt-icon-btn">＋</button>
        </div>

        {sideView === "sessions" ? (
          <>
            <div className="plt-col-scroll">
              <SessionTree
                onContext={(e) => { e.preventDefault(); setMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: e.clientY }); }}
              />
            </div>
            <div className="plt-side-sub">
              <div className="plt-sub-title">文件</div>
              <div className="plt-file-row">src-tauri/src/main.rs</div>
              <div className="plt-file-row">components/AppShell.tsx</div>
              <div className="plt-file-row">app/prototype/layout/</div>
            </div>
          </>
        ) : (
          <div className="plt-col-scroll">
            <input className="plt-search" placeholder="搜索全部会话…" />
            <div className="plt-proj">全部项目 · 42 个会话</div>
            {["pi-web · 托盘退出竞态修复", "pi-web · 三栏布局原型", "pi-web · 合并 R2 findings", "pi-web-desktop · Tauri 托盘", "dsh-desktop · 逆向 npx 启动"].map((n, i) => (
              <div key={i} className="plt-sess"><span className="plt-sess-name">{n}</span><span className="plt-sess-meta">12/6</span></div>
            ))}
          </div>
        )}
      </aside>

      {/* ===== 主区 ===== */}
      <main className="plt-col grow">
        <div className="plt-tabs">
          <span className="plt-tab active">对话 · 三栏布局原型设计</span>
          <span className="plt-tab">+</span>
        </div>
        <div className="plt-col-scroll grow"><MessageThread /></div>
        <Composer />
      </main>

      {/* ===== 浮动 GitPanel ===== */}
      <button className="plt-fab" onClick={() => setGitOpen(!gitOpen)}>{gitOpen ? "✕" : "⎇"}</button>
      {gitOpen && (
        <div className="plt-fab-panel">
          <GitPanelDraft />
        </div>
      )}

      {/* ===== 底部状态栏占位 ===== */}
      <footer className="plt-statusbar">
        <span>模型 claude-sonnet</span>
        <span className="grow" />
        <span>上下文 68%</span>
        <span>$0.42</span>
      </footer>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={SESSION_MENU} onClose={() => setMenu(null)} />}
    </div>
  );
}
