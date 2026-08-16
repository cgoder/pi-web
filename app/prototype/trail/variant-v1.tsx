"use client";

// PROTOTYPE — V1: 折叠账本（turn 聚合列表）。
// 最贴近官方现状的增量形态：每 turn 一个可展开账本，段按时间纵向排列。
// 与现有消息流的关系：官方 MessageView 已有 thinking 块/toolCall 卡片 →
// 本面板是同数据的"侧视视图"，不替换流式渲染（打字机效果不受影响）。
// 对应官方事件：thinking 增量 / tool_execution_start|update|end / message delta。

import { useState } from "react";
import { trail, type TrailSegment } from "./data";
import { fmtMs, SegIcon, SegLabel, Inspector, TrailPanelShell, TurnExpander } from "./shared";

export function TrailV1() {
  const [inspected, setInspected] = useState<TrailSegment | null>(null);
  return (
    <TrailPanelShell title="活动轨迹 · 账本">
      <div className="ptl-scroll">
        {trail.map((turn) => (
          <TurnExpander key={turn.id} turn={turn}
            renderSeg={(s) => (
              <div key={s.id} className={`ptl-seg ${s.status}`} onClick={() => setInspected(s)}>
                <SegIcon kind={s.kind} />
                <div className="ptl-seg-main">
                  <div className="ptl-seg-line">
                    <SegLabel s={s} />
                    {"summary" in s && s.kind === "thinking" && <span className="ptl-seg-sum">{s.summary}</span>}
                    {"argSummary" in s && s.kind === "tool" && <span className="ptl-seg-sum">{s.argSummary}</span>}
                    {"preview" in s && s.kind === "answer" && <span className="ptl-seg-sum">{s.preview.slice(0, 36)}…</span>}
                  </div>
                </div>
                <span className="ptl-seg-ms">{fmtMs(s.durationMs)}</span>
                {s.status === "live" && <span className="ptl-live-dot" />}
              </div>
            )}
          />
        ))}
      </div>
      <Inspector seg={inspected} onClose={() => setInspected(null)} />
    </TrailPanelShell>
  );
}
