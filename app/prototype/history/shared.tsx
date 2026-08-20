"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SessionStatsView } from "@/poweri/features/SessionListPanel";

/** 历史会话行（合并 /api/sessions 元数据 + /poweri/api/session-summaries 用量） */
export type HistoryRow = {
  id: string;
  title: string;
  cwd: string;
  workspace: string; // basename
  ts: number; // created 时间戳
  messages: number;
  tokens: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

export type GroupMode = "day" | "workspace";

export function useHistoryRows(): HistoryRow[] | null {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/poweri/api/session-summaries", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/sessions", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([sum, list]) => {
        if (!alive) return;
        const tokensBy = new Map<string, number>();
        const msgsBy = new Map<string, number>();
        const sumBy = new Map<string, { input: number; cacheRead: number; cacheWrite: number; cost: number }>();
        for (const s of sum.sessions ?? []) {
          tokensBy.set(s.sessionId, s.tokens);
          msgsBy.set(s.sessionId, s.messages);
          sumBy.set(s.sessionId, { input: s.input ?? 0, cacheRead: s.cacheRead ?? 0, cacheWrite: s.cacheWrite ?? 0, cost: s.cost ?? 0 });
        }
        const meta = new Map<string, { id: string; cwd: string; name?: string; created: string; firstMessage: string; messageCount: number }>(
          (list.sessions ?? []).map((x: { id: string; cwd: string; name?: string; created: string; firstMessage: string; messageCount: number }) => [x.id, x]),
        );
        const merged: HistoryRow[] = Array.from(tokensBy.keys()).map((id) => {
          const m = meta.get(id);
          const sum = sumBy.get(id);
          return {
            id,
            title: m?.name || m?.firstMessage || id,
            cwd: m?.cwd ?? "",
            workspace: workspaceNameOf(m?.cwd ?? ""),
            ts: m?.created ? new Date(m.created).getTime() : 0,
            messages: msgsBy.get(id) ?? 0,
            tokens: tokensBy.get(id) ?? 0,
            input: sum?.input ?? 0,
            cacheRead: sum?.cacheRead ?? 0,
            cacheWrite: sum?.cacheWrite ?? 0,
            cost: sum?.cost ?? 0,
          };
        });
        // 无 usage 数据的会话（旧/压缩）追加
        for (const m of meta.values()) {
          if (!tokensBy.has(m.id)) {
            merged.push({
              id: m.id,
              title: m.name || m.firstMessage || m.id,
              cwd: m.cwd ?? "",
              workspace: workspaceNameOf(m.cwd ?? ""),
              ts: m.created ? new Date(m.created).getTime() : 0,
              messages: m.messageCount,
              tokens: 0,
              input: 0, cacheRead: 0, cacheWrite: 0, cost: 0,
            });
          }
        }
        setRows(merged.sort((a, b) => b.ts - a.ts));
      })
      .catch(() => setRows([]));
    return () => { alive = false; };
  }, []);
  return rows;
}

function workspaceNameOf(cwd: string): string {
  if (!cwd) return "(未知)";
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** 天标签：今天/昨天/8月18日 周二 */
export function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${week[d.getDay()]}`;
}

export const fmtTokens = (n: number): string => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
};

const fmtCount = (n: number): string => `${n.toLocaleString("zh-CN")} 条消息`;

const fmtClock = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** 跨天时间线用：今天 HH:MM / 昨天 HH:MM / M/D HH:MM */
export const fmtClockFull = (ts: number): string => {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  const hhmm = fmtClock(ts);
  if (diffDays === 0) return hhmm;
  if (diffDays === 1) return `昨天 ${hhmm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`;
};

/** 按天 → 工作区 → 会话（时间线瀑布流） */
export function groupByDay(rows: HistoryRow[]) {
  const days = new Map<string, { ts: number; workspaces: Map<string, HistoryRow[]> }>();
  for (const r of rows) {
    const k = dayKey(r.ts);
    let day = days.get(k);
    if (!day) { day = { ts: r.ts, workspaces: new Map() }; days.set(k, day); }
    let ws = day.workspaces.get(r.workspace);
    if (!ws) { ws = []; day.workspaces.set(r.workspace, ws); }
    ws.push(r);
  }
  const out = Array.from(days.entries())
    .sort((a, b) => b[1].ts - a[1].ts)
    .map(([key, day]) => ({
      key,
      ts: day.ts,
      workspaces: Array.from(day.workspaces.entries())
        .map(([name, list]) => ({ name, rows: list.sort((a, b) => b.ts - a.ts) }))
        .sort((a, b) => b.rows[0].ts - a.rows[0].ts),
    }));
  return out;
}

/**
 * 按天 → 天内扁平时间线（严格时间升序，不按工作区分组）。
 * 面向人：时间线是工作路径的主框架，项目用 chip 标识（交替并行工作场景）。
 */
export function groupByDayFlat(rows: HistoryRow[]) {
  const days = new Map<string, { ts: number; rows: HistoryRow[] }>();
  for (const r of rows) {
    const k = dayKey(r.ts);
    let day = days.get(k);
    if (!day) { day = { ts: r.ts, rows: [] }; days.set(k, day); }
    day.rows.push(r);
  }
  return Array.from(days.entries())
    .sort((a, b) => b[1].ts - a[1].ts)
    .map(([key, day]) => ({ key, ts: day.ts, rows: day.rows.sort((a, b) => a.ts - b.ts) }));
}

/** 按工作区 → 时间倒序 */
export function groupByWorkspace(rows: HistoryRow[]) {
  const map = new Map<string, HistoryRow[]>();
  for (const r of rows) {
    const list = map.get(r.workspace) ?? [];
    list.push(r);
    map.set(r.workspace, list);
  }
  return Array.from(map.entries())
    .map(([name, list]) => ({ name, rows: list.sort((a, b) => b.ts - a.ts), lastTs: Math.max(...list.map((r) => r.ts)) }))
    .sort((a, b) => b.lastTs - a.lastTs);
}

/** 天/工作区聚合信息 */
export const dayTokens = (rows: HistoryRow[]) => rows.reduce((s, r) => s + r.tokens, 0);

/** 天级费用合计 */
export const dayCost = (rows: HistoryRow[]) => rows.reduce((s, r) => s + r.cost, 0);

/** 天级缓存命中率：cacheRead / (input + cacheRead + cacheWrite) */
export function dayCacheHitRate(rows: HistoryRow[]): number | null {
  const input = rows.reduce((s, r) => s + r.input, 0);
  const read = rows.reduce((s, r) => s + r.cacheRead, 0);
  const write = rows.reduce((s, r) => s + r.cacheWrite, 0);
  const denom = input + read + write;
  if (denom <= 0) return null;
  return (read / denom) * 100;
}

export const fmtCost = (n: number): string => (n > 0 ? `$${n.toFixed(2)}` : "");

/** 分组模式切换（页头） */
export function GroupModeSwitch({ mode, onMode }: { mode: GroupMode; onMode: (m: GroupMode) => void }) {
  return (
    <div className="hp-mode">
      <button type="button" className={mode === "day" ? "hp-mode-btn hp-mode-on" : "hp-mode-btn"} onClick={() => onMode("day")}>
        按天
      </button>
      <button type="button" className={mode === "workspace" ? "hp-mode-btn hp-mode-on" : "hp-mode-btn"} onClick={() => onMode("workspace")}>
        按工作区
      </button>
    </div>
  );
}

/** 会话行展开详情（复用正式 SessionStatsView） */
export function useExpand() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggle = useCallback((id: string) => setExpandedId((cur) => (cur === id ? null : id)), []);
  return { expandedId, toggle };
}

export { SessionStatsView, fmtCount, fmtClock };

/** 行内时间元信息（tooltip 完整时间戳） */
export const fullTime = (ts: number): string => new Date(ts).toLocaleString("zh-CN");

export function useGrouped(rows: HistoryRow[] | null, mode: GroupMode, flatDay = false) {
  return useMemo(() => {
    if (!rows) return null;
    if (mode === "day") return flatDay ? groupByDayFlat(rows) : groupByDay(rows);
    return groupByWorkspace(rows);
  }, [rows, mode, flatDay]);
}
