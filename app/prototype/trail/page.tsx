// PROTOTYPE — F2 activity-trail prototype.
// Three variants of the trail panel, switchable via ?variant=1|2|3.
// Hosted in a minimal activity-bar shell (F1 variant C context): the
// trail panel is one of the activity panels, not a drawer.
// Plan line: "三个活动轨迹呈现变体（折叠账本/车道时间线/概览下钻），
// ?variant= 切换，挂在 /prototype/trail 路由，供 v0.2 F2 决策讨论。"

import { Suspense } from "react";
import { TRAIL_VARIANTS } from "./variants";
import { PrototypeSwitcher } from "./switcher";
import { TrailV1 } from "./variant-v1";
import { TrailV2 } from "./variant-v2";
import { TrailV3 } from "./variant-v3";
import "../layout/layout-prototype.css";
import "./trail-prototype.css";

export default function TrailPrototypePage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  return (
    <Suspense fallback={<div className="ptl-root" style={{ color: "var(--text)" }}>loading…</div>}>
      <TrailInner searchParams={searchParams} />
    </Suspense>
  );
}

async function TrailInner({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  const { variant } = await searchParams;
  const key = TRAIL_VARIANTS.some((v) => v.key === variant) ? variant! : "1";
  return (
    <div className="plt-root">
      <nav className="plt-activity">
        {["☰", "🗀", "◫"].map((ic, i) => (
          <button key={i} className={`plt-activity-btn${i === 2 ? " on" : ""}`}>{ic}</button>
        ))}
        <div className="grow" />
        <button className="plt-activity-btn">⚙</button>
      </nav>
      <div className="ptl-shell">
        {key === "1" && <TrailV1 />}
        {key === "2" && <TrailV2 />}
        {key === "3" && <TrailV3 />}
      </div>
      <PrototypeSwitcher current={key} />
    </div>
  );
}
