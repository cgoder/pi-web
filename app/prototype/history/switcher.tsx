"use client";
import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 原型浮动切换条：底部居中，左/右箭头循环切换 ?variant=，键盘 ←/→ 支持（输入框聚焦时不拦截）。
 */
export default function PrototypeSwitcher({
  variants,
  current,
  labels,
}: {
  variants: string[];
  current: string;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const go = useCallback(
    (dir: 1 | -1) => {
      const i = variants.indexOf(current);
      const next = variants[(i + dir + variants.length) % variants.length];
      const url = new URL(window.location.href);
      url.searchParams.set("variant", next);
      router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
    },
    [variants, current, router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="hp-switcher">
      <button type="button" className="hp-switcher-btn" onClick={() => go(-1)} aria-label="上一个变体">‹</button>
      <span className="hp-switcher-label">{current} — {labels[current] ?? current}</span>
      <button type="button" className="hp-switcher-btn" onClick={() => go(1)} aria-label="下一个变体">›</button>
    </div>
  );
}
