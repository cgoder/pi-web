"use client";

// PROTOTYPE — F2 trail prototype shared pieces.
// Icons, duration formatting, segment row, inspector, panel shell.

import { useState } from "react";
import type { TrailSegment, TrailTurn } from "./data";

export const fmtMs = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

export function SegIcon({ kind }: { kind: TrailSegment["kind"] }) {
  return (
    <span className={`ptl-seg-icon ${kind}`} title={kind}>
      {kind === "thinking" ? "✳" : kind === "tool" ? "⚒" : "✎"}
    </span>
  );
}

export function SegLabel({ s }: { s: TrailSegment }) {
  switch (s.kind) {
    case "thinking": return <span className="ptl-seg-name">思考</span>;
    case "tool": return <span className="ptl-seg-name mono">{s.name}</span>;
    case "answer": return <span className="ptl-seg-name">回答</span>;
  }
}

/* ---------- segment detail inspector ---------- */

export function Inspector({ seg, onClose }: { seg: TrailSegment | null; onClose: () => void }) {
  if (!seg) return <div className="ptl-inspector empty">点击段查看详情</div>;
  return (
    <div className="ptl-inspector">
      <div className="ptl-insp-head">
        <SegIcon kind={seg.kind} />
        <SegLabel s={seg} />
        <span className="ptl-insp-ms">{fmtMs(seg.durationMs)}</span>
        <button className="ptl-icon-btn" onClick={onClose}>✕</button>
      </div>
      {"argSummary" in seg && seg.kind === "tool" && (
        <div className="ptl-insp-row"><span className="ptl-insp-key">参数</span>{seg.argSummary}</div>
      )}
      {"resultPreview" in seg && seg.kind === "tool" && (
        <div className="ptl-insp-row"><span className="ptl-insp-key">结果</span><code className="ptl-insp-code">{seg.resultPreview}</code></div>
      )}
      {"preview" in seg && seg.kind === "answer" && (
        <div className="ptl-insp-row"><span className="ptl-insp-key">内容</span>{seg.preview}</div>
      )}
      {seg.kind === "thinking" && (
        <div className="ptl-insp-row"><span className="ptl-insp-key">摘要</span>{seg.summary}</div>
      )}
      {seg.status === "live" && <div className="ptl-live-badge">进行中…</div>}
    </div>
  );
}

/* ---------- panel shell (activity-bar panel context from F1) ---------- */

export function TrailPanelShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ptl-root">
      <div className="ptl-head">
        <span className="ptl-title">{title}</span>
        <span className="ptl-chip">3 turns · 30.6s</span>
      </div>
      {children}
    </div>
  );
}

/* ---------- per-turn expander (used by V1/V3) ---------- */

export function TurnExpander({ turn, renderSeg }: {
  turn: TrailTurn;
  renderSeg: (s: TrailSegment) => React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const live = turn.segments.some((s) => s.status === "live");
  return (
    <div className={`ptl-turn${open ? " open" : ""}`}>
      <div className="ptl-turn-head" onClick={() => setOpen(!open)}>
        <span className="ptl-turn-caret">{open ? "▾" : "▸"}</span>
        <span className="ptl-turn-user">{turn.userText.slice(0, 42)}{turn.userText.length > 42 ? "…" : ""}</span>
        {live && <span className="ptl-live-dot" />}
        <span className="ptl-turn-meta">{fmtMs(turn.totalMs)}</span>
      </div>
      {open && <div className="ptl-turn-body">{turn.segments.map(renderSeg)}</div>}
    </div>
  );
}
