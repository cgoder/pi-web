"use client";

// PROTOTYPE — shared display pieces for the F1 layout variants.
// Pure presentation over mock data (data.ts). Variants own their own
// layout; these only render tree/message content.

import { useEffect, useState } from "react";
import { projects, activeThread, gitDraft, statsDraft, type MockSession } from "./data";

/* ---------- session tree (renders projects → sessions, indented children) ---------- */

export function SessionTree({ onContext, onSelect }: {
  onContext?: (e: React.MouseEvent, s: MockSession) => void;
  onSelect?: (s: MockSession) => void;
}) {
  return (
    <div className="plt-tree">
      {projects.map((p) => (
        <div key={p.name}>
          <div className="plt-proj">{p.name}</div>
          {p.sessions.map((s) => (
            <div key={s.id}>
              <div
                className={`plt-sess${s.active ? " active" : ""}`}
                onClick={() => onSelect?.(s)}
                onContextMenu={(e) => onContext?.(e, s)}
              >
                <span className="plt-sess-name">{s.name}</span>
                <span className="plt-sess-meta">{s.time}</span>
              </div>
              {s.children?.map((c) => (
                <div key={c.id} className="plt-sess child"
                  onClick={() => onSelect?.(c)}
                  onContextMenu={(e) => onContext?.(e, c)}>
                  <span className="plt-sess-name">↳ {c.name}</span>
                  <span className="plt-sess-meta">{c.time}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- message thread ---------- */

export function MessageThread() {
  return (
    <div className="plt-thread">
      {activeThread.map((m, i) => (
        <div key={i} className={`plt-msg ${m.role}`}>
          <div className="plt-msg-role">
            {m.role === "user" ? "你" : m.role === "assistant" ? "Pi" : "工具"} · {m.time}
          </div>
          <div className="plt-msg-body">{m.text}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- composer (static) ---------- */

export function Composer() {
  return (
    <div className="plt-composer">
      <div className="plt-composer-row">
        <span className="plt-chip">模型 claude-sonnet</span>
        <span className="plt-chip">思考 中</span>
        <span className="plt-chip">工具 默认</span>
      </div>
      <div className="plt-composer-input">输入消息… （原型，不可发送）</div>
      <div className="plt-composer-row right">
        <span className="plt-chip dim">@ 文件</span>
        <span className="plt-chip dim">! shell</span>
        <span className="plt-chip dim">/ 命令</span>
      </div>
    </div>
  );
}

/* ---------- generic context menu ---------- */

export interface MenuItem { label?: string; danger?: boolean; sep?: boolean }
export const SESSION_MENU: MenuItem[] = [
  { label: "重命名会话" },
  { label: "Fork 新会话" },
  { label: "复制消息链接" },
  { sep: true },
  { label: "在分支中打开", sep: true },
  { label: "删除会话", danger: true },
];

export function ContextMenu({ x, y, items, onClose }: {
  x: number; y: number; items: MenuItem[]; onClose: () => void;
}) {
  return (
    <>
      <div className="plt-menu-backdrop" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="plt-menu" style={{ left: x, top: y }}>
        {items.map((it, i) =>
          it.sep ? (
            <div key={i} className="plt-menu-sep" />
          ) : (
            <div key={i} className={`plt-menu-item${it.danger ? " danger" : ""}`}
              onClick={onClose}>{it.label}</div>
          ),
        )}
      </div>
    </>
  );
}

/* ---------- resize handle + drag logic (pointer events, no deps) ---------- */

export function useDragResize(onDelta: (dx: number) => void) {
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const move = (ev: PointerEvent) => onDelta(ev.clientX - startX);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
  };
}

export function ResizeHandle({ onDrag, vertical = true }: {
  onDrag: (dx: number) => void; vertical?: boolean;
}) {
  const { onPointerDown } = useDragResize(onDrag);
  return (
    <div
      className={`plt-resize${vertical ? "" : " h"}`}
      onPointerDown={onPointerDown}
    />
  );
}

/* ---------- tiny helper for localStorage widths ---------- */

// SSR note: useState initializer runs on the server (no window), so the
// persisted value must be applied in a mount effect, not the initializer.
export function usePersistedWidth(key: string, def: number, min: number, max: number) {
  const [w, setW] = useState(def);
  useEffect(() => {
    const v = Number(localStorage.getItem(key));
    if (Number.isFinite(v)) setW(Math.min(max, Math.max(min, v)));
  }, [key, min, max]);
  const set = (v: number) => {
    const c = Math.min(max, Math.max(min, v));
    setW(c);
    localStorage.setItem(key, String(c));
  };
  return [w, set] as const;
}

/* ---------- fake git / stats panels (right drawer content) ---------- */

export function GitPanelDraft() {
  return (
    <div className="plt-drawer-body">
      <div className="plt-drawer-head">GitPanel · {gitDraft.branch}
        <span className="plt-chip">↑{gitDraft.ahead} ↓{gitDraft.behind}</span>
      </div>
      {gitDraft.changes.map((c) => (
        <div key={c.file} className="plt-git-row">
          <span className={`plt-git-status ${c.status}`}>{c.status}</span>
          <span className="plt-git-file">{c.file}</span>
        </div>
      ))}
      <div className="plt-git-actions">
        <button className="plt-btn">提交</button>
        <button className="plt-btn">推送</button>
        <button className="plt-btn ghost">生成信息</button>
      </div>
    </div>
  );
}

export function StatsPanelDraft() {
  return (
    <div className="plt-drawer-body">
      <div className="plt-drawer-head">上下文 / 统计</div>
      <div className="plt-stats">
        <div><b>{statsDraft.tokens}</b><span>tokens</span></div>
        <div><b>{statsDraft.cost}</b><span>费用</span></div>
        <div><b>{statsDraft.cacheHit}%</b><span>缓存命中</span></div>
      </div>
      <div className="plt-meter">
        <div className="plt-meter-bar" style={{ width: `${statsDraft.ctxPercent}%` }} />
        <span>上下文 {statsDraft.ctxPercent}%</span>
      </div>
      <div className="plt-git-actions">
        <button className="plt-btn">导出会话</button>
        <button className="plt-btn ghost">查看明细</button>
      </div>
    </div>
  );
}

