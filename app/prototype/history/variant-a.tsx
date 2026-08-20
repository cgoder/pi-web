"use client";
import { useState } from "react";
import {
  useHistoryRows, useGrouped, useExpand, GroupModeSwitch,
  dayLabel, dayTokens, fmtTokens, fmtCount, fmtClock, fullTime,
  SessionStatsView, type GroupMode, type HistoryRow,
} from "./shared";

/**
 * 变体 A —— 两行式 · 时间线树
 * 三级层级：天头（今天 · N 会话 · tokens 小计）→ 工作区头（项目名）→ 会话行
 * 会话行两行式：标题（1行截断）+ 元信息行（时钟 · 消息数 · tokens）+ 弱化 token 条
 */
export default function VariantA() {
  const rows = useHistoryRows();
  const [mode, setMode] = useState<GroupMode>("day");
  const grouped = useGrouped(rows, mode);
  const { expandedId, toggle } = useExpand();

  return (
    <div className="hp-body">
      <GroupModeSwitch mode={mode} onMode={setMode} />
      {!rows && <div className="hp-note">加载会话…</div>}
      {grouped && mode === "day" && (
        <div className="hp-timeline">
          {(grouped as ReturnType<typeof import("./shared").groupByDay>).map((day) => (
            <div key={day.key} className="hp-day">
              <div className="hp-day-head">
                <span className="hp-day-label">{dayLabel(day.ts)}</span>
                <span className="hp-day-meta">
                  {day.workspaces.reduce((s, w) => s + w.rows.length, 0)} 个会话 · {fmtTokens(dayTokens(day.workspaces.flatMap((w) => w.rows)))} tokens
                </span>
              </div>
              {day.workspaces.map((ws) => (
                <div key={ws.name} className="hp-ws">
                  <div className="hp-ws-head" title={ws.rows[0]?.cwd ?? ws.name}>
                    <span className="hp-ws-name">{ws.name}</span>
                    <span className="hp-ws-count">{ws.rows.length}</span>
                  </div>
                  {ws.rows.map((r) => <RowA key={r.id} row={r} open={expandedId === r.id} onToggle={toggle} />)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {grouped && mode === "workspace" && (
        <div className="hp-timeline">
          {(grouped as ReturnType<typeof import("./shared").groupByWorkspace>).map((ws) => (
            <div key={ws.name} className="hp-day">
              <div className="hp-day-head">
                <span className="hp-day-label" title={ws.rows[0]?.cwd}>{ws.name}</span>
                <span className="hp-day-meta">{ws.rows.length} 个会话 · {fmtTokens(dayTokens(ws.rows))} tokens</span>
              </div>
              {ws.rows.map((r) => <RowA key={r.id} row={r} open={expandedId === r.id} onToggle={toggle} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RowA({ row, open, onToggle }: { row: HistoryRow; open: boolean; onToggle: (id: string) => void }) {
  return (
    <div className="hp-sess-a">
      <button type="button" className={open ? "hp-row-a hp-row-on" : "hp-row-a"} onClick={() => onToggle(row.id)}>
        <div className="hp-row-a-title" title={fullTime(row.ts)}>{row.title}</div>
        <div className="hp-row-a-meta">
          <span className="hp-row-a-time">{fmtClock(row.ts)}</span>
          <span className="hp-row-a-dot">·</span>
          <span>{fmtCount(row.messages)}</span>
          {row.tokens > 0 && (<><span className="hp-row-a-dot">·</span><span className="hp-row-a-tokens">{fmtTokens(row.tokens)}</span></>)}
        </div>
      </button>
      {open && (
        <div className="hp-detail">
          <SessionStatsView sessionId={row.id} />
        </div>
      )}
    </div>
  );
}
