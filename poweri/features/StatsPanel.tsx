"use client";
import { useState } from "react";
import { UsagePanel } from "@/poweri/features/UsagePanel";
import { SessionListPanel } from "@/poweri/features/SessionListPanel";

/**
 * PowerI 统计面板（F6）：全局统计 | 历史会话 双视图。
 * 容器自适应布局（窄→上下堆叠，宽→横向多列），样式见 usage-panel.css。
 */
export function StatsPanel() {
  const [view, setView] = useState<"global" | "history">("global");
  return (
    <div className="poweri-stats-panel">
      <div className="poweri-stats-tabs">
        <button
          type="button"
          className={view === "global" ? "poweri-stats-tab poweri-stats-tab-on" : "poweri-stats-tab"}
          onClick={() => setView("global")}
        >
          全局统计
        </button>
        <button
          type="button"
          className={view === "history" ? "poweri-stats-tab poweri-stats-tab-on" : "poweri-stats-tab"}
          onClick={() => setView("history")}
        >
          历史会话
        </button>
      </div>
      {view === "global" ? <UsagePanel /> : <SessionListPanel />}
    </div>
  );
}
