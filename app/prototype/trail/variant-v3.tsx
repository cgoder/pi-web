"use client";

// PROTOTYPE — V3: 概览 + 明细两级（会话报告 → 下钻）。
// 上半：聚合统计（总耗时/思考占比/工具次数/字数）→ 一眼看"这轮 agent 干了啥"；
// 下半：turn 账本 + 内嵌迷你时间线条（turn 内段的相对占比）。
// 与 V1/V2 的区别：信息层级优先（先概要后细节），适合长会话复盘。

import { useMemo, useState } from "react";
import { trail, type TrailSegment } from "./data";
import { fmtMs, SegIcon, Inspector, TrailPanelShell, TurnExpander } from "./shared";

export function TrailV3() {
  const [inspected, setInspected] = useState<TrailSegment | null>(null);

  const agg = useMemo(() => {
    let think = 0, tools = 0, answerMs = 0, chars = 0, total = 0;
    for (const t of trail) {
      total += t.totalMs;
      for (const s of t.segments) {
        if (s.kind === "thinking") think += s.durationMs;
        if (s.kind === "tool") tools++;
        if (s.kind === "answer") { answerMs += s.durationMs; chars += s.chars; }
      }
    }
    return { total, thinkPct: Math.round((think / total) * 100), tools, chars, answerMs };
  }, []);

  return (
    <TrailPanelShell title="活动轨迹 · 会话报告">
      <div className="ptl-scroll">
        {/* aggregate cards */}
        <div className="ptl-agg">
          <div className="ptl-agg-card"><b>{fmtMs(agg.total)}</b><span>总耗时</span></div>
          <div className="ptl-agg-card"><b>{agg.thinkPct}%</b><span>思考占比</span></div>
          <div className="ptl-agg-card"><b>{agg.tools}</b><span>工具调用</span></div>
          <div className="ptl-agg-card"><b>{agg.chars}</b><span>回答字数</span></div>
        </div>
        <div className="ptl-agg-bar" title={`思考 ${agg.thinkPct}% · 回答 ${Math.round((agg.answerMs / agg.total) * 100)}%`}>
          <div className="ptl-agg-bar-think" style={{ width: `${agg.thinkPct}%` }} />
          <div className="ptl-agg-bar-answer" style={{ width: `${Math.round((agg.answerMs / agg.total) * 100)}%` }} />
        </div>
        <div className="ptl-agg-legend">
          <span><i className="dot think" />思考</span>
          <span><i className="dot answer" />回答</span>
          <span><i className="dot tool" />工具</span>
        </div>

        {/* drill-down turns */}
        {trail.map((turn) => {
          const tTotal = turn.totalMs;
          return (
            <div key={turn.id} className="ptl-drill">
              <TurnExpander turn={turn} renderSeg={(s) => (
                <div key={s.id} className={`ptl-seg ${s.status}`} onClick={() => setInspected(s)}>
                  <SegIcon kind={s.kind} />
                  <div className="ptl-seg-main">
                    <div className="ptl-seg-line">
                      {s.kind === "thinking" && <span className="ptl-seg-sum">{s.summary}</span>}
                      {s.kind === "tool" && <span className="ptl-seg-name mono">{s.name}</span>}
                      {s.kind === "answer" && <span className="ptl-seg-sum">{s.preview.slice(0, 40)}…</span>}
                    </div>
                    <div className="ptl-mini-track">
                      {turn.segments.map((x) => (
                        <i key={x.id} className={`ptl-mini-seg ${x.kind}${x.id === s.id ? " cur" : ""}`}
                          style={{ width: `${Math.max((x.durationMs / tTotal) * 100, 2)}%` }} />
                      ))}
                    </div>
                  </div>
                  <span className="ptl-seg-ms">{fmtMs(s.durationMs)}</span>
                </div>
              )} />
            </div>
          );
        })}
      </div>
      <Inspector seg={inspected} onClose={() => setInspected(null)} />
    </TrailPanelShell>
  );
}
