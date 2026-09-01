// PowerI 正式实现（工单 05 拍板：变体 A 最小侵入）：源级更新条。
// 每个订阅源一个 chip：N 技能 · M 可更新 + 更新全部；同步失败显示 ⚠（悬停看错误）。
// 批量动作只在源级，技能行只留 badge（见 SkillsMarketView 卡片）。
"use client";

import type { MarketSourceStat } from "@/poweri/lib/skill-subscriptions";

interface Props {
  sources: MarketSourceStat[];
  busy: boolean;
  onApplySource: (subscriptionId: string) => Promise<void>;
}

export function SkillUpdateBar({ sources, busy, onApplySource }: Props) {
  const relevant = sources.filter((s) => s.outdated > 0 || s.conflict > 0 || s.error);
  if (relevant.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 18px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-panel)",
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" }}>技能更新</span>
      {relevant.map((src) => (
        <div
          key={src.subscriptionId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px 3px 12px",
            fontSize: 11,
            borderRadius: 16,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 500 }}>{src.name}</span>
          <span style={{ color: "var(--text-dim)" }}>
            {src.total} 技能
            {src.outdated > 0 && <span style={{ color: "#f59e0b" }}> · {src.outdated} 可更新</span>}
            {src.conflict > 0 && <span style={{ color: "#ef4444" }}> · {src.conflict} 冲突</span>}
          </span>
          {src.error && (
            <span title={src.error} style={{ color: "#ef4444", fontSize: 12, cursor: "help" }}>
              ⚠
            </span>
          )}
          {src.outdated > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onApplySource(src.subscriptionId)}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 10,
                border: "1px solid #f59e0b",
                background: "rgba(245, 158, 11, 0.12)",
                color: "#f59e0b",
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              更新全部
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
