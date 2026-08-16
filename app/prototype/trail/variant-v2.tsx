"use client";

// PROTOTYPE — V2: 车道时间线（PiDeck 式）。
// 横向时间轴 + 三车道（思考/工具/回答），段块宽度∝时长，时间定位精确；
// 点击块 → inspector。live 段以动画边框表示（对应流式期间的实时追加）。
// 与 V1 是同一份数据的不同投影——讨论点：时间线 vs 账本的取舍。

import { useMemo, useState } from "react";
import { trail, type TrailSegment } from "./data";
import { fmtMs, Inspector, TrailPanelShell } from "./shared";

const LANES = [
  { key: "thinking", label: "思考" },
  { key: "tool", label: "工具" },
  { key: "answer", label: "回答" },
] as const;
type LaneKey = (typeof LANES)[number]["key"];

const LANE_COLOR: Record<LaneKey, string> = {
  thinking: "#8b7fd6",
  tool: "#d6a35c",
  answer: "#4caf7d",
};

export function TrailV2() {
  const [inspected, setInspected] = useState<TrailSegment | null>(null);

  const totalMs = useMemo(() => trail.reduce((a, t) => a + t.totalMs, 0), []);
  const segments = useMemo(() => {
    const out: { seg: TrailSegment; turnId: string; offset: number; lane: LaneKey }[] = [];
    let tOff = 0;
    for (const turn of trail) {
      let sOff = tOff;
      for (const seg of turn.segments) {
        out.push({ seg, turnId: turn.id, offset: sOff, lane: seg.kind });
        sOff += seg.durationMs;
      }
      tOff += turn.totalMs;
    }
    return out;
  }, []);

  return (
    <TrailPanelShell title="活动轨迹 · 时间线">
      <div className="ptl-scroll">
        {/* ruler */}
        <div className="ptl-ruler">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <span key={f} className="ptl-ruler-tick" style={{ left: `${f * 100}%` }}>
              {fmtMs(totalMs * f)}
            </span>
          ))}
        </div>
        {/* lanes */}
        <div className="ptl-lanes">
          {LANES.map((lane) => (
            <div key={lane.key} className="ptl-lane" style={{ "--ptl-lane": LANE_COLOR[lane.key] } as React.CSSProperties}>
              <span className="ptl-lane-label">{lane.label}</span>
              <div className="ptl-lane-track">
                {segments.filter((s) => s.lane === lane.key).map(({ seg, offset, turnId }) => (
                  <div
                    key={seg.id}
                    className={`ptl-block ${seg.status}${inspected?.id === seg.id ? " inspected" : ""}`}
                    style={{
                      left: `${(offset / totalMs) * 100}%`,
                      width: `${Math.max((seg.durationMs / totalMs) * 100, 1.2)}%`,
                      background: LANE_COLOR[lane.key],
                    }}
                    onClick={() => setInspected(seg)}
                    title={`${turnId} · ${fmtMs(seg.durationMs)}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* turn boundaries */}
        <div className="ptl-turns">
          {trail.map((t, i) => {
            const off = trail.slice(0, i).reduce((a, x) => a + x.totalMs, 0);
            return (
              <div key={t.id} className="ptl-turn-mark" style={{ left: `${(off / totalMs) * 100}%` }}>
                T{i + 1}
              </div>
            );
          })}
        </div>
      </div>
      <Inspector seg={inspected} onClose={() => setInspected(null)} />
    </TrailPanelShell>
  );
}
