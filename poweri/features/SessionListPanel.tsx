"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * PowerI 历史会话面板（F6）：全部会话可视化列表 + 点击下钻详情。
 * 数据源：
 *   /poweri/api/session-summaries  — 每会话 token/消息数（复用 usage 文件缓存）
 *   /api/sessions                  — 名称/日期等元数据
 *   /poweri/api/session-stats/[id] — 选中会话的离线统计（三栏 + 圆环）
 * 布局自适应：容器查询（见 poweri/styles/usage-panel.css），窄面板上下堆叠、
 * 宽容器横向多列。
 */

type SessionStats = {
  ok: boolean;
  stats?: {
    sessionName?: string;
    sessionFile?: string;
    sessionId: string;
    userMessages: number;
    assistantMessages: number;
    toolCalls: number;
    toolResults: number;
    totalMessages: number;
    tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
    cost: number;
    contextUsage?: { percent: number | null; contextWindow: number };
    totalActiveMs?: number;
  };
  error?: string;
};

type Row = { id: string; name: string; created: string; messages: number; tokens: number };

function fmtDuration(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function fmtNum(n: number | undefined): string {
  return (n ?? 0).toLocaleString("zh-CN");
}

function fmtCompact(n: number | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
}

function StatRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="poweri-stats-row">
      <span className="poweri-stats-label">{label}</span>
      <span className={mono ? "poweri-stats-value" : "poweri-stats-value poweri-stats-value-plain"}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="poweri-stats-sec">
      <div className="poweri-stats-title">{title}</div>
      {children}
    </div>
  );
}

const DONUT_COLORS = ["#4f9cf9", "#9c6ef9", "#f9a84f", "#4fd1a0", "#e06c75", "#5ac8fa"];

function Donut({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: Array<{ label: string; value: number }>;
  centerValue: string;
  centerLabel: string;
}) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  const C = 2 * Math.PI * 36;
  let acc = 0;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label={centerLabel}>
      <circle cx="48" cy="48" r="36" fill="none" style={{ stroke: "var(--bg-subtle)" }} strokeWidth="13" />
      {segments.map((seg, i) => {
        const frac = seg.value / total;
        if (frac <= 0) return null;
        const dash = frac * C;
        const offset = -acc * C;
        acc += frac;
        return (
          <circle
            key={seg.label}
            cx="48"
            cy="48"
            r="36"
            fill="none"
            style={{ stroke: DONUT_COLORS[i % DONUT_COLORS.length] }}
            strokeWidth="13"
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={offset}
            transform="rotate(-90 48 48)"
          />
        );
      })}
      <text x="48" y="46" textAnchor="middle" style={{ fill: "var(--text)", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {centerValue}
      </text>
      <text x="48" y="60" textAnchor="middle" style={{ fill: "var(--text-dim)", fontSize: 9 }}>
        {centerLabel}
      </text>
    </svg>
  );
}

function DonutList({ items }: { items: Array<{ label: string; value: string; share: number }> }) {
  return (
    <div className="poweri-donut-list">
      {items.map((it, i) => (
        <div key={it.label} className="poweri-donut-row">
          <span className="poweri-donut-dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
          <span className="poweri-donut-label">{it.label}</span>
          <span className="poweri-donut-value">{it.value}</span>
          <span className="poweri-donut-share">{it.share > 0 ? `${it.share.toFixed(1)}%` : ""}</span>
        </div>
      ))}
    </div>
  );
}

function SessionDetail({ stats }: { stats: NonNullable<SessionStats["stats"]> }) {
  const st = stats;
  const ctx = st.contextUsage;
  const hitDenom = (st.tokens?.cacheRead ?? 0) + (st.tokens?.cacheWrite ?? 0) + (st.tokens?.input ?? 0);
  const cacheHitRate =
    (st.tokens?.cacheRead ?? 0) + (st.tokens?.cacheWrite ?? 0) > 0 && hitDenom > 0
      ? ((st.tokens!.cacheRead / hitDenom) * 100).toFixed(1)
      : null;
  const msgTotal = Math.max(1, (st.userMessages ?? 0) + (st.assistantMessages ?? 0) + (st.toolCalls ?? 0) + (st.toolResults ?? 0));
  const tkTotal = Math.max(1, (st.tokens?.input ?? 0) + (st.tokens?.output ?? 0) + (st.tokens?.cacheRead ?? 0) + (st.tokens?.cacheWrite ?? 0));
  const msgNums = [
    { label: "用户", value: st.userMessages },
    { label: "助手", value: st.assistantMessages },
    { label: "工具调用", value: st.toolCalls },
    { label: "工具结果", value: st.toolResults },
  ];
  const tkNums = [
    { label: "输入", value: st.tokens?.input ?? 0 },
    { label: "输出", value: st.tokens?.output ?? 0 },
    { label: "缓存读取", value: st.tokens?.cacheRead ?? 0 },
    { label: "缓存写入", value: st.tokens?.cacheWrite ?? 0 },
  ];
  const msgItems = msgNums.map((x) => ({ ...x, value: fmtNum(x.value), share: (x.value / msgTotal) * 100 }));
  const tkItems = tkNums.map((x) => ({ ...x, value: fmtNum(x.value), share: (x.value / tkTotal) * 100 }));

  return (
    <div className="poweri-stats-detail">
      <Section title="会话信息">
        {st.sessionName && <StatRow label="名称" value={st.sessionName} />}
        <StatRow label="文件" value={st.sessionFile ?? "（内存中）"} />
        <StatRow label="ID" value={st.sessionId} />
        {st.totalActiveMs ? <StatRow label="活跃时长" value={fmtDuration(st.totalActiveMs)} /> : null}
      </Section>
      {/* 消息/Token 圆环并排横放（以人为本：缩小可视区高度，减轻竖向压力） */}
      <div className="poweri-stats-donut-pair">
        <Section title="消息">
          <div className="poweri-donut-wrap">
            <Donut segments={msgNums} centerValue={fmtNum(st.totalMessages)} centerLabel="总计" />
            <DonutList items={msgItems} />
          </div>
        </Section>
        <Section title="Token">
          <div className="poweri-donut-wrap">
            <Donut segments={tkNums} centerValue={fmtTokens(st.tokens?.total ?? 0)} centerLabel="总计" />
            <DonutList items={tkItems} />
          </div>
          {(st.cost > 0 || ctx?.contextWindow || cacheHitRate !== null) && (
            <div className="poweri-token-extras">
              {st.cost > 0 && <StatRow label="费用" value={`$${st.cost.toFixed(4)}`} />}
              {ctx?.contextWindow ? (
                <StatRow label="上下文" value={`${ctx.percent !== null ? `${ctx.percent.toFixed(1)}%` : "?"} / ${fmtCompact(ctx.contextWindow)}`} />
              ) : null}
              {cacheHitRate !== null && <StatRow label="平均缓存命中率" value={`${cacheHitRate}%`} />}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

/** 单个会话的离线统计详情（含圆环）；供历史会话行展开与当前会话 tab 复用。 */
export function SessionStatsView({ sessionId }: { sessionId: string }) {
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setStats(null);
    fetch(`/poweri/api/session-stats/${encodeURIComponent(sessionId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: SessionStats) => {
        if (!alive) return;
        setStats(d);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setStats({ ok: false, error: "加载失败" });
        setLoading(false);
      });
    return () => { alive = false; };
  }, [sessionId]);

  return (
    <div>
      {loading && <div className="poweri-hint">加载会话信息…</div>}
      {stats?.error && <div className="poweri-hint poweri-hint-err">{stats.error}</div>}
      {stats?.stats && <SessionDetail stats={stats.stats} />}
    </div>
  );
}

export function SessionListPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        for (const s of sum.sessions ?? []) {
          tokensBy.set(s.sessionId, s.tokens);
          msgsBy.set(s.sessionId, s.messages);
        }
        const meta = new Map<string, { id: string; name?: string; created: string; firstMessage: string; messageCount: number }>(
          (list.sessions ?? []).map((x: { id: string; name?: string; created: string; firstMessage: string; messageCount: number }) => [x.id, x]),
        );
        const merged: Row[] = Array.from(tokensBy.keys()).map((id) => ({
          id,
          name: meta.get(id)?.name || meta.get(id)?.firstMessage || id,
          created: meta.get(id)?.created ?? "",
          messages: msgsBy.get(id) ?? 0,
          tokens: tokensBy.get(id) ?? 0,
        }));
        // 无 usage 数据的会话（旧/压缩）追加在尾部
        for (const m of meta.values()) {
          if (!tokensBy.has(m.id)) merged.push({ id: m.id, name: m.name || m.firstMessage || m.id, created: m.created, messages: m.messageCount, tokens: 0 });
        }
        setRows(merged.sort((a, b) => b.tokens - a.tokens));
      })
      .catch(() => setRows([]));
    return () => { alive = false; };
  }, []);

  const toggleExpand = useCallback(
    (id: string) => {
      setExpandedId((cur) => (cur === id ? null : id));
    },
    [],
  );

  const maxTokens = Math.max(...(rows ?? []).map((r) => r.tokens), 1);

  return (
    <div className="poweri-sess-scroll">
      <div className="poweri-hint">全部会话（{rows?.length ?? "…"} 个）· 点击查看详情</div>
      {(rows ?? []).map((row) => (
        <div key={row.id}>
          <button
            type="button"
            className={expandedId === row.id ? "poweri-sess-item poweri-sess-item-on" : "poweri-sess-item"}
            onClick={() => toggleExpand(row.id)}
          >
            <div className="poweri-sess-top">
              <span className="poweri-sess-name">{row.name.slice(0, 40)}</span>
              <span className="poweri-sess-tokens">{row.tokens > 0 ? fmtTokens(row.tokens) : "—"}</span>
            </div>
            <div className="poweri-sess-meta">
              {row.created ? new Date(row.created).toLocaleDateString("zh-CN") : ""} · {row.messages} 条消息
            </div>
            <div className="poweri-sess-bar-track">
              <div className="poweri-sess-bar" style={{ width: `${Math.max(2, (row.tokens / maxTokens) * 100)}%` }} />
            </div>
          </button>
          {expandedId === row.id && (
            <div className="poweri-sess-detail">
              <SessionStatsView sessionId={row.id} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
