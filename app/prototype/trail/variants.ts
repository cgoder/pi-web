// PROTOTYPE — variant registry for the F2 trail prototype.
// Plain module (no "use client") so both the RSC page and the client
// switcher can import it.

export const TRAIL_VARIANTS = [
  { key: "1", name: "折叠账本" },
  { key: "2", name: "车道时间线" },
  { key: "3", name: "概览下钻" },
] as const;
