"use client";
import { useState } from "react";
import {
  useHistoryRows, useGrouped, useExpand, GroupModeSwitch,
  dayLabel, dayTokens, dayCost, dayCacheHitRate, fmtTokens, fmtCount, fmtClock, fmtClockFull, fmtCost, fullTime,
  SessionStatsView, type GroupMode, type HistoryRow,
} from "./shared";

/**
 * 变体 B —— 时间线扁平（面向人）
 * 核心：时间线是主框架（Git log 思路，人的工作路径），时间列最前。
 * - 按天模式：天内严格时间线（升序，不按工作区分组），项目用 chip 标识——
 *   交替并行工作（项目 A 等响应时切项目 B）在时间线上自然呈现
 * - 按工作区模式：该项目的专属时间线（区内时间倒序，无 chip）
 */
export default function VariantB() {
  const rows = useHistoryRows();
  const [mode, setMode] = useState<GroupMode>("day");
  const grouped = useGrouped(rows, mode, true);
  const { expandedId, toggle } = useExpand();

  return (
    <div className="hp-body">
      <GroupModeSwitch mode={mode} onMode={setMode} />
      {!rows && <div className="hp-note">加载会话…</div>}
      {grouped && mode === "day" && (
        <div className="hp-flat">
          {(grouped as ReturnType<typeof import("./shared").groupByDayFlat>).map((day) => (
            <div key={day.key} className="hp-day">
              <div className="hp-day-head hp-day-head-flat">
                <span className="hp-day-label">{dayLabel(day.ts)}</span>
                <span className="hp-day-meta">
                  {day.rows.length} 个会话 · {fmtTokens(dayTokens(day.rows))} tokens
                  {dayCost(day.rows) > 0 && <> · <span className="hp-day-cost">{fmtCost(dayCost(day.rows))}</span></>}
                  {dayCacheHitRate(day.rows) !== null && <> · <span className="hp-day-hit">缓存命中 {dayCacheHitRate(day.rows)!.toFixed(1)}%</span></>}
                </span>
              </div>
              <div className="hp-ws-flat">
                {day.rows.map((r) => <RowB key={r.id} row={r} open={expandedId === r.id} onToggle={toggle} showWorkspace />)}
              </div>
            </div>
          ))}
        </div>
      )}
      {grouped && mode === "workspace" && (
        <div className="hp-flat">
          {(grouped as ReturnType<typeof import("./shared").groupByWorkspace>).map((ws) => (
            <div key={ws.name} className="hp-day">
              <div className="hp-day-head hp-day-head-flat">
                <span className="hp-day-label" title={ws.rows[0]?.cwd}>{ws.name}</span>
                <span className="hp-day-meta">
                  {ws.rows.length} 个会话 · {fmtTokens(dayTokens(ws.rows))} tokens
                  {dayCost(ws.rows) > 0 && <> · <span className="hp-day-cost">{fmtCost(dayCost(ws.rows))}</span></>}
                  {dayCacheHitRate(ws.rows) !== null && <> · <span className="hp-day-hit">缓存命中 {dayCacheHitRate(ws.rows)!.toFixed(1)}%</span></>}
                </span>
              </div>
              <div className="hp-ws-flat">
                {ws.rows.map((r) => <RowB key={r.id} row={r} open={expandedId === r.id} onToggle={toggle} showDate />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RowB({ row, open, onToggle, showWorkspace, showDate }: { row: HistoryRow; open: boolean; onToggle: (id: string) => void; showWorkspace?: boolean; showDate?: boolean }) {
  return (
    <div className="hp-sess-b">
      {/* 行本身在展开时保持不变（时间/项目/标题/右侧信息不移动） */}
      <button type="button" className={open ? "hp-row-b hp-row-on" : "hp-row-b"} onClick={() => onToggle(row.id)}>
        <span className="hp-row-b-time" title={fullTime(row.ts)}>{showDate ? fmtClockFull(row.ts) : fmtClock(row.ts)}</span>
        {showWorkspace && <span className="hp-chip" title={row.cwd}>{row.workspace}</span>}
        <span className="hp-row-b-title">{row.title}</span>
        <span className="hp-row-b-right">
          {row.tokens > 0 && <span className="hp-row-b-tokens">{fmtTokens(row.tokens)}</span>}
          <span className="hp-row-b-count">{fmtCount(row.messages)}</span>
        </span>
      </button>
      {/* 详情在行正下方全宽展开，横向空间与行一致 */}
      {open && (
        <div className="hp-detail hp-detail-b">
          <SessionStatsView sessionId={row.id} />
        </div>
      )}
    </div>
  );
}
