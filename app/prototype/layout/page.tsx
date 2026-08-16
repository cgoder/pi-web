// PROTOTYPE — F1 workspace-layout prototype.
// Three variants of the pi-web-desktop workspace shell, switchable via
// ?variant=A|B|C (default A). Mock data only; read-only; throwaway.
// Plan line: "三个工作区布局变体（Codex 三栏 / 官方增量 / 活动栏式），
// ?variant= 切换，挂在 /prototype/layout 路由，供 v0.2 F1 决策讨论。"

import { Suspense } from "react";
import { LAYOUT_VARIANTS } from "./variants";
import { PrototypeSwitcher } from "./switcher";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";
import "./layout-prototype.css";

export default function LayoutPrototypePage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  return (
    <Suspense fallback={<div className="plt-root" style={{ color: "var(--text)" }}>loading…</div>}>
      <LayoutPrototypeInner searchParams={searchParams} />
    </Suspense>
  );
}

async function LayoutPrototypeInner({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  const { variant } = await searchParams;
  const key = LAYOUT_VARIANTS.some((v) => v.key === variant) ? variant! : "A";
  return (
    <>
      {key === "A" && <VariantA />}
      {key === "B" && <VariantB />}
      {key === "C" && <VariantC />}
      <PrototypeSwitcher current={key} />
    </>
  );
}
