// PROTOTYPE — variant registry for the F1 layout prototype.
// Plain module (no "use client") so both the RSC page and the client
// switcher can import it.

export const LAYOUT_VARIANTS = [
  { key: "A", name: "Codex 三栏" },
  { key: "B", name: "官方增量" },
  { key: "C", name: "活动栏式" },
] as const;
