"use client";

// PROTOTYPE — variant switcher for the F1 workspace-layout prototype.
// Floating bottom-centre pill; cycles ?variant= via router.replace.
// Follows prototype/UI.md spec: left/right arrows + label, keyboard ←/→,
// hidden when NODE_ENV === "production".

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { LAYOUT_VARIANTS } from "./variants";

export function PrototypeSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const mounted = useRef(false);

  const setVariant = useCallback(
    (key: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("variant", key);
      router.replace(`/prototype/layout?${next.toString()}`);
    },
    [params, router],
  );

  const cycle = useCallback(
    (dir: 1 | -1) => {
      const idx = LAYOUT_VARIANTS.findIndex((v) => v.key === current);
      const next = (idx + dir + LAYOUT_VARIANTS.length) % LAYOUT_VARIANTS.length;
      setVariant(LAYOUT_VARIANTS[next].key);
    },
    [current, setVariant],
  );

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); cycle(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); cycle(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle]);

  if (process.env.NODE_ENV === "production") return null;

  const label = LAYOUT_VARIANTS.find((v) => v.key === current) ?? LAYOUT_VARIANTS[0];

  return (
    <div style={{
      position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, display: "flex", alignItems: "center", gap: 10,
      background: "rgba(20,20,24,0.92)", border: "1px solid #444", borderRadius: 999,
      padding: "6px 14px", color: "#eee", font: "12px/1 system-ui, sans-serif",
      boxShadow: "0 4px 20px rgba(0,0,0,0.4)", userSelect: "none",
    }}>
      <button onClick={() => cycle(-1)} aria-label="上一个变体" style={btnStyle}>←</button>
      <span style={{ minWidth: 90, textAlign: "center", fontWeight: 600 }}>
        {current} — {label.name}
      </span>
      <button onClick={() => cycle(1)} aria-label="下一个变体" style={btnStyle}>→</button>
      <span style={{ opacity: 0.5, marginLeft: 6 }}>F1 布局原型 · mock 数据</span>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "transparent", border: "none", color: "#eee",
  fontSize: 14, cursor: "pointer", padding: "2px 8px", borderRadius: 6,
};
