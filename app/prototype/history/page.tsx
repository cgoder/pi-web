"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import VariantA from "./variant-a";
import VariantB from "./variant-b";
import PrototypeSwitcher from "./switcher";
// SessionStatsView 的详情样式（poweri-stats-*/poweri-donut-*）位于正式样式表
import "@/poweri/styles/usage-panel.css";
import "./history-prototype.css";

/**
 * 历史会话面板原型：分组模式（按天→工作区 | 按工作区→时间）× 标题样式 2 变体。
 * ?variant=A 两行式（标题+元信息行+token条） | ?variant=B 单行紧凑（右侧 tokens + hover 详情）
 */
function HistoryPrototype() {
  const sp = useSearchParams();
  const variant = sp.get("variant") ?? "A";
  return (
    <div className="hp-page">
      <div className="hp-header">
        <div className="hp-title">历史会话 · 原型</div>
        <div className="hp-note">页头切换分组模式（按天 | 按工作区）；底部条切换标题样式变体 A/B</div>
      </div>
      {variant === "A" ? <VariantA /> : <VariantB />}
      <PrototypeSwitcher
        variants={["A", "B"]}
        current={variant}
        labels={{ A: "两行式 · 时间线树", B: "单行紧凑 · 扁平" }}
      />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="hp-page hp-note">加载中…</div>}>
      <HistoryPrototype />
    </Suspense>
  );
}
