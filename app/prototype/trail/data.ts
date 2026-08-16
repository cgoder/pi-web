// PROTOTYPE — mock activity-trail data for the F2 trail prototype.
// Segment model mirrors what the official SSE surface can produce:
// thinking (delta stream) / tool (tool_execution_start|update|end) /
// answer (message delta). Times are relative ms within the run.

export type TrailSegment =
  | { kind: "thinking"; id: string; summary: string; durationMs: number; status: "done" | "live" }
  | { kind: "tool"; id: string; name: string; argSummary: string; durationMs: number; status: "done" | "failed" | "live"; resultPreview?: string }
  | { kind: "answer"; id: string; preview: string; durationMs: number; chars: number; status: "done" | "live" };

export interface TrailTurn {
  id: string;
  userText: string;
  time: string;
  totalMs: number;
  segments: TrailSegment[];
}

export const trail: TrailTurn[] = [
  {
    id: "t1",
    userText: "帮我看一下 Codex 式三栏布局在 pi-web 上怎么落地，先做个原型",
    time: "14:02:11",
    totalMs: 18400,
    segments: [
      { kind: "thinking", id: "t1k1", summary: "分析官方 AppShell 布局结构，规划变体方案", durationMs: 3200, status: "done" },
      { kind: "tool", id: "t1b1", name: "read", argSummary: "components/AppShell.tsx（前 300 行）", durationMs: 1100, status: "done", resultPreview: "根 div：display flex + height 100dvh，左栏 #session-sidebar …" },
      { kind: "tool", id: "t1b2", name: "read", argSummary: "components/SessionSidebar.tsx（会话树区）", durationMs: 900, status: "done", resultPreview: "Header（标题+新会话）→ 会话列表 flex:1 → FileExplorer 区 …" },
      { kind: "tool", id: "t1b3", name: "bash", argSummary: "wc -l components/*.tsx", durationMs: 600, status: "done", resultPreview: "AppShell 2275 · SessionSidebar 2309 · ChatWindow 1339" },
      { kind: "thinking", id: "t1k2", summary: "对照 PiDeck 三栏细节，确定三个变体的结构差异", durationMs: 2100, status: "done" },
      { kind: "answer", id: "t1a1", preview: "好的。参考 PiDeck 的三栏方案，我先产出三个结构变体供讨论：1. Codex 三栏（会话树|对话|右抽屉）…", durationMs: 8400, chars: 412, status: "done" },
    ],
  },
  {
    id: "t2",
    userText: "右侧抽屉你觉得放什么合适？GitPanel 还是上下文/统计？",
    time: "14:04:37",
    totalMs: 9600,
    segments: [
      { kind: "thinking", id: "t2k1", summary: "权衡 Git 面板与统计面板的常驻价值", durationMs: 2600, status: "done" },
      { kind: "tool", id: "t2b1", name: "grep", argSummary: "useResizablePanel 常量（lib/panel-layout.ts）", durationMs: 700, status: "done", resultPreview: "260/180/480 · 560/300/1200" },
      { kind: "answer", id: "t2a1", preview: "建议抽屉默认放 GitPanel：它是高频操作（提交/冲突处理需要盯着文件状态），统计是低频查看…", durationMs: 5100, chars: 268, status: "done" },
    ],
  },
  {
    id: "t3",
    userText: "好，那做吧。宽度记忆要注意 SSR 陷阱。",
    time: "14:05:20",
    totalMs: 2600,
    segments: [
      { kind: "thinking", id: "t3k1", summary: "计划原型文件结构：page + switcher + 三变体 + shared", durationMs: 1200, status: "done" },
      { kind: "tool", id: "t3b1", name: "write", argSummary: "app/prototype/layout/page.tsx", durationMs: 500, status: "done", resultPreview: "ok · 1.2KB" },
      { kind: "tool", id: "t3b2", name: "write", argSummary: "app/prototype/layout/variant-a.tsx", durationMs: 400, status: "done", resultPreview: "ok · 5.7KB" },
      { kind: "tool", id: "t3b3", name: "write", argSummary: "app/prototype/layout/shared.tsx", durationMs: 350, status: "done", resultPreview: "ok · 6.6KB" },
      { kind: "answer", id: "t3a1", preview: "已建好骨架，正在逐个写变体组件…", durationMs: 150, chars: 42, status: "live" },
    ],
  },
];
