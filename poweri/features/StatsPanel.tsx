"use client";
import { useEffect, useState } from "react";
import { UsagePanel } from "@/poweri/features/UsagePanel";
import { SessionListPanel, SessionStatsView } from "@/poweri/features/SessionListPanel";

/**
 * PowerI 统计面板（F6）：上下文感知双/三视图。
 * - 当前打开着某 session（sessionId 非空）：默认展示「当前会话」统计详情，
 *   tab 顺序为 当前会话 | 历史会话 | 全局统计
 * - 未打开 session：仅 历史会话 | 全局统计
 * 容器自适应布局（窄→上下堆叠，宽→横向多列），样式见 usage-panel.css。
 */
type View = "session" | "history" | "global";

export function StatsPanel({ sessionId }: { sessionId: string | null }) {
  const [view, setView] = useState<View>(sessionId ? "session" : "history");

  // 当前会话消失（关闭 session）时回退到历史会话视图
  useEffect(() => {
    if (!sessionId && view === "session") setView("history");
  }, [sessionId, view]);

  const tabs: Array<{ id: View; label: string }> = sessionId
    ? [
        { id: "session", label: "当前会话" },
        { id: "history", label: "历史会话" },
        { id: "global", label: "全局统计" },
      ]
    : [
        { id: "history", label: "历史会话" },
        { id: "global", label: "全局统计" },
      ];

  return (
    <div className="poweri-stats-panel">
      <div className="poweri-stats-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={view === t.id ? "poweri-stats-tab poweri-stats-tab-on" : "poweri-stats-tab"}
            onClick={() => setView(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {view === "session" && sessionId ? (
        <div className="poweri-sess-scroll">
          <SessionStatsView sessionId={sessionId} />
        </div>
      ) : view === "history" ? (
        <SessionListPanel />
      ) : (
        <UsagePanel />
      )}
    </div>
  );
}
